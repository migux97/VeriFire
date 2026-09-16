// The buyer's Stellar wallet, held by Cavos. Its signing key lives in this browser (IndexedDB) and under this site
// address: localhost and the public URL are two different places for it, even on the same computer.
import type { CavosAuth, CavosStellar, Identity } from '@cavos/kit';
import { isStellarAddress } from '../validation';
import { storedUser } from './account';
import { DEVICE_CODE_KEY, userSession, WALLET_KEY } from './session';
import { readStored, writeStored } from './storage';

const APP_SALT = 'verifire-demo';
// The multi-device factor is an encrypted wrap stored in the account itself (a cv:wr entry).
const HORIZON_URL = 'https://horizon-testnet.stellar.org';

// Thrown when signing needs the Gmail confirmed again with a code: the panel sends the user to log in.
export class EmailCodeRequiredError extends Error {
  constructor() {
    super('Para firmar en Stellar necesitamos confirmar tu correo con un código.');
    this.name = 'EmailCodeRequiredError';
  }
}

export const loadCavosKit = () => import('./cavos-kit');

export const createCavosAuth = async (appId: string) => {
  const { CavosAuth } = await loadCavosKit();
  return new CavosAuth(appId ? { appId } : {});
};

export const rememberWallet = (address: string | undefined) => {
  if (isStellarAddress(address)) writeStored(localStorage, WALLET_KEY, { address, connectedAt: new Date().toISOString() });
};

export const rememberDeviceCode = (deviceCode: string | undefined) => {
  try {
    if (deviceCode) sessionStorage.setItem(DEVICE_CODE_KEY, deviceCode);
  } catch {
    // Without storage the account is enabled at the next login instead.
  }
};

export const storedDeviceCode = () => {
  try {
    return sessionStorage.getItem(DEVICE_CODE_KEY) ?? '';
  } catch {
    return '';
  }
};

// Connects the Stellar wallet of an identity Cavos authenticated (email code or Google): its token lets the Cavos
// registry verify who owns the address.
const openCavosWallet = async (appId: string, auth: CavosAuth, identity: Identity): Promise<CavosStellar> => {
  const { Cavos } = await loadCavosKit();
  const session = await Cavos.connect({
    chains: ['stellar'],
    defaultChain: 'stellar',
    network: 'testnet',
    appSalt: APP_SALT,
    ...(appId ? { appId } : {}),
    identity,
    auth
  });
  const wallet = session.wallet('stellar');
  if (wallet.chain !== 'stellar' || !isStellarAddress(wallet.address)) {
    throw new Error('Cavos no devolvió una dirección Stellar para esta cuenta. Revisá el App ID de Cavos.');
  }
  return wallet;
};

// Whether the account saved its multi-device factor. Null when Horizon cannot tell. Read apart because the kit reports
// an account that never saved one and a password that cannot open it the same way.
export const hasDeviceFactor = async (address: string): Promise<boolean | null> => {
  try {
    const response = await fetch(`${HORIZON_URL}/accounts/${encodeURIComponent(address)}`);
    if (!response.ok) return null;
    const account = (await response.json()) as { data?: Record<string, string> };
    return Object.keys(account.data ?? {}).some((key) => key.startsWith('cv:wr'));
  } catch {
    return null;
  }
};

// Cavos seals the signing key inside the account and each browser keeps its own copy of what opens it. The device
// factor derived from the password enrolls the first browser and unlocks every other device the user logs into, so a
// phone needs nothing beyond signing in.
// Enables this browser to sign, or explains why it could not. It never throws: the caller has already verified the
// user, and a login must not fail over this.
const authorizeDevice = async (wallet: CavosStellar, deviceCode: string): Promise<{ ok: boolean; error: string }> => {
  if (wallet.status === 'needs-device-approval') {
    if (await hasDeviceFactor(wallet.address) === false) {
      return { ok: false, error: 'Tu cuenta todavía no tiene habilitado el uso en varios dispositivos. Abrí Verifire en la misma dirección donde la creaste (si fue en tu computadora, http://localhost:5501), entrá y habilitalo desde Mi perfil.' };
    }
    try {
      await wallet.approveThisDeviceWithRecovery(deviceCode);
      return { ok: true, error: '' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        error: /wrong factor|not enrolled/i.test(message)
          ? 'No pudimos habilitar este dispositivo: la contraseña no abre la llave de tu cuenta. Entrá con la misma contraseña con la que la creaste.'
          : message
      };
    }
  }
  // Saves the factor of an account created before this existed; a new account saves it with its first login.
  try {
    await wallet.setupRecovery(deviceCode);
    return { ok: true, error: '' };
  } catch (error) {
    return { ok: false, error: `No se pudo guardar el uso en varios dispositivos: ${error instanceof Error ? error.message : String(error)}` };
  }
};

export const connectCavosWallet = async (appId: string, auth: CavosAuth, identity: Identity, deviceCode?: string) => {
  const wallet = await openCavosWallet(appId, auth, identity);
  rememberWallet(wallet.address);
  rememberDeviceCode(deviceCode);
  const device = deviceCode ? await authorizeDevice(wallet, deviceCode) : { ok: false, error: '' };
  return { address: wallet.address, deviceFactor: device.ok, deviceError: device.error };
};

// A wallet able to sign on Stellar. A password-only login has no Cavos session, but the Cavos user id saved when the
// Gmail was verified reconnects the same wallet, whose keys stay in this browser's IndexedDB.
export const connectSigningWallet = async (appId: string, expectedAddress: string) => {
  const account = storedUser();
  const auth = await createCavosAuth(appId);
  const sameAccount = Boolean(account?.email) && account?.email === userSession.email();
  const identity = auth.restoreIdentity() ?? (sameAccount && account?.cavosUserId ? { userId: account.cavosUserId, email: account.email } : null);
  if (!identity) throw new EmailCodeRequiredError();

  const wallet = await openCavosWallet(appId, auth, identity);
  if (wallet.address !== expectedAddress) {
    throw new Error('La wallet Cavos de este navegador no coincide con la de tu cuenta. Cerrá sesión y volvé a entrar.');
  }
  // This browser is enabled while signing in (see authorizeDevice). Reaching here means that did not happen, which is
  // not a missing email code: the session stays open and the message says what to do.
  if (wallet.status === 'needs-device-approval') {
    throw new Error(await hasDeviceFactor(wallet.address) === false
      ? 'Tu cuenta todavía no tiene habilitado el uso en varios dispositivos, y esta dirección del sitio no tiene su llave. Abrí Verifire donde creaste la cuenta (si fue en tu computadora, http://localhost:5501) y habilitalo ahí desde Mi perfil.'
      : 'Esta dirección del sitio todavía no puede firmar. Cerrá sesión, volvé a entrar con tu contraseña y probá de nuevo.');
  }
  return wallet;
};

export const resolveWalletAddress = async (appId: string) => {
  const cached = readStored<{ address?: unknown }>(localStorage, WALLET_KEY);
  if (isStellarAddress(cached?.address)) return cached.address;
  // The account keeps the wallet linked when its Gmail was verified, so a new session does not reconnect to Cavos.
  const account = storedUser();
  if (isStellarAddress(account?.walletAddress) && account.email === userSession.email()) {
    rememberWallet(account.walletAddress);
    return account.walletAddress;
  }
  const auth = await createCavosAuth(appId);
  const identity = auth.restoreIdentity();
  if (!identity) throw new Error('No encontramos tu cuenta Cavos en este navegador. Cerrá sesión y volvé a entrar.');
  return (await connectCavosWallet(appId, auth, identity)).address;
};
