#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, xdr::ToXdr, Address, Bytes, BytesN, Env,
    String,
};

const DAY_IN_LEDGERS: u32 = 17_280;
const TTL_EXTEND_TO: u32 = 120 * DAY_IN_LEDGERS;
const TTL_THRESHOLD: u32 = TTL_EXTEND_TO - 30 * DAY_IN_LEDGERS;

/// Domain tag for activation signatures, so they cannot be replayed in another context.
/// Off-chain, the activation key seed is `sha256(ACTIVATION_DOMAIN || ":" || secret)`.
const ACTIVATION_DOMAIN: &[u8] = b"verifire-activation-v1";

/// Domain tag for transfer signatures. The owner's browser creates a random secret for each transfer link, and
/// `sha256(TRANSFER_DOMAIN || ":" || secret)` is the seed of the key registered by `offer_transfer`.
const TRANSFER_DOMAIN: &[u8] = b"verifire-transfer-v1";

/// A transfer link can be accepted for this long after the owner opens it.
pub const TRANSFER_LINK_SECONDS: u64 = 15 * 60;
/// After opening a link, the owner waits this long before opening another, even if the first one was cancelled or
/// expired. Must match TRANSFER_LINK_MS and TRANSFER_COOLDOWN_MS in src/lib/server/products.ts.
pub const TRANSFER_COOLDOWN_SECONDS: u64 = 5 * 60;

#[derive(Clone)]
#[contracttype]
pub struct Product {
    pub token_id: u64,
    pub public_code: String,
    pub model: String,
    pub lot: String,
    pub destination: String,
    /// Ed25519 public key derived from the secret inside the package. The secret itself
    /// never reaches the ledger, not even as a transaction argument.
    pub activation_key: BytesN<32>,
    pub owner: Option<Address>,
    pub claimed: bool,
    /// Ed25519 public key of the open transfer link, if the owner offered the product to someone else.
    pub transfer_key: Option<BytesN<32>>,
}

#[derive(Clone)]
#[contracttype]
enum DataKey {
    Admin,
    NextTokenId,
    Product(u64),
    TokenByCode(String),
    /// Ledger time after which the open transfer link of a product can no longer be accepted.
    TransferExpiry(u64),
    /// Ledger time when the owner last opened a transfer link for a product.
    LastTransferOffer(u64),
}

#[contract]
pub struct VerifireProduct;

fn admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| panic!("contract is not initialized"))
}

fn signed_message(env: &Env, domain: &[u8], token_id: u64, account: &Address) -> Bytes {
    let mut message = Bytes::from_slice(env, domain);
    message.append(&env.current_contract_address().to_xdr(env));
    message.extend_from_array(&token_id.to_be_bytes());
    message.append(&account.to_xdr(env));
    message
}

fn save_product(env: &Env, product: &Product) {
    save_persistent(env, &DataKey::Product(product.token_id), product);
    save_persistent(env, &DataKey::TokenByCode(product.public_code.clone()), &product.token_id);
    env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

/// The product, checking that `owner` holds it and authorized this call.
fn owned_product(env: &Env, token_id: u64, owner: &Address) -> Product {
    owner.require_auth();
    let product = VerifireProduct::get_product(env.clone(), token_id);
    if product.owner.as_ref() != Some(owner) {
        panic!("only the owner can transfer the product");
    }
    product
}

fn save_persistent<V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &DataKey, value: &V) {
    let storage = env.storage().persistent();
    storage.set(key, value);
    storage.extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

#[contractimpl]
impl VerifireProduct {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("contract already initialized");
        }

        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextTokenId, &1_u64);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    pub fn mint_product(
        env: Env,
        public_code: String,
        model: String,
        lot: String,
        destination: String,
        activation_key: BytesN<32>,
    ) -> u64 {
        admin(&env).require_auth();
        Self::insert_product(&env, public_code, model, lot, destination, activation_key, None)
    }

    /// Carries over a product whose warranty was already activated, keeping its owner. Used when products move to a
    /// new deployment of this contract; only the admin can attest the owner.
    pub fn import_claimed_product(
        env: Env,
        public_code: String,
        model: String,
        lot: String,
        destination: String,
        activation_key: BytesN<32>,
        owner: Address,
    ) -> u64 {
        admin(&env).require_auth();
        Self::insert_product(&env, public_code, model, lot, destination, activation_key, Some(owner))
    }

    /// Replaces the contract code, keeping its storage and address.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        admin(&env).require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    fn insert_product(
        env: &Env,
        public_code: String,
        model: String,
        lot: String,
        destination: String,
        activation_key: BytesN<32>,
        owner: Option<Address>,
    ) -> u64 {
        if env
            .storage()
            .persistent()
            .has(&DataKey::TokenByCode(public_code.clone()))
        {
            panic!("product code already exists");
        }

        let token_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextTokenId)
            .unwrap_or(1);
        let claimed = owner.is_some();
        save_product(
            env,
            &Product {
                token_id,
                public_code,
                model,
                lot,
                destination,
                activation_key,
                owner,
                claimed,
                transfer_key: None,
            },
        );
        env.storage()
            .instance()
            .set(&DataKey::NextTokenId, &(token_id + 1));

        token_id
    }

    pub fn get_product(env: Env, token_id: u64) -> Product {
        env.storage()
            .persistent()
            .get(&DataKey::Product(token_id))
            .unwrap_or_else(|| panic!("product token does not exist"))
    }

    pub fn get_product_by_code(env: Env, code: String) -> Product {
        let token_id: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::TokenByCode(code))
            .unwrap_or_else(|| panic!("product code does not exist"));
        Self::get_product(env, token_id)
    }

    /// Bytes the activation key must sign. Binding the contract, token and claimant means a
    /// signature seen in a pending transaction cannot be reused to claim for another account.
    pub fn activation_message(env: Env, token_id: u64, claimant: Address) -> Bytes {
        signed_message(&env, ACTIVATION_DOMAIN, token_id, &claimant)
    }

    pub fn activate_product(env: Env, token_id: u64, claimant: Address, signature: BytesN<64>) {
        claimant.require_auth();
        let mut product = Self::get_product(env.clone(), token_id);

        if product.claimed {
            panic!("product is already claimed");
        }

        let message = Self::activation_message(env.clone(), token_id, claimant.clone());
        env.crypto()
            .ed25519_verify(&product.activation_key, &message, &signature);

        product.owner = Some(claimant.clone());
        product.claimed = true;
        save_product(&env, &product);
        env.events()
            .publish((symbol_short!("activated"), token_id), claimant);
    }

    /// Opens a transfer link: whoever holds its secret can take the product with `accept_transfer`.
    /// A new offer replaces the previous one, so an old link stops working.
    /// The link expires TRANSFER_LINK_SECONDS later, and the next one can be opened TRANSFER_COOLDOWN_SECONDS later.
    pub fn offer_transfer(env: Env, token_id: u64, owner: Address, transfer_key: BytesN<32>) {
        let mut product = owned_product(&env, token_id, &owner);
        let now = env.ledger().timestamp();
        let last_offer: Option<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::LastTransferOffer(token_id));
        if last_offer.is_some_and(|last| now < last + TRANSFER_COOLDOWN_SECONDS) {
            panic!("wait before opening another transfer link");
        }

        product.transfer_key = Some(transfer_key);
        save_product(&env, &product);
        save_persistent(&env, &DataKey::TransferExpiry(token_id), &(now + TRANSFER_LINK_SECONDS));
        save_persistent(&env, &DataKey::LastTransferOffer(token_id), &now);
    }

    pub fn cancel_transfer(env: Env, token_id: u64, owner: Address) {
        let mut product = owned_product(&env, token_id, &owner);
        product.transfer_key = None;
        save_product(&env, &product);
        env.storage()
            .persistent()
            .remove(&DataKey::TransferExpiry(token_id));
    }

    /// (expires_at, last_offer_at) of the product's transfer link, in ledger seconds; 0 when there is none.
    pub fn transfer_times(env: Env, token_id: u64) -> (u64, u64) {
        let storage = env.storage().persistent();
        (
            storage.get(&DataKey::TransferExpiry(token_id)).unwrap_or(0),
            storage.get(&DataKey::LastTransferOffer(token_id)).unwrap_or(0),
        )
    }

    /// Bytes the transfer key must sign; bound to the contract, token and recipient like activations.
    pub fn transfer_message(env: Env, token_id: u64, recipient: Address) -> Bytes {
        signed_message(&env, TRANSFER_DOMAIN, token_id, &recipient)
    }

    pub fn accept_transfer(env: Env, token_id: u64, recipient: Address, signature: BytesN<64>) {
        recipient.require_auth();
        let mut product = Self::get_product(env.clone(), token_id);
        let transfer_key = product
            .transfer_key
            .clone()
            .unwrap_or_else(|| panic!("product has no open transfer"));
        if product.owner.as_ref() == Some(&recipient) {
            panic!("recipient already owns the product");
        }
        let expires_at: Option<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::TransferExpiry(token_id));
        if expires_at.is_some_and(|expiry| env.ledger().timestamp() > expiry) {
            panic!("transfer link expired");
        }

        let message = Self::transfer_message(env.clone(), token_id, recipient.clone());
        env.crypto()
            .ed25519_verify(&transfer_key, &message, &signature);

        let previous = product.owner.clone();
        product.owner = Some(recipient.clone());
        product.transfer_key = None;
        save_product(&env, &product);
        env.storage()
            .persistent()
            .remove(&DataKey::TransferExpiry(token_id));
        env.events()
            .publish((symbol_short!("transfer"), token_id), (previous, recipient));
    }
}

#[cfg(test)]
mod test {
    extern crate std;

    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use soroban_sdk::testutils::{Address as _, Ledger};
    use std::vec::Vec;

    fn setup(env: &Env) -> VerifireProductClient<'_> {
        env.mock_all_auths();
        env.ledger().with_mut(|ledger| ledger.timestamp = 1_790_000_000);
        let contract_id = env.register(VerifireProduct, ());
        let client = VerifireProductClient::new(env, &contract_id);
        client.initialize(&Address::generate(env));
        client
    }

    /// Same derivation the off-chain issuer and the buyer's browser use.
    fn signing_key(env: &Env, secret: &[u8]) -> SigningKey {
        let mut input = Bytes::from_slice(env, ACTIVATION_DOMAIN);
        input.extend_from_array(b":");
        input.append(&Bytes::from_slice(env, secret));
        let seed: BytesN<32> = env.crypto().sha256(&input).into();
        SigningKey::from_bytes(&seed.to_array())
    }

    fn transfer_key(env: &Env, secret: &[u8]) -> SigningKey {
        let mut input = Bytes::from_slice(env, TRANSFER_DOMAIN);
        input.extend_from_array(b":");
        input.append(&Bytes::from_slice(env, secret));
        let seed: BytesN<32> = env.crypto().sha256(&input).into();
        SigningKey::from_bytes(&seed.to_array())
    }

    fn sign_transfer(
        env: &Env,
        client: &VerifireProductClient<'_>,
        secret: &[u8],
        token_id: u64,
        recipient: &Address,
    ) -> BytesN<64> {
        let message: Vec<u8> = client.transfer_message(&token_id, recipient).iter().collect();
        BytesN::from_array(env, &transfer_key(env, secret).sign(&message).to_bytes())
    }

    /// A product activated by `owner`, ready to be transferred.
    fn owned(env: &Env, client: &VerifireProductClient<'_>, code: &str, owner: &Address) -> u64 {
        let secret = code.as_bytes();
        let token_id = mint(env, client, code, secret);
        let signature = sign(env, client, secret, token_id, owner);
        client.activate_product(&token_id, owner, &signature);
        token_id
    }

    fn offer(env: &Env, client: &VerifireProductClient<'_>, token_id: u64, owner: &Address, secret: &[u8]) {
        let key = transfer_key(env, secret).verifying_key().to_bytes();
        client.offer_transfer(&token_id, owner, &BytesN::from_array(env, &key));
    }

    fn advance(env: &Env, seconds: u64) {
        env.ledger().with_mut(|ledger| ledger.timestamp += seconds);
    }

    fn mint(env: &Env, client: &VerifireProductClient<'_>, code: &str, secret: &[u8]) -> u64 {
        let public_key = signing_key(env, secret).verifying_key().to_bytes();
        client.mint_product(
            &String::from_str(env, code),
            &String::from_str(env, "Smartwatch X9"),
            &String::from_str(env, "1043"),
            &String::from_str(env, "AR"),
            &BytesN::from_array(env, &public_key),
        )
    }

    fn sign(
        env: &Env,
        client: &VerifireProductClient<'_>,
        secret: &[u8],
        token_id: u64,
        claimant: &Address,
    ) -> BytesN<64> {
        let message: Vec<u8> = client.activation_message(&token_id, claimant).iter().collect();
        BytesN::from_array(env, &signing_key(env, secret).sign(&message).to_bytes())
    }

    #[test]
    fn mints_and_claims_product() {
        let env = Env::default();
        let client = setup(&env);
        let claimant = Address::generate(&env);

        let token_id = mint(&env, &client, "VF-001", b"SECRET-001");
        assert_eq!(token_id, 1);
        assert!(!client.get_product(&token_id).claimed);
        assert_eq!(
            client.get_product_by_code(&String::from_str(&env, "VF-001")).token_id,
            token_id
        );

        let signature = sign(&env, &client, b"SECRET-001", token_id, &claimant);
        client.activate_product(&token_id, &claimant, &signature);
        let product = client.get_product(&token_id);
        assert!(product.claimed);
        assert_eq!(product.owner, Some(claimant));
    }

    #[test]
    #[should_panic(expected = "product is already claimed")]
    fn cannot_activate_product_twice() {
        let env = Env::default();
        let client = setup(&env);
        let claimant = Address::generate(&env);

        let token_id = mint(&env, &client, "VF-002", b"SECRET-002");
        let signature = sign(&env, &client, b"SECRET-002", token_id, &claimant);
        client.activate_product(&token_id, &claimant, &signature);
        client.activate_product(&token_id, &claimant, &signature);
    }

    #[test]
    fn rejects_signature_from_wrong_secret() {
        let env = Env::default();
        let client = setup(&env);
        let claimant = Address::generate(&env);

        let token_id = mint(&env, &client, "VF-003", b"SECRET-003");
        let signature = sign(&env, &client, b"WRONG", token_id, &claimant);
        assert!(client.try_activate_product(&token_id, &claimant, &signature).is_err());
        assert!(!client.get_product(&token_id).claimed);
    }

    #[test]
    fn front_runner_cannot_reuse_a_signature() {
        let env = Env::default();
        let client = setup(&env);
        let buyer = Address::generate(&env);
        let attacker = Address::generate(&env);

        let token_id = mint(&env, &client, "VF-004", b"SECRET-004");
        let buyer_signature = sign(&env, &client, b"SECRET-004", token_id, &buyer);
        assert!(client.try_activate_product(&token_id, &attacker, &buyer_signature).is_err());

        client.activate_product(&token_id, &buyer, &buyer_signature);
        assert_eq!(client.get_product(&token_id).owner, Some(buyer));
    }

    #[test]
    fn transfers_with_the_link_secret() {
        let env = Env::default();
        let client = setup(&env);
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);

        let token_id = owned(&env, &client, "VF-010", &seller);
        offer(&env, &client, token_id, &seller, b"LINK-1");
        assert!(client.get_product(&token_id).transfer_key.is_some());

        let signature = sign_transfer(&env, &client, b"LINK-1", token_id, &buyer);
        client.accept_transfer(&token_id, &buyer, &signature);
        let product = client.get_product(&token_id);
        assert_eq!(product.owner, Some(buyer));
        assert!(product.transfer_key.is_none());
        assert!(product.claimed);
    }

    #[test]
    fn link_works_only_once() {
        let env = Env::default();
        let client = setup(&env);
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);
        let third = Address::generate(&env);

        let token_id = owned(&env, &client, "VF-011", &seller);
        offer(&env, &client, token_id, &seller, b"LINK-1");
        client.accept_transfer(&token_id, &buyer, &sign_transfer(&env, &client, b"LINK-1", token_id, &buyer));
        let again = sign_transfer(&env, &client, b"LINK-1", token_id, &third);
        assert!(client.try_accept_transfer(&token_id, &third, &again).is_err());
    }

    #[test]
    fn only_the_owner_can_offer() {
        let env = Env::default();
        let client = setup(&env);
        let seller = Address::generate(&env);
        let stranger = Address::generate(&env);

        let token_id = owned(&env, &client, "VF-012", &seller);
        let key = transfer_key(&env, b"LINK-1").verifying_key().to_bytes();
        assert!(client
            .try_offer_transfer(&token_id, &stranger, &BytesN::from_array(&env, &key))
            .is_err());
    }

    #[test]
    fn sealed_products_cannot_be_offered() {
        let env = Env::default();
        let client = setup(&env);
        let stranger = Address::generate(&env);

        let token_id = mint(&env, &client, "VF-013", b"SECRET-013");
        let key = transfer_key(&env, b"LINK-1").verifying_key().to_bytes();
        assert!(client
            .try_offer_transfer(&token_id, &stranger, &BytesN::from_array(&env, &key))
            .is_err());
    }

    #[test]
    fn cancelled_or_replaced_links_stop_working() {
        let env = Env::default();
        let client = setup(&env);
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);

        let token_id = owned(&env, &client, "VF-014", &seller);
        offer(&env, &client, token_id, &seller, b"LINK-1");
        advance(&env, TRANSFER_COOLDOWN_SECONDS);
        offer(&env, &client, token_id, &seller, b"LINK-2");
        let old = sign_transfer(&env, &client, b"LINK-1", token_id, &buyer);
        assert!(client.try_accept_transfer(&token_id, &buyer, &old).is_err());

        client.cancel_transfer(&token_id, &seller);
        let cancelled = sign_transfer(&env, &client, b"LINK-2", token_id, &buyer);
        assert!(client.try_accept_transfer(&token_id, &buyer, &cancelled).is_err());
        assert_eq!(client.get_product(&token_id).owner, Some(seller));
    }

    #[test]
    fn transfer_signature_cannot_be_reused_by_another_account() {
        let env = Env::default();
        let client = setup(&env);
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);
        let attacker = Address::generate(&env);

        let token_id = owned(&env, &client, "VF-015", &seller);
        offer(&env, &client, token_id, &seller, b"LINK-1");
        let buyer_signature = sign_transfer(&env, &client, b"LINK-1", token_id, &buyer);
        assert!(client.try_accept_transfer(&token_id, &attacker, &buyer_signature).is_err());
        client.accept_transfer(&token_id, &buyer, &buyer_signature);
        assert_eq!(client.get_product(&token_id).owner, Some(buyer));
    }

    #[test]
    fn activation_secret_cannot_accept_a_transfer() {
        let env = Env::default();
        let client = setup(&env);
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);

        let token_id = owned(&env, &client, "VF-016", &seller);
        offer(&env, &client, token_id, &seller, b"VF-016");
        // Same secret, but signed as an activation: the domains keep the two kinds of signature apart.
        let activation_signature = sign(&env, &client, b"VF-016", token_id, &buyer);
        assert!(client.try_accept_transfer(&token_id, &buyer, &activation_signature).is_err());
    }

    #[test]
    fn imports_claimed_products_with_their_owner() {
        let env = Env::default();
        let client = setup(&env);
        let owner = Address::generate(&env);
        let key = signing_key(&env, b"SECRET-020").verifying_key().to_bytes();

        let token_id = client.import_claimed_product(
            &String::from_str(&env, "VF-020"),
            &String::from_str(&env, "Smartwatch X9"),
            &String::from_str(&env, "1043"),
            &String::from_str(&env, "AR"),
            &BytesN::from_array(&env, &key),
            &owner,
        );
        let product = client.get_product(&token_id);
        assert!(product.claimed);
        assert_eq!(product.owner, Some(owner.clone()));
        let signature = sign(&env, &client, b"SECRET-020", token_id, &owner);
        assert!(client.try_activate_product(&token_id, &owner, &signature).is_err());
    }

    #[test]
    fn expired_links_cannot_be_accepted() {
        let env = Env::default();
        let client = setup(&env);
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);

        let token_id = owned(&env, &client, "VF-030", &seller);
        offer(&env, &client, token_id, &seller, b"LINK-1");
        advance(&env, TRANSFER_LINK_SECONDS + 1);
        let signature = sign_transfer(&env, &client, b"LINK-1", token_id, &buyer);
        assert!(client.try_accept_transfer(&token_id, &buyer, &signature).is_err());
        assert_eq!(client.get_product(&token_id).owner, Some(seller));
    }

    #[test]
    fn links_can_be_accepted_until_they_expire() {
        let env = Env::default();
        let client = setup(&env);
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);

        let token_id = owned(&env, &client, "VF-031", &seller);
        offer(&env, &client, token_id, &seller, b"LINK-1");
        advance(&env, TRANSFER_LINK_SECONDS);
        client.accept_transfer(&token_id, &buyer, &sign_transfer(&env, &client, b"LINK-1", token_id, &buyer));
        assert_eq!(client.get_product(&token_id).owner, Some(buyer));
        assert_eq!(client.transfer_times(&token_id).0, 0);
    }

    #[test]
    fn owner_waits_before_opening_another_link() {
        let env = Env::default();
        let client = setup(&env);
        let seller = Address::generate(&env);

        let token_id = owned(&env, &client, "VF-032", &seller);
        offer(&env, &client, token_id, &seller, b"LINK-1");
        client.cancel_transfer(&token_id, &seller);
        let key = transfer_key(&env, b"LINK-2").verifying_key().to_bytes();
        let key = BytesN::from_array(&env, &key);
        // Cancelling does not reset the wait.
        advance(&env, TRANSFER_COOLDOWN_SECONDS - 1);
        assert!(client.try_offer_transfer(&token_id, &seller, &key).is_err());
        advance(&env, 1);
        client.offer_transfer(&token_id, &seller, &key);
        assert!(client.get_product(&token_id).transfer_key.is_some());
    }
}
