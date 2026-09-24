import { useEffect, useRef, type SubmitEvent } from 'react';
import { PasswordField } from './PasswordField';

interface RegisterFormProps {
  hidden: boolean;
  submitting: boolean;
  // The name of the account already kept in this browser, if any.
  savedUsername: string;
  // Came from "Registrar mi empresa": the company is created in the next step.
  forCompany: boolean;
  onSubmit: (form: HTMLFormElement) => void;
}

export function RegisterForm({ hidden, submitting, savedUsername, forCompany, onSubmit }: RegisterFormProps) {
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (savedUsername && usernameRef.current) usernameRef.current.value = savedUsername;
  }, [savedUsername]);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(event.currentTarget);
  };

  return (
    <form id="register-panel" className="auth-form" role="tabpanel" aria-labelledby="register-tab" noValidate hidden={hidden} onSubmit={handleSubmit}>
      {forCompany && (
        <p className="auth-step-note">
          <i className="fa-solid fa-building" aria-hidden="true" /> Primero creá tu usuario: en el paso siguiente registrás tu empresa.
        </p>
      )}
      <label>
        <span>Nombre de usuario</span>
        <input ref={usernameRef} name="username" type="text" placeholder="Ej. usuario_verifire" autoComplete="username" required />
      </label>

      <label>
        <span>Correo electrónico</span>
        <input name="email" type="email" placeholder="tu@correo.com" autoComplete="email" required />
      </label>

      <PasswordField id="registerPassword" name="password" label="Contraseña" placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
      <PasswordField id="registerPasswordConfirm" name="passwordConfirm" label="Repetir contraseña" placeholder="Escribí la misma contraseña" autoComplete="new-password" />

      <p className="auth-guide">Usá mínimo 8 caracteres, con una mayúscula, una minúscula y un número.</p>

      <button type="submit" className="button button-primary auth-submit" disabled={submitting}>Crear cuenta</button>
    </form>
  );
}
