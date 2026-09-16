// Deploys contracts/verifire_product to Stellar testnet and saves the contract id and admin key in .env.
// Build first: cargo build --target wasm32v1-none --release (inside contracts/verifire_product).
// Usage: node scripts/deploy-contract.mjs [--force]
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Address, Contract, Keypair, Operation } from '@stellar/stellar-sdk';
import { rpcServer, submitOperation } from '../stellar.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const envFile = `${root}.env`;
const wasmFile = `${root}contracts/verifire_product/target/wasm32v1-none/release/verifire_product.wasm`;

// Replaces or appends each key in .env without printing the values.
const setEnv = (values) => {
  let content = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    content = pattern.test(content) ? content.replace(pattern, () => line) : `${content.replace(/\s*$/, '')}\n${line}\n`;
  }
  writeFileSync(envFile, content);
};

const accountExists = async (address) => {
  try {
    await rpcServer.getAccount(address);
    return true;
  } catch {
    return false;
  }
};

const ensureFunded = async (keypair) => {
  if (await accountExists(keypair.publicKey())) return;
  const response = await fetch(`https://friendbot.stellar.org/?addr=${keypair.publicKey()}`);
  if (!response.ok) throw new Error(`Friendbot no pudo fondear la cuenta admin (HTTP ${response.status}).`);
  // The RPC can lag a ledger behind friendbot.
  for (let attempt = 0; attempt < 15; attempt += 1) {
    if (await accountExists(keypair.publicKey())) return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('La cuenta admin fue fondeada pero el RPC todavía no la ve. Volvé a correr el script.');
};

if (process.env.STELLAR_CONTRACT_ID && !process.argv.includes('--force')) {
  console.log(`Ya hay un contrato configurado: ${process.env.STELLAR_CONTRACT_ID}. Usá --force para desplegar otro.`);
  process.exit(0);
}
if (!existsSync(wasmFile)) {
  console.error('No se encontró el wasm. Compilá primero con: cargo build --target wasm32v1-none --release');
  process.exit(1);
}

const admin = process.env.STELLAR_ADMIN_SECRET ? Keypair.fromSecret(process.env.STELLAR_ADMIN_SECRET) : Keypair.random();
// Saved before any network call, so a failed deploy never loses a funded key.
setEnv({ STELLAR_ADMIN_SECRET: admin.secret() });
await ensureFunded(admin);
console.log(`Cuenta admin (testnet): ${admin.publicKey()}`);

const { returnValue: wasmHash } = await submitOperation(admin, Operation.uploadContractWasm({ wasm: readFileSync(wasmFile) }));
console.log(`Wasm subido: ${Buffer.from(wasmHash).toString('hex')}`);

const { returnValue: contractId } = await submitOperation(admin, Operation.createCustomContract({
  address: Address.fromString(admin.publicKey()),
  wasmHash,
  salt: randomBytes(32)
}));
console.log(`Contrato creado: ${contractId}`);

const { txHash } = await submitOperation(admin, new Contract(contractId).call('initialize', Address.fromString(admin.publicKey()).toScVal()));
setEnv({ STELLAR_NETWORK: 'testnet', STELLAR_CONTRACT_ID: contractId });
console.log(`Contrato inicializado (tx ${txHash}). STELLAR_CONTRACT_ID y STELLAR_ADMIN_SECRET quedaron guardados en .env.`);
