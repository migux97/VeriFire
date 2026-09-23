// The buyer's Stellar wallet, held by Cavos. Its signing key lives in this browser (IndexedDB) and under this site
// address: localhost and the public URL are two different places for it, even on the same computer.
import type { CavosAuth, CavosStellar, Identity } from '@cavos/kit';
import { isStellarAddress } from '../validation';
import { storedUser, updateStoredUser } from './account';
import { DEVICE_CODE_KEY, userSession, WALLET_KEY, WALLET_UPDATED_EVENT } from './session';
import { readStored, writeStored } from './storage';

const APP_SALT = 'verifire-demo';
// The multi-device factor is an encrypted wrap stored in the account itself (a cv:wr entry).
const HORIZON_URL = 'https://horizon-testnet.stellar.org';

// Thrown when signing needs the email confirmed again with a code: the panel sends the user to log in.
export class EmailCodeRequiredError extends Error {
  constructor() {
    super('Para firmar en Stellar necesitamos confirmar tu correo con un código.');
    this.name = 'EmailCodeRequiredError';
  }
}

// Thrown when this browser cannot sign yet. `canRetry`: the account's password can enable it here (see enableSigning);
// otherwise only the browser that created the wallet holds its key.
export class DeviceNotReadyError extends Error {
  readonly canRetry: boolean;

  constructor(message: string, canRetry: boolean) {
    super(message);
    this.canRetry = canRetry;
    this.name = 'DeviceNotReadyError';
  }
}

const ORIGINAL_BROWSER_ONLY = 'Tu cuenta todavía no guardó su llave en Stellar, y solo la tiene el navegador donde la creaste. Abrí Verifire ahí (si fue en tu computadora, http://localhost:5501), entrá una vez y volvé a probar acá.';
const WRONG_PASSWORD = 'Esa no es la contraseña de tu cuenta. Escribí la misma con la que la creaste.';

export const loadCavosKit = () => import('./cavos-kit');

export const createCavosAuth = async (appId: string) => {
  const { CavosAuth } = await loadCavosKit();
  return new CavosAuth(appId ? { appId } : {});
};

export const rememberWallet = (address: string | undefined) => {
  if (isStellarAddress(address)) {
    writeStored(localStorage, WALLET_KEY, { address, connectedAt: new Date().toISOString() });
    window.dispatchEvent(new Event(WALLET_UPDATED_EVENT));
  }
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
    // Not on Stellar yet: nothing was saved, and only the browser that created the wallet holds its key.
    if (response.status === 404) return false;
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
const authorizeDevice = async (wallet: CavosStellar, deviceCode: string): Promise<{ ok: boolean; error: string; wrongPassword?: boolean }> => {
  if (wallet.status === 'needs-device-approval') {
    if (await hasDeviceFactor(wallet.address) === false) {
      return { ok: false, error: 'Tu cuenta todavía no tiene habilitado el uso en varios dispositivos. Abrí Verifire en la misma dirección donde la creaste (si fue en tu computadora, http://localhost:5501), entrá y habilitalo desde Mi perfil.' };
    }
    try {
      await wallet.approveThisDeviceWithRecovery(deviceCode);
      return { ok: true, error: '' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const wrongPassword = /wrong factor|not enrolled/i.test(message);
      return { ok: false, wrongPassword, error: wrongPassword ? WRONG_PASSWORD : message };
    }
  }
  // Saves the factor of an account created before this existed; a new account saves it with its first login.
  try {
    await wallet.setupRecovery(deviceCode);
    // A new wallet exists only in this browser, and the kit keeps the factor in memory until the account is created on
    // Stellar: it is created now, with the factor, so another device or site address can open it from the first day.
    if (wallet.status === 'undeployed') await createAccountOnChain(wallet);
    return { ok: true, error: '' };
  } catch (error) {
    return { ok: false, error: `No se pudo guardar el uso en varios dispositivos: ${error instanceof Error ? error.message : String(error)}` };
  }
};

// Cavos creates the account with the first transaction it sends: a 1-stroop payment to itself, sponsored by Cavos. The
// payment can fail because the new account holds no XLM, which does not matter once the account exists.
export const createAccountOnChain = async (wallet: CavosStellar) => {
  try {
    await wallet.execute(1n, wallet.address);
  } catch (error) {
    // execute() moves the status to "ready" as soon as the account exists, even when the payment itself failed.
    if ((wallet.status as string) !== 'ready') throw new Error(`No se pudo crear tu cuenta en Stellar: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const connectCavosWallet = async (appId: string, auth: CavosAuth, identity: Identity, deviceCode?: string) => {
  const wallet = await openCavosWallet(appId, auth, identity);
  rememberWallet(wallet.address);
  rememberDeviceCode(deviceCode);
  const device = deviceCode ? await authorizeDevice(wallet, deviceCode) : { ok: false, error: '' };
  // The password opens the account's key on every device: one that does not is a wrong password, not a device issue.
  return { address: wallet.address, deviceFactor: device.ok, deviceError: device.error, wrongPassword: Boolean(device.wrongPassword) };
};

// The account's wallet, whatever this browser can do with it. A password-only login has no Cavos session, but the Cavos
// user id saved when the email was verified reconnects the same wallet, whose keys stay in this browser's IndexedDB.
const openOwnWallet = async (appId: string, expectedAddress: string) => {
  const account = storedUser();
  const auth = await createCavosAuth(appId);
  const sameAccount = Boolean(account?.email) && account?.email === userSession.email();
  const identity = auth.restoreIdentity() ?? (sameAccount && account?.cavosUserId ? { userId: account.cavosUserId, email: account.email } : null);
  if (!identity) throw new EmailCodeRequiredError();

  const wallet = await openCavosWallet(appId, auth, identity);
  if (wallet.address !== expectedAddress) {
    throw new Error('La wallet Cavos de este navegador no coincide con la de tu cuenta. Cerrá sesión y volvé a entrar.');
  }
  return wallet;
};

// A wallet able to sign on Stellar.
export const connectSigningWallet = async (appId: string, expectedAddress: string) => {
  const wallet = await openOwnWallet(appId, expectedAddress);
  // This browser is enabled while signing in (see authorizeDevice). Reaching here means that did not happen, which is
  // not a missing email code: the session stays open and the message says what to do.
  if (wallet.status === 'needs-device-approval') {
    const deviceCode = storedDeviceCode();
    const factor = await hasDeviceFactor(wallet.address);
    if (deviceCode && factor) {
      // The password of this login opens the account's factor: this browser is enabled here instead of at login.
      try {
        await wallet.approveThisDeviceWithRecovery(deviceCode);
        return wallet;
      } catch {
        // Falls through to the explanation below.
      }
    }
    throw factor === false
      ? new DeviceNotReadyError(ORIGINAL_BROWSER_ONLY, false)
      : new DeviceNotReadyError('Este navegador todavía no está habilitado para firmar con tu cuenta. Tocá "Reintentar" para habilitarlo.', true);
  }
  return wallet;
};

// Everything that lets this browser sign, from the account's password: enables it with the key saved in Stellar,
// creates the account on Stellar when it is not there yet, and saves that key when the account never did.
export const enableSigning = async (appId: string, expectedAddress: string, deviceCode: string) => {
  rememberDeviceCode(deviceCode);
  const wallet = await openOwnWallet(appId, expectedAddress);
  if (wallet.status === 'needs-device-approval') {
    if (await hasDeviceFactor(wallet.address) === false) throw new DeviceNotReadyError(ORIGINAL_BROWSER_ONLY, false);
    try {
      await wallet.approveThisDeviceWithRecovery(deviceCode);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(/wrong factor|not enrolled/i.test(message) ? WRONG_PASSWORD : message);
    }
  } else if (wallet.status === 'undeployed') {
    await wallet.setupRecovery(deviceCode);
    await createAccountOnChain(wallet);
  } else if (await hasDeviceFactor(wallet.address) === false) {
    await wallet.setupRecovery(deviceCode);
  }
  updateStoredUser({ deviceFactorAt: Date.now() });
};

export const resolveWalletAddress = async (appId: string) => {
  const cached = readStored<{ address?: unknown }>(localStorage, WALLET_KEY);
  if (isStellarAddress(cached?.address)) return cached.address;
  // The account keeps the wallet linked when its email was verified, so a new session does not reconnect to Cavos.
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
