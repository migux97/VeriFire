import { useEffect, useRef, type SubmitEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { PasswordField } from './PasswordField';

interface ResetPasswordFormProps {
  hidden: boolean;
  submitting: boolean;
  // The email to start from: the one typed in the login, or the account kept in this browser.
  email: string;
  // Cavos' recovery is on: the key opens on any device, so there is no need to use one the account already used.
  anyDevice: boolean;
  onSubmit: (form: HTMLFormElement) => void;
  onBack: () => void;
}

// "¿Olvidaste tu contraseña?": the email, the new password and, after a code sent to that email, the account's key is
// saved again with the new password (see resetKeyPassword).
export function ResetPasswordForm({ hidden, submitting, email, anyDevice, onSubmit, onBack }: ResetPasswordFormProps) {
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (hidden || !emailRef.current) return;
    if (email) emailRef.current.value = email;
    emailRef.current.focus();
  }, [hidden, email]);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(event.currentTarget);
  };

  return (
    <form id="reset-panel" className="auth-form" aria-labelledby="reset-title" noValidate hidden={hidden} onSubmit={handleSubmit}>
      <div className="auth-reset-head">
        <span className="verification-badge"><Icon name="fa-solid fa-key" /></span>
        <h2 id="reset-title">Recuperá tu contraseña</h2>
        <p>
          {anyDevice
            ? 'Escribí el correo de tu cuenta. Te enviamos un enlace para confirmar que sos vos, y tus garantías, tu empresa y tu wallet siguen iguales.'
            : 'Escribí el correo de tu cuenta y la contraseña nueva. Te enviamos un código para confirmar que sos vos, y tus garantías, tu empresa y tu wallet siguen iguales.'}
        </p>
      </div>

      <label>
        <span>Correo electrónico</span>
        <input ref={emailRef} name="email" type="email" placeholder="tu@correo.com" autoComplete="email" required />
      </label>

      {anyDevice ? (
        <p className="auth-guide">
          Te enviamos un enlace a tu correo. Abrilo en el dispositivo y el navegador donde querés entrar, y ahí elegís la contraseña
          nueva. La llave de tu wallet se recupera de forma segura, sin que nadie más la vea.
        </p>
      ) : (
        <>
          <PasswordField id="resetPassword" name="password" label="Contraseña nueva" placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
          <PasswordField id="resetPasswordConfirm" name="passwordConfirm" label="Repetir contraseña nueva" placeholder="Escribí la misma contraseña" autoComplete="new-password" />
          <p className="auth-guide">
            Usá mínimo 8 caracteres, con una mayúscula, una minúscula y un número. Hacelo desde un dispositivo donde ya hayas entrado a
            tu cuenta: la llave de tu wallet se vuelve a guardar con la contraseña nueva.
          </p>
        </>
      )}

      <button type="submit" className="button button-primary auth-submit" disabled={submitting}>{anyDevice ? 'Enviar enlace' : 'Enviar código'}</button>
      <button type="button" className="verification-back-button" onClick={onBack}>Volver a iniciar sesión</button>
    </form>
  );
}
