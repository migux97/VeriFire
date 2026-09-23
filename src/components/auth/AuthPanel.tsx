// Login, registration and the email code. The account is kept in this browser; Cavos verifies the email and holds the
// Stellar wallet.
import type { CavosAuth, Identity } from '@cavos/kit';
import { useEffect, useRef, useState } from 'react';
import { persistUser, storedUser, type StoredUser } from '@/lib/client/account';
import { describeAuthError, googleCallbackUrl, sendEmailCode, verifyEmailCode } from '@/lib/client/email-code';
import { deviceCodeFor, hashPassword, verifyPassword } from '@/lib/client/password';
import { hasPendingClaim } from '@/lib/client/qr';
import { userSession, type SessionEndReason } from '@/lib/client/session';
import { readStored, writeStored } from '@/lib/client/storage';
import { connectCavosWallet, createCavosAuth, rememberDeviceCode, rememberWallet } from '@/lib/client/wallet';
import { pendingCompanyInvitation } from '@/lib/client/workspace';
import { errorMessage } from '@/lib/errors';
import { isStellarAddress } from '@/lib/validation';
import { EmailCodeForm, type VerificationKind } from './EmailCodeForm';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { useResendCooldown } from './useResendCooldown';

type AuthMode = 'login' | 'register';
type NoticeTone = 'info' | 'success' | 'error';

interface Notice {
  text: string;
  tone: NoticeTone;
}

interface PendingVerification {
  auth: CavosAuth;
  nonce?: unknown;
  email: string;
  user: StoredUser;
  mode: AuthMode;
  newDevice: boolean;
  deviceCode?: string;
  // Set once the email code was accepted: a wrong password is typed again without asking for another code.
  identity?: Identity;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$/;
// The email is confirmed with a code on registration and again on the first login after this long.
const EMAIL_CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const PENDING_GOOGLE_KEY = 'verifirePendingCavosAuth';

const SESSION_NOTICES: Record<SessionEndReason, Notice> = {
  expirada: { text: 'Tu sesión expiró por seguridad. Iniciá sesión nuevamente.', tone: 'info' },
  cerrada: { text: 'Tu sesión se cerró. Iniciá sesión cuando quieras volver.', tone: 'success' },
  verificar: { text: 'Para registrar tu garantía en Stellar necesitamos confirmar tu correo. Iniciá sesión y te enviaremos un código.', tone: 'info' }
};

const inputOf = (form: HTMLFormElement, name: string) => form.elements.namedItem(name) as HTMLInputElement | null;

const verificationKind = ({ newDevice, mode }: PendingVerification): VerificationKind =>
  newDevice ? 'new-device' : mode === 'login' ? 'login' : 'register';

const googleUserFromIdentity = (identity: Identity): StoredUser => {
  const email = identity.email ?? '';
  if (!EMAIL_PATTERN.test(email)) throw new Error('La cuenta de Google debe incluir una dirección de correo válida.');
  const existingUser = storedUser();
  const sameAccount = existingUser?.email?.toLowerCase() === email.toLowerCase();
  return {
    name: identity.name || (sameAccount && existingUser?.name) || 'Usuario de Google',
    email,
    passwordHash: sameAccount ? existingUser?.passwordHash : undefined,
    provider: 'google'
  };
};

interface AuthPanelProps {
  cavosAppId: string;
}

export function AuthPanel({ cavosAppId }: AuthPanelProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [verification, setVerification] = useState<{ kind: VerificationKind; email: string } | null>(null);
  const [notice, setNotice] = useState<Notice>({ text: '', tone: 'info' });
  const [submitting, setSubmitting] = useState<AuthMode | null>(null);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [savedUsername, setSavedUsername] = useState('');
  const pending = useRef<PendingVerification | null>(null);
  // Set synchronously: a pasted code submits on its own, and a second submit may come before the next render.
  const codeInFlight = useRef(false);
  const cooldown = useResendCooldown();

  const showNotice = (text: string, tone: NoticeTone = 'info') => setNotice({ text, tone });

  const requestEmailCode = async (email: string) => {
    if (!cavosAppId) throw new Error('Configurá CAVOS_APP_ID con el App ID real de Cavos antes de verificar el correo.');
    const auth = await createCavosAuth(cavosAppId);
    showNotice('Enviando un código a tu correo...');
    const nonce = await sendEmailCode(auth, email);
    return { auth, nonce };
  };

  const openVerification = (verificationToOpen: PendingVerification, { resetCooldown = true } = {}) => {
    pending.current = verificationToOpen;
    setVerification({ kind: verificationKind(verificationToOpen), email: verificationToOpen.email });
    showNotice('');
    // Coming back to a code that was already sent keeps its countdown instead of starting a new one.
    if (resetCooldown) cooldown.start();
  };

  // Opens the panel for a verified account. The wallet address and the verification date are saved in the account
  // when the email is verified, so logins in the next 7 days only need the password.
  const enterApp = (user: StoredUser, loginMode: AuthMode, warning = '') => {
    persistUser(user);
    rememberWallet(user.walletAddress);
    userSession.start(user.email);
    // A warning (for example, a device that cannot sign yet) is readable before the panel opens.
    showNotice(warning || (loginMode === 'login' ? 'Sesión iniciada correctamente. Redirigiendo...' : 'Cuenta creada correctamente. Redirigiendo...'), warning ? 'info' : 'success');
    window.setTimeout(() => {
      window.location.href = pendingCompanyInvitation(user.email) ? '/choose-workspace' : user.accountType === 'business' ? '/company' : '/app';
    }, warning ? 3200 : 700);
  };

  // False when the password did not open the account's key: the user is back at the form to type it again.
  const finishAuthFlow = async (identity: Identity) => {
    const current = pending.current;
    if (!current) throw new Error('La verificación expiró. Iniciá el proceso nuevamente.');
    const { user, mode: loginMode, auth, deviceCode } = current;
    if (identity.email && identity.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new Error('La verificación de Cavos corresponde a otro correo. Iniciá el proceso nuevamente.');
    }
    // Cavos already accepted the code, and a code is single-use: only Cavos failing to return the wallet is fatal
    // here. A device that could not be enabled to sign gets in anyway, with the reason shown.
    let connection;
    try {
      connection = await connectCavosWallet(cavosAppId, auth, identity, deviceCode);
    } catch (error) {
      throw new Error(`${errorMessage(error)} Ese código ya fue usado: pedí uno nuevo para volver a intentar.`);
    }
    if (connection.wrongPassword) {
      pending.current = { ...current, identity };
      setVerification(null);
      setMode(current.mode);
      showNotice(connection.deviceError, 'error');
      return false;
    }
    pending.current = null;
    // Starts the 7 days during which logging in only needs the password. The Cavos user id lets the panel reconnect
    // the same wallet to sign on Stellar after a password-only login (see connectSigningWallet).
    enterApp({
      ...user,
      walletAddress: connection.address,
      cavosUserId: identity.userId,
      emailVerifiedAt: Date.now(),
      deviceFactorAt: connection.deviceFactor ? Date.now() : 0
    }, loginMode, connection.deviceError);
    return true;
  };

  const handleAuthSubmit = async (formMode: AuthMode, form: HTMLFormElement) => {
    const identifierField = inputOf(form, formMode === 'register' ? 'email' : 'identifier');
    const passwordField = inputOf(form, 'password');
    const confirmField = formMode === 'register' ? inputOf(form, 'passwordConfirm') : null;
    const username = formMode === 'register' ? inputOf(form, 'username')?.value.trim() ?? '' : '';
    const accountType = formMode === 'register' && inputOf(form, 'accountType')?.value === 'business' ? 'business' : 'personal';
    const companyName = formMode === 'register' ? inputOf(form, 'companyName')?.value.trim() ?? '' : '';
    const identifier = identifierField?.value.trim() ?? '';
    const password = passwordField?.value.trim() ?? '';

    if (!identifier || !password) {
      showNotice('Completa tu nombre de usuario o correo y tu contraseña para continuar.', 'error');
      return;
    }
    if (formMode === 'register' && !EMAIL_PATTERN.test(identifier)) {
      showNotice('Usá una dirección de correo válida.', 'error');
      identifierField?.focus();
      return;
    }
    if (!PASSWORD_PATTERN.test(password)) {
      showNotice('La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número.', 'error');
      passwordField?.focus();
      return;
    }
    if (confirmField && confirmField.value.trim() !== password) {
      showNotice('Las contraseñas no coinciden. Escribí la misma contraseña en los dos campos.', 'error');
      confirmField.focus();
      return;
    }
    if (formMode === 'register' && !username) {
      showNotice('Ingresa un nombre de usuario para crear tu cuenta.', 'error');
      return;
    }
    if (formMode === 'register' && accountType === 'business' && !companyName) {
      showNotice('Ingresá el nombre de la empresa para crear el panel empresarial.', 'error');
      inputOf(form, 'companyName')?.focus();
      return;
    }

    const existingUser = storedUser();
    // Accounts live in each browser. On a new device (a phone that scanned a QR) signing in with the email and its
    // code rebuilds the account here, and Cavos returns the same wallet, so the warranties are the same ones.
    const newDevice = formMode === 'login' && EMAIL_PATTERN.test(identifier)
      && existingUser?.email?.toLowerCase() !== identifier.toLowerCase();

    if (formMode === 'login' && !newDevice) {
      if (!existingUser) {
        showNotice('En este navegador todavía no hay ninguna cuenta. Ingresá con tu correo y te enviamos un código para recuperarla, o creá una cuenta nueva.', 'error');
        return;
      }
      const matchesUsername = existingUser.name?.toLowerCase() === identifier.toLowerCase();
      const matchesEmail = existingUser.email?.toLowerCase() === identifier.toLowerCase();
      if (!matchesUsername && !matchesEmail) {
        showNotice('El nombre de usuario, correo o contraseña no coinciden.', 'error');
        return;
      }
    }

    setSubmitting(formMode);
    let redirecting = false;
    try {
      let user: StoredUser;
      if (formMode === 'register') {
        user = { name: username, email: identifier, accountType, ...(accountType === 'business' ? { companyName } : {}), passwordHash: await hashPassword(password) };
      } else if (newDevice) {
        // The code sent to the email is what proves who this is; the password is only this device's local gate.
        user = { name: identifier.split('@')[0] ?? identifier, email: identifier, passwordHash: await hashPassword(password) };
      } else {
        if (!existingUser || !(await verifyPassword(existingUser, password))) {
          showNotice('El nombre de usuario, correo o contraseña no coinciden.', 'error');
          return;
        }
        const { password: legacyPassword, ...account } = existingUser;
        user = account;
        if (legacyPassword) {
          user = { ...account, passwordHash: await hashPassword(password) };
          persistUser(user);
        }
        // The email is confirmed with a code when the account is created and again every 7 days; in between, logging
        // in only needs the password.
        const emailRecentlyVerified = Date.now() - Number(user.emailVerifiedAt || 0) < EMAIL_CHECK_INTERVAL_MS;
        // An account created before the multi-device factor existed is asked for the code once, so entering it is
        // enough on any other device from then on.
        if (isStellarAddress(user.walletAddress) && emailRecentlyVerified && user.deviceFactorAt) {
          // Kept for this tab so the panel can repair an account whose multi-device access was never saved.
          rememberDeviceCode(await deviceCodeFor(user.email, password));
          redirecting = true;
          enterApp(user, 'login');
          return;
        }
      }

      const deviceCode = await deviceCodeFor(user.email, password);
      // The email was already confirmed and only the password was wrong: this one is tried with the same code.
      const confirmed = pending.current?.email === user.email ? pending.current.identity : undefined;
      if (confirmed && pending.current) {
        pending.current = { ...pending.current, user, mode: formMode, newDevice, deviceCode };
        showNotice('Comprobando la contraseña...');
        redirecting = await finishAuthFlow(confirmed);
        return;
      }
      // A code already sent to this address stays valid: reuse it instead of asking Cavos for another one, which it
      // refuses within a minute of the previous request.
      if (pending.current?.email === user.email) {
        openVerification({ ...pending.current, user, mode: formMode, newDevice, deviceCode }, { resetCooldown: false });
        return;
      }
      const { auth, nonce } = await requestEmailCode(user.email);
      openVerification({ auth, nonce, email: user.email, user, mode: formMode, newDevice, deviceCode });
    } catch (error) {
      showNotice(describeAuthError(error, 'No se pudo preparar tu cuenta Cavos. Intentá nuevamente.'), 'error');
    } finally {
      if (!redirecting) setSubmitting(null);
    }
  };

  const handleCodeSubmit = async (code: string, field: HTMLInputElement) => {
    if (codeInFlight.current) return;
    const current = pending.current;
    if (!current) {
      showNotice('La verificación expiró. Iniciá el proceso nuevamente.', 'error');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      showNotice('Ingresá el código de 6 dígitos que te enviamos por correo.', 'error');
      field.focus();
      return;
    }

    codeInFlight.current = true;
    setVerifyingCode(true);
    showNotice('Verificando el código y preparando tu cuenta...');
    try {
      const identity = await verifyEmailCode(current.auth, current.nonce, current.email, code);
      // On success the button stays disabled until the redirect.
      if (!(await finishAuthFlow(identity))) {
        codeInFlight.current = false;
        setVerifyingCode(false);
      }
    } catch (error) {
      showNotice(describeAuthError(error, 'No se pudo verificar el código.'), 'error');
      field.select();
      codeInFlight.current = false;
      setVerifyingCode(false);
    }
  };

  const resendEmailCode = async () => {
    const current = pending.current;
    if (!current || cooldown.isWaiting()) return;
    setResending(true);
    showNotice('Enviando un nuevo código...');
    try {
      current.nonce = await sendEmailCode(current.auth, current.email);
      cooldown.start();
      showNotice('Enviamos un nuevo código. Usá el del último correo recibido.', 'success');
    } catch (error) {
      showNotice(describeAuthError(error, 'No se pudo reenviar el código.'), 'error');
    } finally {
      setResending(false);
    }
  };

  // Returns to the form the user came from, keeping the code alive: Cavos only sends a new one once a minute.
  const leaveVerification = () => {
    setVerification(null);
    setMode(pending.current?.mode === 'register' ? 'register' : 'login');
    showNotice(pending.current ? 'Tu código sigue siendo válido: tocá "Entrar a Verifire" para volver a ingresarlo.' : '');
  };

  const startGoogleLogin = async () => {
    if (!cavosAppId) {
      showNotice('Configurá CAVOS_APP_ID con el App ID real de Cavos para entrar con Google.', 'error');
      return;
    }
    setGoogleBusy(true);
    showNotice('Redirigiendo a Google...');
    try {
      const auth = await createCavosAuth(cavosAppId);
      const oauthUrl = await auth.getGoogleOAuthUrl(googleCallbackUrl());
      writeStored(localStorage, PENDING_GOOGLE_KEY, { mode: 'google' });
      window.location.href = oauthUrl;
    } catch (error) {
      showNotice(describeAuthError(error, 'No se pudo iniciar sesión con Google.'), 'error');
      setGoogleBusy(false);
    }
  };

  useEffect(() => {
    // The <head> script already left for the panel (active session) before the form was drawn.
    if (document.documentElement.classList.contains('is-redirecting')) return;

    setSavedUsername(storedUser()?.name ?? '');

    const params = new URLSearchParams(window.location.search);
    // "Crear cuenta" on the landing page opens the registration form.
    if (params.get('modo') === 'registro') setMode('register');
    const reason = params.get('sesion');
    if (reason && reason in SESSION_NOTICES) {
      setNotice(SESSION_NOTICES[reason as SessionEndReason]);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (hasPendingClaim()) {
      // Set by the buyer's panel when a secret QR link was opened without a session.
      showNotice('Escaneaste el QR de un producto. Iniciá sesión para activar su garantía.');
    }

    const handleGoogleCallback = async () => {
      if (!params.has('cavos_auth_code')) return;
      const pendingGoogle = readStored<{ mode?: string }>(localStorage, PENDING_GOOGLE_KEY);
      localStorage.removeItem(PENDING_GOOGLE_KEY);
      window.history.replaceState({}, document.title, window.location.pathname);
      if (pendingGoogle?.mode !== 'google') {
        showNotice('Este acceso de Cavos expiró o ya fue utilizado. Iniciá sesión nuevamente.', 'error');
        return;
      }
      try {
        const auth = await createCavosAuth(cavosAppId);
        showNotice('Confirmando tu acceso con Google y preparando tu cuenta...');
        const identity = await auth.handleCallback(`?${params}`, googleCallbackUrl());
        const user = googleUserFromIdentity(identity);
        pending.current = { auth, email: user.email, user, mode: 'login', newDevice: false };
        await finishAuthFlow(identity);
      } catch (error) {
        showNotice(describeAuthError(error, 'No se pudo confirmar el acceso con Google.'), 'error');
      }
    };
    void handleGoogleCallback();
    // Runs once, on the page load that may carry the Google callback.
  }, []);

  return (
    <>
      {!verification && (
        <div className="auth-header">
          <div className="auth-tabs" role="tablist" aria-label="Acceso de usuario">
            {(['login', 'register'] as const).map((tabMode) => (
              <button
                key={tabMode}
                id={`${tabMode}-tab`}
                className={`auth-tab${mode === tabMode ? ' active' : ''}`}
                type="button"
                role="tab"
                aria-selected={mode === tabMode}
                aria-controls={`${tabMode}-panel`}
                onClick={() => setMode(tabMode)}
              >
                {tabMode === 'login' ? 'Iniciar sesión' : 'Registrarse'}
              </button>
            ))}
          </div>
        </div>
      )}

      <LoginForm
        hidden={Boolean(verification) || mode !== 'login'}
        submitting={submitting === 'login'}
        googleBusy={googleBusy}
        onSubmit={(form) => void handleAuthSubmit('login', form)}
        onGoogleLogin={() => void startGoogleLogin()}
      />
      <RegisterForm
        hidden={Boolean(verification) || mode !== 'register'}
        submitting={submitting === 'register'}
        savedUsername={savedUsername}
        onSubmit={(form) => void handleAuthSubmit('register', form)}
      />

      {verification && (
        <EmailCodeForm
          kind={verification.kind}
          email={verification.email}
          verifying={verifyingCode}
          resendLabel={cooldown.label}
          resendDisabled={resending || cooldown.waiting}
          onSubmit={(code, field) => void handleCodeSubmit(code, field)}
          onResend={() => void resendEmailCode()}
          onBack={leaveVerification}
        />
      )}

      <p className={notice.text ? `auth-message ${notice.tone}` : 'auth-message'} aria-live="polite">{notice.text}</p>
    </>
  );
}
