import { useEffect, useRef, type ChangeEvent, type SubmitEvent } from 'react';
import { Icon } from '@/components/ui/Icon';

export type VerificationKind = 'register' | 'login' | 'new-device' | 'reset' | 'password-changed';

interface EmailCodeFormProps {
  kind: VerificationKind;
  email: string;
  verifying: boolean;
  resendLabel: string;
  resendDisabled: boolean;
  onSubmit: (code: string, field: HTMLInputElement) => void;
  onResend: () => void;
  onBack: () => void;
}

const TITLES: Record<VerificationKind, string> = {
  'new-device': 'Recuperá tu cuenta',
  reset: 'Confirmá que sos vos',
  'password-changed': 'Confirmá tu contraseña nueva',
  login: 'Confirmá tu correo',
  register: 'Revisá tu correo'
};

function Description({ kind, email }: { kind: VerificationKind; email: string }) {
  const address = <strong>{email}</strong>;
  if (kind === 'new-device') {
    return <p>Este dispositivo todavía no conoce tu cuenta. Ingresá el código de 6 dígitos que enviamos a {address} y vas a entrar con tu misma wallet y tus mismas garantías.</p>;
  }
  if (kind === 'password-changed') {
    return <p>Tu contraseña cambió desde otro dispositivo. Ingresá el código de 6 dígitos que enviamos a {address} para usarla también en este navegador.</p>;
  }
  if (kind === 'reset') {
    return <p>Ingresá el código de 6 dígitos que enviamos a {address} para cambiar tu contraseña. Tus garantías, tu empresa y tu wallet no cambian.</p>;
  }
  if (kind === 'login') {
    return <p>Por seguridad te pedimos un código cada 7 días. Ingresá el código de 6 dígitos que enviamos a {address}. Durante los próximos 7 días vas a entrar solo con tu contraseña.</p>;
  }
  return <p>Enviamos un código de 6 dígitos a {address}. Ingresalo para crear tu cuenta Verifire y vincular Cavos.</p>;
}

export function EmailCodeForm({ kind, email, verifying, resendLabel, resendDisabled, onSubmit, onResend, onBack }: EmailCodeFormProps) {
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    codeRef.current?.focus();
  }, []);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (codeRef.current) onSubmit(codeRef.current.value.replace(/\D/g, ''), codeRef.current);
  };

  // Pasting the code (or typing its sixth digit) verifies it right away.
  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const field = event.currentTarget;
    const digits = field.value.replace(/\D/g, '').slice(0, 6);
    if (field.value !== digits) field.value = digits;
    if (digits.length === 6) field.form?.requestSubmit();
  };

  return (
    <form className="email-verification-form" noValidate onSubmit={handleSubmit}>
      <div className="verification-badge"><Icon name="fa-solid fa-envelope-circle-check" /></div>
      <h2>{TITLES[kind]}</h2>
      <Description kind={kind} email={email} />
      <label htmlFor="verification-code">Código de verificación</label>
      <input
        ref={codeRef}
        id="verification-code"
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        required
        onChange={handleInput}
      />
      <button type="submit" className="button button-primary" disabled={verifying}>Verificar código</button>
      <div className="magic-link-status"><Icon name="fa-regular fa-clock" /><span>El código vence en 10 minutos.</span></div>
      <button type="button" className="button button-secondary" disabled={resendDisabled} onClick={onResend}>{resendLabel}</button>
      <button type="button" className="verification-back-button" onClick={onBack}>Volver</button>
    </form>
  );
}
