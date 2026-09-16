import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

interface PasswordFieldProps {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  autoComplete: 'current-password' | 'new-password';
}

export function PasswordField({ id, name, label, placeholder, autoComplete }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input id={id} name={name} type={visible ? 'text' : 'password'} placeholder={placeholder} minLength={8} autoComplete={autoComplete} required />
        <button
          className="password-toggle"
          type="button"
          aria-controls={id}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          <Icon name={visible ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'} />
        </button>
      </div>
    </div>
  );
}
