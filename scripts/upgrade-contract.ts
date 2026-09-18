// Replaces the code of the configured contract with the wasm just built, keeping its address and its data.
// Build first: cargo build --target wasm32v1-none --release (inside contracts/verifire_product).
// Usage: npm run contract:upgrade
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Contract, Keypair, Operation, xdr } from '@stellar/stellar-sdk';
import { createStellarClient, explorerTxUrl, stellarConfigFromEnv } from '../src/lib/server/stellar.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const wasmFile = `${root}contracts/verifire_product/target/wasm32v1-none/release/verifire_product.wasm`;
const config = stellarConfigFromEnv(process.env);
const { submitOperation } = createStellarClient(config);

if (!config.contractId || !config.issuerSecret) {
  console.error('Falta STELLAR_CONTRACT_ID o la clave de la cuenta admin en .env.');
  process.exit(1);
}
if (!existsSync(wasmFile)) {
  console.error('No se encontró el wasm. Compilá primero con: cargo build --target wasm32v1-none --release');
  process.exit(1);
}

const admin = Keypair.fromSecret(config.issuerSecret);
const { returnValue: wasmHash } = await submitOperation(admin, Operation.uploadContractWasm({ wasm: readFileSync(wasmFile) }));
if (!(wasmHash instanceof Uint8Array)) throw new Error('Stellar no devolvió el hash del wasm subido.');
console.log(`Wasm subido: ${Buffer.from(wasmHash).toString('hex')}`);

const { txHash } = await submitOperation(admin, new Contract(config.contractId).call('upgrade', xdr.ScVal.scvBytes(Buffer.from(wasmHash))));
console.log(`Contrato ${config.contractId} actualizado: ${explorerTxUrl(txHash)}`);
