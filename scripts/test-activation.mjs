// End-to-end check on Stellar testnet: registers a throwaway product, signs its activation the way the browser
// and the buyer's wallet do, submits it through the server's own code and reads the new owner back from the
// contract. Usage: node scripts/test-activation.mjs
import { randomBytes } from 'node:crypto';
import { Keypair, TransactionBuilder, hash } from '@stellar/stellar-sdk';
import {
  activationKeyFor, activationMessage, buildActivation, chainEnabled, explorerTxUrl, mintOnChain,
  networkPassphrase, readProduct, rpcServer, submitActivation
} from '../stellar.mjs';

if (!chainEnabled()) {
  console.error('Falta STELLAR_CONTRACT_ID o la clave de la cuenta emisora en .env. Corré primero node scripts/deploy-contract.mjs.');
  process.exit(1);
}

const expectRejection = async (label, task, expected) => {
  try {
    await task();
  } catch (error) {
    if (!expected.test(error.message)) throw error;
    console.log(`   OK: ${label} fue rechazado ("${error.message}")`);
    return;
  }
  throw new Error(`${label} debió ser rechazado y no lo fue.`);
};

const accountReady = async (address) => {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    try {
      await rpcServer.getAccount(address);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw new Error(`La cuenta ${address} no apareció en la red.`);
};

const deriveActivationKeypair = (secret) => Keypair.fromRawEd25519Seed(hash(Buffer.from(`verifire-activation-v1:${secret}`, 'utf8')));

const secretCode = `VF-SECRET-${randomBytes(10).toString('hex').toUpperCase()}`;
const activationKeypair = deriveActivationKeypair(secretCode);
if (!Buffer.from(activationKeypair.rawPublicKey()).equals(activationKeyFor(secretCode))) throw new Error('La derivación de la clave de activación no coincide.');

const product = { token: `VF-TEST-${Date.now()}`, model: 'Producto de prueba', lot: 'TEST', destination: 'Argentina · LATAM', secretCode };
const { tokenId, mintTx } = await mintOnChain(product);
console.log(`1. ${product.token} registrado como token ${tokenId}: ${explorerTxUrl(mintTx)}`);

// The contract can only authorize an account that exists on-chain. In the browser the Cavos kit creates it; here friendbot does.
const buyer = Keypair.random();
const funded = await fetch(`https://friendbot.stellar.org/?addr=${buyer.publicKey()}`);
if (!funded.ok) throw new Error(`Friendbot no pudo crear la cuenta del comprador (HTTP ${funded.status}).`);
await accountReady(buyer.publicKey());
console.log(`2. Cuenta de comprador creada: ${buyer.publicKey()}`);

const message = await activationMessage(tokenId, buyer.publicKey());
await expectRejection('Una firma hecha con el QR de otro producto', () => buildActivation({
  tokenId, claimant: buyer.publicKey(), signature: deriveActivationKeypair('VF-SECRET-OTRO').sign(message)
}), /firma del QR/);
const stranger = Keypair.random();
await expectRejection('Una cuenta que todavía no existe en la red', async () => buildActivation({
  tokenId, claimant: stranger.publicKey(), signature: activationKeypair.sign(await activationMessage(tokenId, stranger.publicKey()))
}), /todavía no existe/);

const unsignedXdr = await buildActivation({ tokenId, claimant: buyer.publicKey(), signature: activationKeypair.sign(message) });
const unsigned = TransactionBuilder.fromXDR(unsignedXdr, networkPassphrase);
console.log(`3. Credenciales que pide el contrato: ${unsigned.operations[0].auth.map((entry) => entry.credentials.type).join(', ') || '(ninguna)'}`);
// What wallet.signXdr does in the browser: sign the envelope with the account's control key.
unsigned.sign(buyer);
console.log('4. Sobre firmado por el comprador.');

const txHash = await submitActivation({ tokenId, claimant: buyer.publicKey(), signedXdr: unsigned.toXDR() });
const onChain = await readProduct(tokenId);
console.log(`5. Garantía activada: ${explorerTxUrl(txHash)}`);
console.log(`   Contrato: claimed=${onChain.claimed}, dueño correcto=${onChain.owner === buyer.publicKey()}`);

await expectRejection('Un segundo reclamo del mismo producto', () => buildActivation({
  tokenId, claimant: buyer.publicKey(), signature: activationKeypair.sign(message)
}), /ya fue reclamado/);

console.log('Prueba completa.');
