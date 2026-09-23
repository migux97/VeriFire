// End-to-end check on Stellar testnet: registers a throwaway product, signs its activation the way the browser and the
// buyer's wallet do, submits it through the server's own code and reads the new owner back from the contract. Then the
// buyer opens a transfer link and a second account accepts it, the way the two browsers do.
// Usage: npm run contract:test-activation
import { randomBytes } from 'node:crypto';
import { Keypair, TransactionBuilder, hash } from '@stellar/stellar-sdk';
import { ACTIVATION_DOMAIN, TRANSFER_DOMAIN } from '../src/lib/activation.ts';
import {
  activationKeyFor, createStellarClient, explorerTxUrl, networkPassphrase, stellarConfigFromEnv
} from '../src/lib/server/stellar.ts';

const stellar = createStellarClient(stellarConfigFromEnv(process.env));

if (!stellar.enabled) {
  console.error('Falta STELLAR_CONTRACT_ID o la clave de la cuenta emisora en .env. Corré primero npm run contract:deploy.');
  process.exit(1);
}

const expectRejection = async (label: string, task: () => Promise<unknown>, expected: RegExp) => {
  try {
    await task();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!expected.test(message)) throw error;
    console.log(`   OK: ${label} fue rechazado ("${message}")`);
    return;
  }
  throw new Error(`${label} debió ser rechazado y no lo fue.`);
};

const accountReady = async (address: string) => {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    try {
      await stellar.rpcServer.getAccount(address);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw new Error(`La cuenta ${address} no apareció en la red.`);
};

const deriveActivationKeypair = (secret: string) => Keypair.fromRawEd25519Seed(hash(Buffer.from(`${ACTIVATION_DOMAIN}:${secret}`, 'utf8')));
const deriveTransferKeypair = (secret: string) => Keypair.fromRawEd25519Seed(hash(Buffer.from(`${TRANSFER_DOMAIN}:${secret}`, 'utf8')));

const createFundedAccount = async (label: string) => {
  const account = Keypair.random();
  const funded = await fetch(`https://friendbot.stellar.org/?addr=${account.publicKey()}`);
  if (!funded.ok) throw new Error(`Friendbot no pudo crear la cuenta ${label} (HTTP ${funded.status}).`);
  await accountReady(account.publicKey());
  return account;
};

// What wallet.signXdr does in the browser: sign the envelope with the account's control key.
const signAs = (account: Keypair, unsignedXdr: string) => {
  const tx = TransactionBuilder.fromXdr(unsignedXdr, networkPassphrase);
  tx.sign(account);
  return tx.toXdr();
};

const secretCode = `VF-SECRET-${randomBytes(10).toString('hex').toUpperCase()}`;
const activationKeypair = deriveActivationKeypair(secretCode);
if (!Buffer.from(activationKeypair.rawPublicKey()).equals(activationKeyFor(secretCode))) throw new Error('La derivación de la clave de activación no coincide.');

const product = { token: `VF-TEST-${Date.now()}`, model: 'Producto de prueba', lot: 'TEST', destination: 'Argentina · LATAM', secretCode };
const { tokenId, mintTx } = await stellar.mintProduct(product);
console.log(`1. ${product.token} registrado como token ${tokenId}: ${explorerTxUrl(mintTx)}`);

// The contract can only authorize an account that exists on-chain. In the browser the Cavos kit creates it; here friendbot does.
const buyer = Keypair.random();
const funded = await fetch(`https://friendbot.stellar.org/?addr=${buyer.publicKey()}`);
if (!funded.ok) throw new Error(`Friendbot no pudo crear la cuenta del comprador (HTTP ${funded.status}).`);
await accountReady(buyer.publicKey());
console.log(`2. Cuenta de comprador creada: ${buyer.publicKey()}`);

const message = await stellar.activationMessage(tokenId, buyer.publicKey());
await expectRejection('Una firma hecha con el QR de otro producto', () => stellar.buildActivation({
  tokenId, claimant: buyer.publicKey(), signature: deriveActivationKeypair('VF-SECRET-OTRO').sign(message)
}), /firma del QR/);
const stranger = Keypair.random();
await expectRejection('Una cuenta que todavía no existe en la red', async () => stellar.buildActivation({
  tokenId, claimant: stranger.publicKey(), signature: activationKeypair.sign(await stellar.activationMessage(tokenId, stranger.publicKey()))
}), /todavía no existe/);

const unsignedXdr = await stellar.buildActivation({ tokenId, claimant: buyer.publicKey(), signature: activationKeypair.sign(message) });
const unsigned = TransactionBuilder.fromXdr(unsignedXdr, networkPassphrase);
if (!('operations' in unsigned)) throw new Error('La activación no es una transacción simple.');
const [operation] = unsigned.operations;
const credentials = operation?.type === 'invokeHostFunction' ? (operation.auth ?? []).map((entry) => entry.credentials.type) : [];
console.log(`3. Credenciales que pide el contrato: ${credentials.join(', ') || '(ninguna)'}`);
// What wallet.signXdr does in the browser: sign the envelope with the account's control key.
unsigned.sign(buyer);
console.log('4. Sobre firmado por el comprador.');

const txHash = await stellar.submitActivation({ tokenId, claimant: buyer.publicKey(), signedXdr: unsigned.toXdr() });
const onChain = await stellar.readProduct(tokenId);
console.log(`5. Garantía activada: ${explorerTxUrl(txHash)}`);
console.log(`   Contrato: claimed=${onChain.claimed}, dueño correcto=${onChain.owner === buyer.publicKey()}`);

await expectRejection('Un segundo reclamo del mismo producto', () => stellar.buildActivation({
  tokenId, claimant: buyer.publicKey(), signature: activationKeypair.sign(message)
}), /ya fue reclamado/);

const transferSecret = randomBytes(16).toString('base64url');
const transferKeypair = deriveTransferKeypair(transferSecret);
const transferKey = Buffer.from(transferKeypair.rawPublicKey());
await expectRejection('Un link abierto por quien no es el dueño', () => stellar.buildTransferOffer({
  tokenId, owner: stranger.publicKey(), transferKey
}), /Solo el dueño/);
const offerTx = await stellar.submitTransferOffer({
  tokenId, owner: buyer.publicKey(), transferKey,
  signedXdr: signAs(buyer, await stellar.buildTransferOffer({ tokenId, owner: buyer.publicKey(), transferKey }))
});
console.log(`6. Link de transferencia abierto por el dueño: ${explorerTxUrl(offerTx)}`);
// There is no wait between links: opening another one replaces this one (the contract's own test
// owner_opens_another_link_right_away covers it). It is not opened here, because the steps below accept this link.
const [expiresAt, offeredAt] = await stellar.transferTimes(tokenId);
console.log(`   El link vence ${expiresAt - offeredAt} segundos después de abrirlo.`);

const recipient = await createFundedAccount('del nuevo dueño');
console.log(`7. Cuenta del nuevo dueño creada: ${recipient.publicKey()}`);
const transferMessage = await stellar.transferMessage(tokenId, recipient.publicKey());
await expectRejection('Una firma hecha con otro link', () => stellar.buildTransferAccept({
  tokenId, recipient: recipient.publicKey(), signature: deriveTransferKeypair('OTRO-LINK').sign(transferMessage)
}), /firma/);
await expectRejection('El QR secreto usado como link de transferencia', () => stellar.buildTransferAccept({
  tokenId, recipient: recipient.publicKey(), signature: activationKeypair.sign(transferMessage)
}), /firma/);

const acceptXdr = await stellar.buildTransferAccept({ tokenId, recipient: recipient.publicKey(), signature: transferKeypair.sign(transferMessage) });
const transferTx = await stellar.submitTransferAccept({ tokenId, recipient: recipient.publicKey(), signedXdr: signAs(recipient, acceptXdr) });
const transferred = await stellar.readProduct(tokenId);
console.log(`8. Cambio de dueño: ${explorerTxUrl(transferTx)}`);
console.log(`   Contrato: dueño nuevo=${transferred.owner === recipient.publicKey()}, link cerrado=${transferred.transfer_key === null || transferred.transfer_key === undefined}`);

const third = await createFundedAccount('de un tercero');
await expectRejection('El mismo link usado por segunda vez', async () => stellar.buildTransferAccept({
  tokenId, recipient: third.publicKey(), signature: transferKeypair.sign(await stellar.transferMessage(tokenId, third.publicKey()))
}), /ya no está vigente/);
await expectRejection('El dueño anterior abriendo un link nuevo', () => stellar.buildTransferOffer({
  tokenId, owner: buyer.publicKey(), transferKey
}), /Solo el dueño/);

console.log('Prueba completa.');
