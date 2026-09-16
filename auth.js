let authInitialized = false;
let pendingEmailVerification = null;
let resendCooldownTimer = null;
const gmailPattern = /^[^\s@]+@gmail\.com$/i;
const passwordPattern = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$/;
const cavosAppId = window.CAVOS_APP_ID || '';
// Cavos rejects a new code request within 60 seconds of the previous one.
const resendCooldownMs = 60 * 1000;
// The Gmail is confirmed with a code on registration and again on the first login after this long.
const emailCheckIntervalMs = 7 * 24 * 60 * 60 * 1000;
const pendingAuthKey = 'verifirePendingCavosAuth';
// Cavos only accepts redirect URIs registered for the app, so Google login always returns here.
const callbackUrl = () => `${window.location.origin}/index.html`;

const authErrorMessages = [
  [/redirect_uri is not registered/i, () => `Cavos rechazó la URL de retorno. Agregá ${callbackUrl()} en las Callback URLs de tu app en el panel de Cavos.`],
  [/code_expired/i, () => 'El código venció. Pedí uno nuevo.'],
  [/too_many_attempts/i, () => 'Demasiados intentos con este código. Pedí uno nuevo.'],
  [/invalid_nonce/i, () => 'Este código ya no es válido en esta pestaña. Pedí uno nuevo.'],
  [/invalid_code|invalid_otp|otp_not_found/i, () => 'El código no es correcto. Revisá el último correo recibido.']
];

const describeAuthError = (error, fallback) => {
  const message = error?.message || '';
  const match = authErrorMessages.find(([pattern]) => pattern.test(message));
  return match ? match[1]() : message || fallback;
};

const persistUser = (user) => {
  localStorage.setItem('verifireUser', JSON.stringify(user));
};

// Email is verified with a Cavos OTP code, not a magic link: the magic-link flow returns a
// raw Firebase token that the Cavos wallet registry rejects ("Invalid user token"), while
// the OTP flow returns the Cavos-signed JWT the registry accepts.
const sendEmailCode = async (auth, email) => {
  await auth.sendOtp(email);
  // verifyOtp consumes the request nonce on its first attempt; keep it so a mistyped code
  // can be retried without Cavos answering invalid_nonce.
  return auth.pendingNonce;
};

const requestEmailCode = async (email) => {
  if (!cavosAppId) {
    throw new Error('Configurá CAVOS_APP_ID con el App ID real de Cavos antes de verificar el Gmail.');
  }
  const { CavosAuth } = await import('./cavos.bundle.mjs');
  const auth = new CavosAuth({ appId: cavosAppId });

  showAuthMessage('Enviando un código a tu Gmail...', 'info');
  const nonce = await sendEmailCode(auth, email);
  return { auth, nonce };
};

const showEmailVerification = (email, { resetCooldown = true } = {}) => {
  document.querySelectorAll('.auth-tab, .auth-form').forEach((element) => {
    element.classList.add('hidden');
    if (element.matches('form')) element.hidden = true;
  });
  const verificationForm = document.getElementById('email-verification-form');
  const isLogin = pendingEmailVerification?.mode === 'login';
  const isNewDevice = Boolean(pendingEmailVerification?.newDevice);
  document.getElementById('verification-title').textContent = isNewDevice ? 'Recuperá tu cuenta' : isLogin ? 'Confirmá tu correo' : 'Revisá tu correo';
  document.getElementById('verification-description').innerHTML = isNewDevice
    ? `Este dispositivo todavía no conoce tu cuenta. Ingresá el código de 6 dígitos que enviamos a <strong>${escapeHtml(email)}</strong> y vas a entrar con tu misma wallet y tus mismas garantías.`
    : isLogin
    ? `Por seguridad te pedimos un código cada 7 días. Ingresá el código de 6 dígitos que enviamos a <strong>${escapeHtml(email)}</strong>. Durante los próximos 7 días vas a entrar solo con tu contraseña.`
    : `Enviamos un código de 6 dígitos a <strong>${escapeHtml(email)}</strong>. Ingresalo para crear tu cuenta Verifire y vincular Cavos.`;
  verificationForm.reset();
  verificationForm.classList.remove('hidden');
  verificationForm.hidden = false;
  document.getElementById('verification-code')?.focus();
  showAuthMessage('');
  // Coming back to a code that was already sent keeps its countdown instead of starting a new one.
  if (resetCooldown) startResendCooldown();
  else updateResendCooldown();
};

const startResendCooldown = () => {
  const resendButton = document.getElementById('resend-verification-code');
  if (!resendButton) return;

  const cooldownUntil = Date.now() + resendCooldownMs;
  sessionStorage.setItem('verifireOtpCooldownUntil', String(cooldownUntil));
  updateResendCooldown();
};

const updateResendCooldown = () => {
  const resendButton = document.getElementById('resend-verification-code');
  if (!resendButton) return;

  if (resendCooldownTimer) window.clearInterval(resendCooldownTimer);
  const cooldownUntil = Number(sessionStorage.getItem('verifireOtpCooldownUntil') || 0);
  const update = () => {
    const remainingMs = cooldownUntil - Date.now();
    if (remainingMs <= 0) {
      resendButton.disabled = false;
      resendButton.textContent = 'Reenviar código';
      sessionStorage.removeItem('verifireOtpCooldownUntil');
      if (resendCooldownTimer) window.clearInterval(resendCooldownTimer);
      return;
    }

    const remainingSeconds = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = String(remainingSeconds % 60).padStart(2, '0');
    resendButton.disabled = true;
    resendButton.textContent = `Reenviar código en ${minutes}:${seconds}`;
  };

  update();
  resendCooldownTimer = window.setInterval(update, 1000);
};

// Opens the panel for a verified account. The wallet address and the verification date are saved
// in the account when the Gmail is verified, so logins in the next 7 days only need the password.
const enterApp = (user, mode, warning = '') => {
  persistUser(user);
  rememberWallet(user.walletAddress);
  userSession.start(user.email);
  // A warning (for example, a device that cannot sign yet) is readable before the panel opens.
  showAuthMessage(warning || (mode === 'login' ? 'Sesión iniciada correctamente. Redirigiendo...' : 'Cuenta creada correctamente. Redirigiendo...'), warning ? 'info' : 'success');
  window.setTimeout(() => {
    window.location.href = 'app.html';
  }, warning ? 3200 : 700);
};

const finishAuthFlow = async (identity) => {
  const { user, mode, auth, deviceCode } = pendingEmailVerification;
  if (identity.email && identity.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new Error('La verificación de Cavos corresponde a otro correo. Iniciá el proceso nuevamente.');
  }
  // Cavos already accepted the code, and a code is single-use: only Cavos failing to return the wallet is fatal
  // here. A device that could not be enabled to sign gets in anyway, with the reason shown.
  let connection;
  try {
    connection = await connectCavosWallet(auth, identity, deviceCode);
  } catch (error) {
    throw new Error(`${error.message} Ese código ya fue usado: pedí uno nuevo para volver a intentar.`);
  }
  pendingEmailVerification = null;
  // Starts the 7 days during which logging in only needs the password. The Cavos user id lets the panel reconnect
  // the same wallet to sign on Stellar after a password-only login (see connectSigningWallet in common.js).
  enterApp({
    ...user,
    walletAddress: connection.address,
    cavosUserId: identity.userId,
    emailVerifiedAt: Date.now(),
    deviceFactorAt: connection.deviceFactor ? Date.now() : 0
  }, mode, connection.deviceError);
};

const startGoogleLogin = async () => {
  const googleButton = document.getElementById('google-login');
  if (!cavosAppId) {
    showAuthMessage('Configurá CAVOS_APP_ID con el App ID real de Cavos para entrar con Google.', 'error');
    return;
  }

  googleButton.disabled = true;
  showAuthMessage('Redirigiendo a Google...', 'info');
  try {
    const { CavosAuth } = await import('./cavos.bundle.mjs');
    const auth = new CavosAuth({ appId: cavosAppId });
    const oauthUrl = await auth.getGoogleOAuthUrl(callbackUrl());
    localStorage.setItem(pendingAuthKey, JSON.stringify({ mode: 'google' }));
    window.location.href = oauthUrl;
  } catch (error) {
    showAuthMessage(describeAuthError(error, 'No se pudo iniciar sesión con Google.'), 'error');
    googleButton.disabled = false;
  }
};

const showAuthMessage = (message, type = 'info') => {
  const messageBox = document.querySelector('.auth-message');
  if (!messageBox) return;

  messageBox.textContent = message;
  messageBox.className = `auth-message ${type}`;
};

const setAuthMode = (mode) => {
  const tabs = document.querySelectorAll('.auth-tab');
  const forms = document.querySelectorAll('.auth-form');

  tabs.forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });

  forms.forEach((form) => {
    const active = form.dataset.mode === mode;
    form.classList.toggle('hidden', !active);
    form.hidden = !active;
  });
};

const handleAuthSubmit = async (event) => {
  event.preventDefault();

  const target = event.currentTarget;
  const mode = target.dataset.mode;
  const identifierField = mode === 'register' ? target.querySelector('#registerEmail') : target.querySelector('#email');
  const passwordField = mode === 'register' ? target.querySelector('#registerPassword') : target.querySelector('#password');
  const confirmField = mode === 'register' ? target.querySelector('#registerPasswordConfirm') : null;
  const username = mode === 'register' ? target.querySelector('#username')?.value?.trim() : '';
  const identifier = identifierField?.value?.trim() || '';
  const email = mode === 'register' ? identifier : '';
  const password = passwordField?.value?.trim() || '';

  if (!identifier || !password) {
    showAuthMessage('Completa tu nombre de usuario o correo y tu contraseña para continuar.', 'error');
    return;
  }

  if (mode === 'register' && !gmailPattern.test(email)) {
    showAuthMessage('Usá una dirección de correo terminada en @gmail.com.', 'error');
    identifierField?.focus();
    return;
  }

  if (!passwordPattern.test(password)) {
    showAuthMessage('La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número.', 'error');
    passwordField?.focus();
    return;
  }

  if (confirmField && confirmField.value.trim() !== password) {
    showAuthMessage('Las contraseñas no coinciden. Escribí la misma contraseña en los dos campos.', 'error');
    confirmField.focus();
    return;
  }

  if (mode === 'register' && !username) {
    showAuthMessage('Ingresa un nombre de usuario para crear tu cuenta.', 'error');
    return;
  }

  const existingUser = storedUser();
  // Accounts live in each browser. On a new device (a phone that scanned a QR) signing in with the Gmail and its
  // code rebuilds the account here, and Cavos returns the same wallet, so the warranties are the same ones.
  const newDevice = mode === 'login' && gmailPattern.test(identifier)
    && existingUser?.email?.toLowerCase() !== identifier.toLowerCase();

  if (mode === 'login' && !newDevice) {
    if (!existingUser) {
      showAuthMessage('En este navegador todavía no hay ninguna cuenta. Ingresá con tu Gmail y te enviamos un código para recuperarla, o creá una cuenta nueva.', 'error');
      return;
    }

    const matchesUsername = existingUser.name?.toLowerCase() === identifier.toLowerCase();
    const matchesEmail = existingUser.email?.toLowerCase() === identifier.toLowerCase();
    if (!matchesUsername && !matchesEmail) {
      showAuthMessage('El nombre de usuario, correo o contraseña no coinciden.', 'error');
      return;
    }
  }

  const submitButton = target.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  let redirecting = false;

  try {
    let user;
    if (mode === 'register') {
      user = { name: username, email, passwordHash: await hashPassword(password) };
    } else if (newDevice) {
      // The code sent to the Gmail is what proves who this is; the password is only this device's local gate.
      user = { name: identifier.split('@')[0], email: identifier, passwordHash: await hashPassword(password) };
    } else {
      if (!(await verifyPassword(existingUser, password))) {
        showAuthMessage('El nombre de usuario, correo o contraseña no coinciden.', 'error');
        return;
      }
      const { password: legacyPassword, ...account } = existingUser;
      user = account;
      if (legacyPassword) {
        user = { ...account, passwordHash: await hashPassword(password) };
        persistUser(user);
      }
      // The Gmail is confirmed with a code when the account is created and again every 7 days;
      // in between, logging in only needs the password.
      const emailRecentlyVerified = Date.now() - Number(user.emailVerifiedAt || 0) < emailCheckIntervalMs;
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
    // A code already sent to this address stays valid: reuse it instead of asking Cavos for another one, which it
    // refuses within a minute of the previous request.
    if (pendingEmailVerification?.email === user.email) {
      pendingEmailVerification = { ...pendingEmailVerification, user, mode, newDevice, deviceCode };
      showEmailVerification(user.email, { resetCooldown: false });
      return;
    }
    const { auth, nonce } = await requestEmailCode(user.email);
    pendingEmailVerification = { auth, nonce, email: user.email, user, mode, newDevice, deviceCode };
    showEmailVerification(user.email);
  } catch (error) {
    showAuthMessage(describeAuthError(error, 'No se pudo preparar tu cuenta Cavos. Intentá nuevamente.'), 'error');
  } finally {
    if (!redirecting) submitButton.disabled = false;
  }
};

const handleCodeSubmit = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  // The code is also submitted automatically when pasted; ignore a submit while one is running.
  if (submitButton.disabled) return;
  if (!pendingEmailVerification) {
    showAuthMessage('La verificación expiró. Iniciá el proceso nuevamente.', 'error');
    return;
  }

  const codeField = form.querySelector('#verification-code');
  const code = codeField.value.replace(/\D/g, '');
  if (!/^\d{6}$/.test(code)) {
    showAuthMessage('Ingresá el código de 6 dígitos que te enviamos por correo.', 'error');
    codeField.focus();
    return;
  }

  submitButton.disabled = true;
  showAuthMessage('Verificando el código y preparando tu cuenta...', 'info');
  try {
    const { auth, nonce, email } = pendingEmailVerification;
    if (nonce) auth.pendingNonce = nonce;
    const identity = await auth.verifyOtp(email, code);
    // On success the button stays disabled until the redirect.
    await finishAuthFlow(identity);
  } catch (error) {
    showAuthMessage(describeAuthError(error, 'No se pudo verificar el código.'), 'error');
    codeField.select();
    submitButton.disabled = false;
  }
};

const resendEmailVerification = async () => {
  if (!pendingEmailVerification) return;

  const resendButton = document.getElementById('resend-verification-code');
  const cooldownUntil = Number(sessionStorage.getItem('verifireOtpCooldownUntil') || 0);
  if (cooldownUntil > Date.now()) {
    updateResendCooldown();
    return;
  }

  resendButton.disabled = true;
  showAuthMessage('Enviando un nuevo código...', 'info');
  try {
    pendingEmailVerification.nonce = await sendEmailCode(pendingEmailVerification.auth, pendingEmailVerification.email);
    startResendCooldown();
    showAuthMessage('Enviamos un nuevo código. Usá el del último correo recibido.', 'success');
  } catch (error) {
    showAuthMessage(describeAuthError(error, 'No se pudo reenviar el código.'), 'error');
    resendButton.disabled = false;
  }
};

const googleUserFromIdentity = (identity) => {
  if (!gmailPattern.test(identity.email || '')) {
    throw new Error('La cuenta de Google debe usar una dirección @gmail.com.');
  }
  const existingUser = storedUser();
  const sameAccount = existingUser?.email?.toLowerCase() === identity.email.toLowerCase();
  return {
    name: identity.name || (sameAccount && existingUser.name) || 'Usuario de Google',
    email: identity.email,
    passwordHash: sameAccount ? existingUser.passwordHash : undefined,
    provider: 'google'
  };
};

const handleGoogleCallback = async () => {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('cavos_auth_code')) return;

  let pending = null;
  try {
    pending = JSON.parse(localStorage.getItem(pendingAuthKey) || 'null');
  } catch {
    pending = null;
  }
  localStorage.removeItem(pendingAuthKey);
  window.history.replaceState({}, document.title, window.location.pathname);
  if (pending?.mode !== 'google') {
    showAuthMessage('Este acceso de Cavos expiró o ya fue utilizado. Iniciá sesión nuevamente.', 'error');
    return;
  }

  try {
    const { CavosAuth } = await import('./cavos.bundle.mjs');
    const auth = new CavosAuth({ appId: cavosAppId });
    showAuthMessage('Confirmando tu acceso con Google y preparando tu cuenta...', 'info');
    const identity = await auth.handleCallback(`?${params}`, callbackUrl());
    const user = googleUserFromIdentity(identity);
    pendingEmailVerification = { auth, email: user.email, user, mode: 'login' };
    await finishAuthFlow(identity);
  } catch (error) {
    showAuthMessage(describeAuthError(error, 'No se pudo confirmar el acceso con Google.'), 'error');
  }
};

// Pasting the code (or typing its sixth digit) verifies it right away.
const handleCodeInput = (event) => {
  const codeField = event.currentTarget;
  const digits = codeField.value.replace(/\D/g, '').slice(0, 6);
  if (codeField.value !== digits) codeField.value = digits;
  if (digits.length === 6) codeField.form.requestSubmit();
};

const togglePasswordVisibility = (button) => {
  const field = document.getElementById(button.dataset.passwordToggle);
  const show = field.type === 'password';
  field.type = show ? 'text' : 'password';
  button.setAttribute('aria-pressed', String(show));
  button.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
  button.querySelector('i')?.classList.replace(show ? 'fa-eye' : 'fa-eye-slash', show ? 'fa-eye-slash' : 'fa-eye');
};

const initializeAuth = () => {
  if (authInitialized) return;
  authInitialized = true;

  document.querySelectorAll('[data-password-toggle]').forEach((button) => {
    button.addEventListener('click', () => togglePasswordVisibility(button));
  });
  document.getElementById('verification-code')?.addEventListener('input', handleCodeInput);

  const tabs = document.querySelectorAll('.auth-tab');
  const forms = document.querySelectorAll('.auth-form');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => setAuthMode(tab.dataset.mode));
  });

  forms.forEach((form) => {
    form.addEventListener('submit', handleAuthSubmit);
  });

  document.getElementById('email-verification-form')?.addEventListener('submit', handleCodeSubmit);
  document.getElementById('google-login')?.addEventListener('click', startGoogleLogin);
  document.getElementById('resend-verification-code')?.addEventListener('click', resendEmailVerification);
  updateResendCooldown();
  document.getElementById('back-to-register')?.addEventListener('click', () => {
    // Return to the form the user came from, keeping the code alive: Cavos only sends a new one once a minute.
    const mode = pendingEmailVerification?.mode === 'register' ? 'register' : 'login';
    const verificationForm = document.getElementById('email-verification-form');
    verificationForm.classList.add('hidden');
    verificationForm.hidden = true;
    document.querySelectorAll('.auth-tab').forEach((tab) => tab.classList.remove('hidden'));
    setAuthMode(mode);
    showAuthMessage(pendingEmailVerification ? 'Tu código sigue siendo válido: tocá "Entrar a Verifire" para volver a ingresarlo.' : '', 'info');
  });

  const existingUser = storedUser();
  if (existingUser) {
    const nameField = document.querySelector('#username');
    if (nameField) nameField.value = existingUser.name || '';
  }

  setAuthMode('login');
};

const sessionNotices = {
  expirada: ['Tu sesión expiró por seguridad. Iniciá sesión nuevamente.', 'info'],
  cerrada: ['Tu sesión se cerró. Iniciá sesión cuando quieras volver.', 'success'],
  verificar: ['Para registrar tu garantía en Stellar necesitamos confirmar tu correo. Iniciá sesión y te enviaremos un código.', 'info']
};

const showSessionNotice = () => {
  const notice = sessionNotices[new URLSearchParams(window.location.search).get('sesion')];
  if (notice) {
    showAuthMessage(...notice);
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (sessionStorage.getItem('verifirePendingQr')) {
    // Set by app.js when a secret QR link was opened without a session.
    showAuthMessage('Escaneaste el QR de un producto. Iniciá sesión para activar su garantía.', 'info');
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  // The script in <head> already left for the panel (active session), before the form was drawn.
  if (document.documentElement.classList.contains('is-redirecting')) return;
  initializeAuth();
  showSessionNotice();
  await handleGoogleCallback();
});
