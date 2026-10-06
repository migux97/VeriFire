#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, xdr::ToXdr, Address, Bytes, BytesN, Env,
    String, Vec,
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

/// A transfer link can be accepted for this long after the owner opens it. Must match TRANSFER_LINK_MS in
/// src/lib/server/products.ts.
pub const TRANSFER_LINK_SECONDS: u64 = 15 * 60;

/// Deepest Merkle proof `link_issuer` accepts: 2^16 products in one batch, far more than a batch can hold.
const MAX_PROOF_DEPTH: u32 = 16;

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
    /// Wallet of the company that co-signed the registration of a product (see `mint_product_for`).
    Issuer(u64),
    /// Trade name VeriFire checked for an issuer wallet. Absent while the issuer is not verified.
    VerifiedIssuer(Address),
    /// Company wallet that signed a batch, by the Merkle root of its products (see `endorse_batch`).
    BatchIssuer(BytesN<32>),
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
    // The issuer lives as long as its product: it is what the public page shows.
    let issuer = DataKey::Issuer(product.token_id);
    let storage = env.storage().persistent();
    if storage.has(&issuer) {
        storage.extend_ttl(&issuer, TTL_THRESHOLD, TTL_EXTEND_TO);
    }
    env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

/// Leaf of a product in the Merkle tree of its batch: everything the public QR page shows about it, plus the key of
/// its sealed QR. Off-chain it is `sha256(0x00 || xdr(code) || xdr(model) || xdr(lot) || xdr(destination) || key)`,
/// with each text as the XDR of a Soroban string.
fn product_leaf(env: &Env, product: &Product) -> BytesN<32> {
    let mut data = Bytes::from_array(env, &[0u8]);
    data.append(&product.public_code.clone().to_xdr(env));
    data.append(&product.model.clone().to_xdr(env));
    data.append(&product.lot.clone().to_xdr(env));
    data.append(&product.destination.clone().to_xdr(env));
    data.append(&Bytes::from(product.activation_key.clone()));
    env.crypto().sha256(&data).into()
}

/// Inner node of the batch tree: `sha256(0x01 || left || right)`. The prefixes keep leaves and nodes apart.
fn merkle_node(env: &Env, left: &BytesN<32>, right: &BytesN<32>) -> BytesN<32> {
    let mut data = Bytes::from_array(env, &[1u8]);
    data.append(&Bytes::from(left.clone()));
    data.append(&Bytes::from(right.clone()));
    env.crypto().sha256(&data).into()
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

    /// Registers a product in the name of a company. The company's wallet signs too, so a product can carry a
    /// company's name only if that company authorized it: VeriFire alone cannot issue in someone else's name.
    pub fn mint_product_for(
        env: Env,
        issuer: Address,
        public_code: String,
        model: String,
        lot: String,
        destination: String,
        activation_key: BytesN<32>,
    ) -> u64 {
        admin(&env).require_auth();
        issuer.require_auth();
        let token_id = Self::insert_product(&env, public_code, model, lot, destination, activation_key, None);
        save_persistent(&env, &DataKey::Issuer(token_id), &issuer);
        env.events().publish((symbol_short!("issued"), token_id), issuer);
        token_id
    }

    /// The company wallet that co-signed the product, or None for products registered by VeriFire alone.
    pub fn get_issuer(env: Env, token_id: u64) -> Option<Address> {
        env.storage().persistent().get(&DataKey::Issuer(token_id))
    }

    /// A company signs a whole batch at once: `root` is the Merkle root of its products (see `product_leaf`). After
    /// this, `link_issuer` attaches the company to each product of the batch, whoever sends it, so the company signs
    /// one transaction per batch instead of one per product. The same root cannot be claimed by another wallet.
    pub fn endorse_batch(env: Env, issuer: Address, root: BytesN<32>) {
        issuer.require_auth();
        let key = DataKey::BatchIssuer(root.clone());
        let current: Option<Address> = env.storage().persistent().get(&key);
        if current.is_some_and(|current| current != issuer) {
            panic!("batch already endorsed by another issuer");
        }
        save_persistent(&env, &key, &issuer);
        env.events().publish((symbol_short!("endorsed"), issuer), root);
    }

    /// The company wallet that signed the batch with this root, if any.
    pub fn batch_issuer(env: Env, root: BytesN<32>) -> Option<Address> {
        env.storage().persistent().get(&DataKey::BatchIssuer(root))
    }

    /// Attaches the company that signed a batch to one of its products. `proof` is the path from the product's leaf
    /// (at position `index`) to the batch root. It needs no signature: the proof is checked against the product as the
    /// contract stores it, so it only ever records what the company signed.
    pub fn link_issuer(env: Env, token_id: u64, root: BytesN<32>, index: u32, proof: Vec<BytesN<32>>) {
        if proof.len() > MAX_PROOF_DEPTH {
            panic!("proof is too long");
        }
        let issuer: Address = env
            .storage()
            .persistent()
            .get(&DataKey::BatchIssuer(root.clone()))
            .unwrap_or_else(|| panic!("batch is not endorsed"));
        if env.storage().persistent().has(&DataKey::Issuer(token_id)) {
            panic!("product already has an issuer");
        }
        let product = Self::get_product(env.clone(), token_id);
        let mut node = product_leaf(&env, &product);
        let mut position = index;
        for sibling in proof.iter() {
            node = if position & 1 == 0 {
                merkle_node(&env, &node, &sibling)
            } else {
                merkle_node(&env, &sibling, &node)
            };
            position >>= 1;
        }
        if position != 0 || node != root {
            panic!("product is not in the endorsed batch");
        }
        save_persistent(&env, &DataKey::Issuer(token_id), &issuer);
        env.events().publish((symbol_short!("issued"), token_id), issuer);
    }

    /// VeriFire's statement that `issuer` belongs to the company with this trade name. `None` withdraws it.
    pub fn set_issuer_verification(env: Env, issuer: Address, name: Option<String>) {
        admin(&env).require_auth();
        let key = DataKey::VerifiedIssuer(issuer.clone());
        match name.clone() {
            Some(name) => save_persistent(&env, &key, &name),
            None => env.storage().persistent().remove(&key),
        }
        env.events().publish((symbol_short!("verified"), issuer), name);
    }

    /// The trade name VeriFire verified for an issuer wallet, or None while it is not verified.
    pub fn issuer_verification(env: Env, issuer: Address) -> Option<String> {
        env.storage().persistent().get(&DataKey::VerifiedIssuer(issuer))
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
    /// The link expires TRANSFER_LINK_SECONDS later.
    pub fn offer_transfer(env: Env, token_id: u64, owner: Address, transfer_key: BytesN<32>) {
        let mut product = owned_product(&env, token_id, &owner);
        let now = env.ledger().timestamp();
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
    fn owner_opens_another_link_right_away() {
        let env = Env::default();
        let client = setup(&env);
        let seller = Address::generate(&env);

        let token_id = owned(&env, &client, "VF-032", &seller);
        offer(&env, &client, token_id, &seller, b"LINK-1");
        client.cancel_transfer(&token_id, &seller);
        let key = transfer_key(&env, b"LINK-2").verifying_key().to_bytes();
        let key = BytesN::from_array(&env, &key);
        client.offer_transfer(&token_id, &seller, &key);
        assert!(client.get_product(&token_id).transfer_key.is_some());
    }

    fn mint_for(env: &Env, client: &VerifireProductClient<'_>, issuer: &Address, code: &str) -> u64 {
        let public_key = signing_key(env, code.as_bytes()).verifying_key().to_bytes();
        client.mint_product_for(
            issuer,
            &String::from_str(env, code),
            &String::from_str(env, "Smartwatch X9"),
            &String::from_str(env, "1043"),
            &String::from_str(env, "AR"),
            &BytesN::from_array(env, &public_key),
        )
    }

    #[test]
    fn products_minted_for_a_company_name_their_issuer() {
        let env = Env::default();
        let client = setup(&env);
        let issuer = Address::generate(&env);

        let token_id = mint_for(&env, &client, &issuer, "VF-040");
        // The company's wallet had to authorize the registration, next to VeriFire's.
        assert!(env.auths().iter().any(|(address, _)| *address == issuer));
        assert_eq!(client.get_issuer(&token_id), Some(issuer));
        assert_eq!(client.get_issuer(&mint(&env, &client, "VF-041", b"VF-041")), None);
    }

    #[test]
    fn a_company_must_sign_its_own_products() {
        let env = Env::default();
        let client = setup(&env);
        let issuer = Address::generate(&env);
        // No more mocked signatures: neither VeriFire's nor the company's.
        env.set_auths(&[]);
        let public_key = signing_key(&env, b"VF-042").verifying_key().to_bytes();
        assert!(client
            .try_mint_product_for(
                &issuer,
                &String::from_str(&env, "VF-042"),
                &String::from_str(&env, "Smartwatch X9"),
                &String::from_str(&env, "1043"),
                &String::from_str(&env, "AR"),
                &BytesN::from_array(&env, &public_key),
            )
            .is_err());
    }

    #[test]
    fn issuer_keeps_its_products_through_activation_and_transfer() {
        let env = Env::default();
        let client = setup(&env);
        let issuer = Address::generate(&env);
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);

        let token_id = mint_for(&env, &client, &issuer, "VF-043");
        client.activate_product(&token_id, &seller, &sign(&env, &client, b"VF-043", token_id, &seller));
        offer(&env, &client, token_id, &seller, b"LINK-1");
        client.accept_transfer(&token_id, &buyer, &sign_transfer(&env, &client, b"LINK-1", token_id, &buyer));
        assert_eq!(client.get_product(&token_id).owner, Some(buyer));
        assert_eq!(client.get_issuer(&token_id), Some(issuer));
    }

    #[test]
    fn verifire_states_and_withdraws_who_an_issuer_is() {
        let env = Env::default();
        let client = setup(&env);
        let issuer = Address::generate(&env);
        let name = String::from_str(&env, "Andes Audio");

        assert_eq!(client.issuer_verification(&issuer), None);
        client.set_issuer_verification(&issuer, &Some(name.clone()));
        assert_eq!(client.issuer_verification(&issuer), Some(name));
        client.set_issuer_verification(&issuer, &None);
        assert_eq!(client.issuer_verification(&issuer), None);
    }

    #[test]
    fn only_verifire_can_verify_an_issuer() {
        let env = Env::default();
        let client = setup(&env);
        let issuer = Address::generate(&env);
        env.set_auths(&[]);
        assert!(client
            .try_set_issuer_verification(&issuer, &Some(String::from_str(&env, "Andes Audio")))
            .is_err());
        assert_eq!(client.issuer_verification(&issuer), None);
    }

    /// Mints `codes` as one batch and returns their token ids, the root of the batch and the proof of each one,
    /// building the tree the way the server does: leaves padded with zeros to a power of two.
    fn batch(env: &Env, client: &VerifireProductClient<'_>, codes: &[&str]) -> (Vec<u64>, BytesN<32>, Vec<Vec<BytesN<32>>>) {
        let mut tokens = Vec::new();
        let mut level = Vec::new();
        for code in codes {
            let token_id = mint(env, client, code, code.as_bytes());
            level.push(product_leaf(env, &client.get_product(&token_id)));
            tokens.push(token_id);
        }
        let mut size = 1;
        while size < level.len() {
            size *= 2;
        }
        while level.len() < size {
            level.push(BytesN::from_array(env, &[0u8; 32]));
        }
        let mut proofs: Vec<Vec<BytesN<32>>> = codes.iter().map(|_| Vec::new()).collect();
        let mut positions: Vec<usize> = (0..codes.len()).collect();
        while level.len() > 1 {
            for (proof, position) in proofs.iter_mut().zip(positions.iter_mut()) {
                proof.push(level[*position ^ 1].clone());
                *position /= 2;
            }
            level = level.chunks(2).map(|pair| merkle_node(env, &pair[0], &pair[1])).collect();
        }
        (tokens, level[0].clone(), proofs)
    }

    fn proof_vec(env: &Env, proof: &[BytesN<32>]) -> soroban_sdk::Vec<BytesN<32>> {
        let mut list = soroban_sdk::Vec::new(env);
        for node in proof {
            list.push_back(node.clone());
        }
        list
    }

    #[test]
    fn a_signed_batch_names_its_company_on_every_product() {
        let env = Env::default();
        let client = setup(&env);
        let issuer = Address::generate(&env);
        let (tokens, root, proofs) = batch(&env, &client, &["VF-050", "VF-051", "VF-052"]);

        client.endorse_batch(&issuer, &root);
        assert!(env.auths().iter().any(|(address, _)| *address == issuer));
        assert_eq!(client.batch_issuer(&root), Some(issuer.clone()));
        for (index, (token_id, proof)) in tokens.iter().zip(proofs.iter()).enumerate() {
            client.link_issuer(token_id, &root, &(index as u32), &proof_vec(&env, proof));
            assert_eq!(client.get_issuer(token_id), Some(issuer.clone()));
        }
    }

    #[test]
    fn a_batch_needs_the_company_signature() {
        let env = Env::default();
        let client = setup(&env);
        let issuer = Address::generate(&env);
        let (_, root, _) = batch(&env, &client, &["VF-053"]);
        env.set_auths(&[]);
        assert!(client.try_endorse_batch(&issuer, &root).is_err());
        assert_eq!(client.batch_issuer(&root), None);
    }

    #[test]
    fn another_company_cannot_take_a_signed_batch() {
        let env = Env::default();
        let client = setup(&env);
        let issuer = Address::generate(&env);
        let other = Address::generate(&env);
        let (_, root, _) = batch(&env, &client, &["VF-054", "VF-055"]);

        client.endorse_batch(&issuer, &root);
        assert!(client.try_endorse_batch(&other, &root).is_err());
        assert_eq!(client.batch_issuer(&root), Some(issuer));
    }

    #[test]
    fn only_products_of_the_signed_batch_are_linked() {
        let env = Env::default();
        let client = setup(&env);
        let issuer = Address::generate(&env);
        let (tokens, root, proofs) = batch(&env, &client, &["VF-056", "VF-057"]);
        let outsider = mint(&env, &client, "VF-058", b"VF-058");

        // Not endorsed yet.
        assert!(client.try_link_issuer(&tokens[0], &root, &0, &proof_vec(&env, &proofs[0])).is_err());
        client.endorse_batch(&issuer, &root);
        // A product from outside the batch, a proof for another position, and a product linked twice.
        assert!(client.try_link_issuer(&outsider, &root, &0, &proof_vec(&env, &proofs[0])).is_err());
        assert!(client.try_link_issuer(&tokens[0], &root, &1, &proof_vec(&env, &proofs[0])).is_err());
        assert!(client.try_link_issuer(&tokens[0], &root, &2, &proof_vec(&env, &proofs[0])).is_err());
        client.link_issuer(&tokens[0], &root, &0, &proof_vec(&env, &proofs[0]));
        assert!(client.try_link_issuer(&tokens[0], &root, &0, &proof_vec(&env, &proofs[0])).is_err());
        assert_eq!(client.get_issuer(&outsider), None);
    }

    /// The server builds the same leaves (src/lib/server/batch-tree.ts): this value is checked on both sides.
    #[test]
    fn leaf_matches_the_server() {
        let env = Env::default();
        let product = Product {
            token_id: 1,
            public_code: String::from_str(&env, "VF-050"),
            model: String::from_str(&env, "Smartwatch X9"),
            lot: String::from_str(&env, "1043"),
            destination: String::from_str(&env, "AR"),
            activation_key: BytesN::from_array(&env, &[7u8; 32]),
            owner: None,
            claimed: false,
            transfer_key: None,
        };
        let expected: [u8; 32] = [
            0xc8, 0x26, 0xd0, 0xef, 0xbd, 0xd7, 0x68, 0x1d, 0x65, 0x2a, 0x27, 0x9d, 0x24, 0x0b, 0x94, 0x50, 0xc5, 0x85,
            0xf3, 0xc8, 0x46, 0x30, 0x81, 0xdb, 0x85, 0xdb, 0xb0, 0x80, 0x07, 0x51, 0xec, 0x1f,
        ];
        assert_eq!(product_leaf(&env, &product), BytesN::from_array(&env, &expected));
    }
}
