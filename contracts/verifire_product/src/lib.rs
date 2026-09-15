#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, xdr::ToXdr, Address, Bytes, BytesN, Env, String,
};

const DAY_IN_LEDGERS: u32 = 17_280;
const TTL_EXTEND_TO: u32 = 120 * DAY_IN_LEDGERS;
const TTL_THRESHOLD: u32 = TTL_EXTEND_TO - 30 * DAY_IN_LEDGERS;

/// Domain tag for activation signatures, so they cannot be replayed in another context.
/// Off-chain, the activation key seed is `sha256(ACTIVATION_DOMAIN || ":" || secret)`.
const ACTIVATION_DOMAIN: &[u8] = b"verifire-activation-v1";

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
}

#[derive(Clone)]
#[contracttype]
enum DataKey {
    Admin,
    NextTokenId,
    Product(u64),
    TokenByCode(String),
}

#[contract]
pub struct VerifireProduct;

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
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic!("contract is not initialized"));
        admin.require_auth();

        let code_key = DataKey::TokenByCode(public_code.clone());
        if env.storage().persistent().has(&code_key) {
            panic!("product code already exists");
        }

        let token_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextTokenId)
            .unwrap_or(1);
        let product = Product {
            token_id,
            public_code,
            model,
            lot,
            destination,
            activation_key,
            owner: None,
            claimed: false,
        };

        save_persistent(&env, &DataKey::Product(token_id), &product);
        save_persistent(&env, &code_key, &token_id);
        env.storage()
            .instance()
            .set(&DataKey::NextTokenId, &(token_id + 1));
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

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
        let mut message = Bytes::from_slice(&env, ACTIVATION_DOMAIN);
        message.append(&env.current_contract_address().to_xdr(&env));
        message.extend_from_array(&token_id.to_be_bytes());
        message.append(&claimant.to_xdr(&env));
        message
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

        product.owner = Some(claimant);
        product.claimed = true;
        save_persistent(&env, &DataKey::Product(token_id), &product);
        save_persistent(&env, &DataKey::TokenByCode(product.public_code.clone()), &token_id);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }
}

#[cfg(test)]
mod test {
    extern crate std;

    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use soroban_sdk::testutils::Address as _;
    use std::vec::Vec;

    fn setup(env: &Env) -> VerifireProductClient<'_> {
        env.mock_all_auths();
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
}
