// Email verification through Cavos.
// Email is verified with a Cavos OTP code, not a magic link: the magic-link flow returns a raw Firebase token that the
// Cavos wallet registry rejects ("Invalid user token"), while the OTP flow returns the Cavos-signed JWT it accepts.
import type { CavosAuth } from '@cavos/kit';

// Cavos only accepts redirect URIs registered for the app, and the one registered is /index.html: Google login
// returns there and the server redirects it to the login page, query included.
export const googleCallbackUrl = () => `${window.location.origin}/index.html`;

// What a return from Cavos (Google, or a link from an email) comes back for: kept in this browser before leaving.
export const PENDING_CAVOS_AUTH_KEY = 'verifirePendingCavosAuth';

const authErrorMessages: [RegExp, () => string][] = [
  [/redirect_uri is not registered/i, () => `Cavos rechazó la URL de retorno. Agregá ${googleCallbackUrl()} en las Callback URLs de tu app en el panel de Cavos.`],
  [/code_expired/i, () => 'El código venció. Pedí uno nuevo.'],
  [/too_many_attempts/i, () => 'Demasiados intentos con este código. Pedí uno nuevo.'],
  [/invalid_nonce/i, () => 'Este código ya no es válido en esta pestaña. Pedí uno nuevo.'],
  [/invalid_code|invalid_otp|otp_not_found/i, () => 'El código no es correcto. Revisá el último correo recibido.']
];

export const describeAuthError = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : '';
  const match = authErrorMessages.find(([pattern]) => pattern.test(message));
  return match ? match[1]() : message || fallback;
};

// The kit keeps the nonce of the last code request private, and verifyOtp consumes it on its first attempt. It is
// read after sending a code and put back before each verification, so a mistyped code can be retried without Cavos
// answering invalid_nonce.
type EmailCodeNonce = unknown;
const nonceHolder = (auth: CavosAuth) => auth as unknown as { pendingNonce: EmailCodeNonce };

export const sendEmailCode = async (auth: CavosAuth, email: string): Promise<EmailCodeNonce> => {
  await auth.sendOtp(email);
  return nonceHolder(auth).pendingNonce;
};

// The link Cavos emails to recover an account. Unlike the 6-digit code, it signs in through Firebase, whose proof is the
// one Cavos' recovery enclave accepts. Cavos sends the link back to the page that asked for it and only accepts the
// registered callback address, so the request is made as if from there; the server sends that address to the login.
export const sendRecoveryLink = async (auth: CavosAuth, email: string) => {
  const current = window.location.href;
  window.history.replaceState(window.history.state, '', '/index.html');
  try {
    // The kit reads the address as the request starts, before its first await: it is safe to put the real one back.
    await auth.sendMagicLink(email);
  } finally {
    window.history.replaceState(window.history.state, '', current);
  }
};

export const verifyEmailCode = (auth: CavosAuth, nonce: EmailCodeNonce, email: string, code: string) => {
  if (nonce) nonceHolder(auth).pendingNonce = nonce;
  return auth.verifyOtp(email, code);
};
