import type { SubmitEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { PasswordField } from './PasswordField';

interface LoginFormProps {
  hidden: boolean;
  submitting: boolean;
  googleBusy: boolean;
  onSubmit: (form: HTMLFormElement) => void;
  onGoogleLogin: () => void;
}

export function LoginForm({ hidden, submitting, googleBusy, onSubmit, onGoogleLogin }: LoginFormProps) {
  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(event.currentTarget);
  };

  return (
    <form id="login-panel" className="auth-form" role="tabpanel" aria-labelledby="login-tab" noValidate hidden={hidden} onSubmit={handleSubmit}>
      <label>
        <span>Nombre de usuario o correo electrónico</span>
        <input name="identifier" type="text" placeholder="usuario_verifire o tu@correo.com" autoComplete="username" required />
      </label>

      <PasswordField id="password" name="password" label="Contraseña" placeholder="Mínimo 8 caracteres" autoComplete="current-password" />

      <p className="auth-guide">¿Entrás desde otro dispositivo? Usá tu correo y te enviamos un código para recuperar tu cuenta y tu wallet.</p>

      <button type="submit" className="button button-primary auth-submit" disabled={submitting}>Entrar a Verifire</button>

      <div className="auth-divider"><span>o continúa con</span></div>
      <button type="button" className="button button-secondary google-login" disabled={googleBusy} onClick={onGoogleLogin}>
        <Icon name="fa-brands fa-google" /> Continuar con Google
      </button>
    </form>
  );
}
