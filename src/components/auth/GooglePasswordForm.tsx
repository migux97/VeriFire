import { useEffect, useRef, type SubmitEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { PasswordField } from './PasswordField';

// After signing in with Google: the password that saves the account's key in Stellar, so every other device (another
// browser, the phone, another address of the site) can sign with it. 'create' for an account that never had one.
export type GooglePasswordKind = 'create' | 'enter' | 'reset' | 'current';

interface GooglePasswordFormProps {
  kind: GooglePasswordKind;
  email: string;
  submitting: boolean;
  onSubmit: (form: HTMLFormElement) => void;
  onCancel: () => void;
}

export function GooglePasswordForm({ kind, email, submitting, onSubmit, onCancel }: GooglePasswordFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>('input[name="password"]')?.focus();
  }, []);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(event.currentTarget);
  };

  return (
    <form ref={formRef} className="email-verification-form" noValidate onSubmit={handleSubmit}>
      <div className="verification-badge"><Icon name="fa-solid fa-key" /></div>
      <h2>{kind === 'current' ? 'Escribí tu contraseña actual' : kind === 'reset' ? 'Elegí tu contraseña nueva' : kind === 'create' ? 'Creá tu contraseña de Verifire' : 'Ingresá tu contraseña de Verifire'}</h2>
      {kind === 'current' ? (
        <p>
          Este navegador todavía no tiene la llave de tu wallet y tu cuenta <strong>{email}</strong> aún no tiene la recuperación activada. Con tu
          contraseña actual (la que usás hoy para entrar) la abrimos, la guardamos con la nueva y activamos la recuperación, así la próxima vez
          no hace falta.
        </p>
      ) : kind === 'reset' ? (
        <p>
          Confirmaste tu correo <strong>{email}</strong>. Escribí la contraseña nueva: la llave de tu wallet se va a guardar con ella, y tus
          garantías, tu empresa y tu wallet siguen iguales.
        </p>
      ) : kind === 'create' ? (
        <p>
          Entraste con Google como <strong>{email}</strong>. Creá una contraseña para guardar la llave de tu wallet en Stellar: con ella vas a
          poder usar tu cuenta y firmar desde cualquier dispositivo. También te sirve para entrar sin Google.
        </p>
      ) : (
        <p>
          Este dispositivo todavía no puede firmar con tu cuenta <strong>{email}</strong>. Escribí la contraseña de Verifire que creaste para
          habilitarlo.
        </p>
      )}
      <PasswordField
        id="google-password"
        name="password"
        placeholder="Mínimo 8 caracteres, una mayúscula y un número"
        label={kind === 'current' ? 'Contraseña actual' : 'Contraseña'}
        autoComplete={kind === 'enter' || kind === 'current' ? 'current-password' : 'new-password'}
      />
      {kind !== 'enter' && kind !== 'current' && (
        <PasswordField id="google-password-confirm" name="passwordConfirm" label="Repetí la contraseña" placeholder="La misma contraseña" autoComplete="new-password" />
      )}
      <button type="submit" className="button button-primary" disabled={submitting}>
        {submitting ? 'Guardando tu llave...' : kind === 'current' ? 'Habilitar y cambiar contraseña' : kind === 'reset' ? 'Guardar contraseña y entrar' : kind === 'create' ? 'Guardar y entrar' : 'Habilitar y entrar'}
      </button>
      <button type="button" className="verification-back-button" disabled={submitting} onClick={onCancel}>Cancelar</button>
    </form>
  );
}
