// Recovering an account from any device, with no key ever in Verifire's hands.
//
// The key of a wallet lives in the user's devices and, sealed with the account's password, in the Stellar account
// itself. Cavos' social recovery adds a third place: a copy sealed inside an AWS Nitro enclave that has no disk and no
// operator access, and that releases it only to a device the user is signing in on, after checking a login made in the
// last five minutes. Verifire's server never sees any of it, so breaking into Verifire gives no keys; Cavos' own servers
// only relay ciphertext. The kit checks the enclave's attestation against measurements pinned in the package.
//
// It is switched on per app in the Cavos dashboard. While it is off, nothing here does anything and every flow works as
// before (the password is then the only way to open the key on a new device).
import type { CavosAuth, CavosStellar } from '@cavos/kit';
import { errorMessage } from '../errors';
import { readRaw, writeRaw } from './storage';

const CAVOS_URL = 'https://cavos.xyz';
const ENROLLED_KEY = 'verifireSocialRecovery';
// A login proof is valid for the enclave for five minutes; an answer that takes this long will not arrive in time.
const TIMEOUT_MS = 45_000;

interface SocialRecoveryConfig {
  enabled: boolean;
  provider: 'google' | 'apple' | 'email' | null;
  delaySeconds: number;
}

let configRequest: Promise<SocialRecoveryConfig> | null = null;

const OFF: SocialRecoveryConfig = { enabled: false, provider: null, delaySeconds: 0 };

// Whether the app turned it on in the Cavos dashboard (Environments → Hardware-isolated social recovery). Asked once
// per page.
export const socialRecoveryConfig = (appId: string): Promise<SocialRecoveryConfig> => {
  configRequest ??= fetch(`${CAVOS_URL}/api/recovery/social/config?app_id=${encodeURIComponent(appId)}`)
    .then(async (response): Promise<SocialRecoveryConfig> => {
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { enabled?: unknown; provider?: unknown; delay_seconds?: unknown };
      const provider = data.provider === 'google' || data.provider === 'apple' || data.provider === 'email' ? data.provider : null;
      // Google, Apple and email are all accepted once it is on: each wallet recovers with the login its owner used, so
      // no single provider has to be named.
      return { enabled: data.enabled === true, provider, delaySeconds: Number(data.delay_seconds) || 0 };
    })
    .catch(() => OFF);
  return configRequest;
};

const withTimeout = <T>(task: Promise<T>) =>
  Promise.race([task, new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS))]);

const enrolledKey = (address: string) => `${ENROLLED_KEY}:${address}`;
export const socialRecoveryEnrolledHere = (address: string) => readRaw(localStorage, enrolledKey(address)) === '1';

const client = async (appId: string) => {
  const { SocialRecoveryClient, DEFAULT_SOCIAL_RECOVERY_ATTESTATION } = await import('./cavos-kit');
  return new SocialRecoveryClient({ baseUrl: CAVOS_URL, appId, attestation: DEFAULT_SOCIAL_RECOVERY_ATTESTATION });
};

// Seals this wallet's key in the enclave, right after a login on a device that holds it. It needs the proof of that
// login, which only some logins carry (Google always; an email code depends on the Cavos configuration): without it,
// it waits for the next login. It never throws: the login must go on either way.
export const enrollSocialRecovery = async (appId: string, auth: CavosAuth, wallet: CavosStellar) => {
  try {
    if (wallet.status !== 'ready' && wallet.status !== 'undeployed') return false;
    if (socialRecoveryEnrolledHere(wallet.address)) return true;
    const config = await socialRecoveryConfig(appId);
    if (!config.enabled) return false;
    if (!auth.hasSocialRecoveryCredential()) {
      console.info('Recuperación con Cavos: se activa en un inicio de sesión con el enlace del correo o con Google.');
      return false;
    }
    console.info('Recuperación con Cavos: guardando la llave de esta cuenta en el enclave…');
    const { enrollHardwareIsolatedRecovery } = await import('./cavos-kit');
    await withTimeout(enrollHardwareIsolatedRecovery({
      client: await client(appId),
      wallet,
      credential: auth.consumeSocialRecoveryCredential(),
      delaySeconds: config.delaySeconds
    })).catch((error: unknown) => {
      // Enrolled before from another device: the key is already in the enclave.
      if (!errorMessage(error).includes('already_enrolled')) throw error;
    });
    writeRaw(localStorage, enrolledKey(wallet.address), '1');
    console.info('Recuperación con Cavos: activada para esta cuenta.');
    return true;
  } catch (error) {
    console.warn('No se pudo activar la recuperación de la cuenta:', errorMessage(error));
    return false;
  }
};

// Opens the key on a device that does not hold it, through the enclave, with the proof of the login just made. True
// when this device can sign afterwards.
export const recoverWithSocial = async (appId: string, auth: CavosAuth, wallet: CavosStellar) => {
  if (wallet.status !== 'needs-device-approval') return wallet.status === 'ready';
  const config = await socialRecoveryConfig(appId);
  if (!config.enabled) return false;
  if (!auth.hasSocialRecoveryCredential()) {
    console.warn('Recuperación con Cavos: este inicio de sesión no trajo la prueba que pide el enclave (entrá con el enlace del correo o con Google).');
    return false;
  }
  try {
    const { recoverHardwareIsolatedDevice } = await import('./cavos-kit');
    const outcome = await withTimeout(recoverHardwareIsolatedDevice({
      client: await client(appId),
      wallet,
      // Read, not taken: when the account turns out not to be sealed, the same proof seals it right after.
      credential: auth.getSocialRecoveryCredential(),
      network: 'testnet',
      delaySeconds: config.delaySeconds
    }));
    if (!outcome.finalized) return false;
    writeRaw(localStorage, enrolledKey(wallet.address), '1');
    return (wallet.status as string) === 'ready';
  } catch (error) {
    console.warn('No se pudo recuperar la cuenta con Cavos:', errorMessage(error));
    return false;
  }
};
