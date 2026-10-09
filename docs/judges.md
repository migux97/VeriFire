# Reviewing VeriFire in 15 minutes

The [README](../README.md#for-the-jury-a-3-minute-tour) has a 3-minute tour of the live app. This page is the longer
path: what to try, what to read in the code, which test pins each claim, and what still depends on trusting us.

Everything here runs on **Stellar testnet**. No real money moves.

| | |
| --- | --- |
| Live app | https://verifire.cosmosapp.lat |
| Contract (testnet) | [`CDFW7URO…QV2EI6`](https://stellar.expert/explorer/testnet/contract/CDFW7UROVQAU462KD2HI2XTOTP7BFSIQE3Q32K3FRN7ONPKGYIQV2EI6) |
| Issuing account | [`GB2F2OJP…MOHQAT5`](https://stellar.expert/explorer/testnet/account/GB2F2OJPRY6CZ2CYW7I3WKQ5X4CLAZCEKOBYYIKDU4QXZLDR6MOHQAT5) |
| Demo QR pairs | [`docs/demo-qrs/`](demo-qrs/) (each secret QR works once, take a pair nobody used) |

---

## 1. Use it (5 minutes)

1. **Verify without an account.** Open
   [`/verify?token=VF-36SYSDVR`](https://verifire.cosmosapp.lat/verify?token=VF-36SYSDVR) (or any token from
   `docs/demo-qrs/`). You see the product, its batch, the company that signed it and "Producto original", because a
   person at VeriFire verified that company.
2. **Activate one.** Open [`/app`](https://verifire.cosmosapp.lat/app), sign in with any email, upload the matching
   secret QR. You need no XLM and no Stellar knowledge: a Cavos wallet is created for you and the issuing account pays
   the fee.
3. **Reload the public page.** It now shows the product as activated, with a link to the transaction.
4. **Transfer it (optional).** From "Mis garantías", open a transfer link and accept it from another browser signed in
   with a different email. The owner changes on-chain.

## 2. Check it without us (5 minutes)

On [Stellar Expert](https://stellar.expert/explorer/testnet/contract/CDFW7UROVQAU462KD2HI2XTOTP7BFSIQE3Q32K3FRN7ONPKGYIQV2EI6),
read the contract directly:

| Call | What it proves |
| --- | --- |
| `get_product_by_code("VF-36SYSDVR")` | The product record and its **owner**, from the network, not from our server |
| `get_issuer(token_id)` | The **company wallet** that signed the batch. Set only by the company's own signature |
| `issuer_verification(wallet)` | The trade name VeriFire verified for that wallet. Public, dated, withdrawable |

Products issued before batch signing existed (for example `VF-013`) return nothing from `get_issuer`. That is
expected, and the README says so.

To reproduce the whole on-chain flow from a terminal (register, sign with the derived key, authorize as buyer,
activate):

```bash
npm install && cp .env.example .env   # fill in the Stellar values
npm run contract:test-activation
```

## 3. Read the code (5 minutes)

Three properties carry the product. Each one is enforced in the contract and pinned by a test in
`contracts/verifire_product/src/lib.rs`.

**The secret QR cannot be stolen from the network.** The secret never travels in a transaction. The contract stores
only an ed25519 public key derived from it, and the buyer sends a signature over a message bound to the contract, the
token and the buyer's address.

- Code: `activate_product`, `activation_message`; browser side in `src/lib/client/activation.ts`.
- Tests: `front_runner_cannot_reuse_a_signature`, `rejects_signature_from_wrong_secret`,
  `cannot_activate_product_twice`.

**VeriFire cannot put a company's name on a product the company did not sign.** The company signs one Merkle root per
batch (`endorse_batch`). Anyone can then call `link_issuer`, but the contract rebuilds the leaf from the product as it
is stored, so a proof only links products that were in the signed batch.

- Code: `endorse_batch`, `link_issuer`, `product_leaf`; server side in `src/lib/server/endorsements.ts` and
  `src/lib/server/batch-tree.ts`.
- Tests: `a_batch_needs_the_company_signature`, `another_company_cannot_take_a_signed_batch`,
  `only_products_of_the_signed_batch_are_linked`, and `leaf_matches_the_server` (the Rust leaf and the TypeScript leaf
  must agree byte for byte; `tests/batch-tree.test.mjs` checks the other side).

**A transfer link works once, for a short time, and only for its owner.** Links expire after 15 minutes
(`TRANSFER_LINK_SECONDS`), a new link replaces the old one, and the link secret stays after the `#` in the URL, so it
never reaches our server.

- Code: `offer_transfer`, `accept_transfer`; browser side in `src/lib/client/transfer.ts`.
- Tests: `link_works_only_once`, `expired_links_cannot_be_accepted`, `only_the_owner_can_offer`,
  `transfer_signature_cannot_be_reused_by_another_account`, `activation_secret_cannot_accept_a_transfer`.

Run them:

```bash
cd contracts/verifire_product && cargo test   # 25 contract tests
cd ../.. && npm test                          # pure-logic tests (node --test)
```

GitHub Actions runs the type check, both test suites, the wasm build and the app build on every push to `main` and
`dev` (`.github/workflows/ci.yml`).

---

## What you still have to trust us for

We would rather you read this here than find it yourself.

- **The contract admin is VeriFire's issuing account.** It can register products without a company
  (`mint_product`), import already-activated products with an owner when moving to a new deployment
  (`import_claimed_product`), and replace the contract code (`upgrade`). All three are admin-only and every call is a
  public transaction, but they are real powers. Before mainnet, `upgrade` and `import_claimed_product` should move
  behind a multisig or a timelock.
- **"This wallet belongs to company X" is our word.** A person at VeriFire checks the legal name, tax ID and website
  by hand, then writes the decision on-chain with `set_issuer_verification`. The decision is public and dated, but the
  check itself happens off-chain.
- **"Original" means "from a verified company", not "from the factory".** A verified reseller can issue products it
  did not manufacture. Manufacturers and official importers as issuers are on the roadmap.
- **Company data lives in a JSON file on our server**: accounts, workspaces, batches, purchases and the secret codes
  of a batch until it is printed. It is written atomically with a backup, but it is a pilot store, not a database.
- **Batch payments are testnet payments** through Cosmos Pay. No real money has moved.
- **Wallet addresses are public.** We keep the owner's email out of public pages, but anyone can read the owner's
  wallet address from the contract.
