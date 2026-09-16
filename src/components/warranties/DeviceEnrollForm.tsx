import { useEffect, useRef, useState, type SubmitEvent } from 'react';

interface DeviceEnrollFormProps {
  // Resolves once the attempt ends; the panel shows how it went.
  onEnroll: (password: string) => Promise<void>;
  onCancel: () => void;
}

// One-time form to enable an older account on other devices.
export function DeviceEnrollForm({ onEnroll, onCancel }: DeviceEnrollFormProps) {
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    passwordRef.current?.focus();
  }, []);

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = passwordRef.current?.value.trim() ?? '';
    if (!password) return;
    setBusy(true);
    try {
      await onEnroll(password);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="device-form" noValidate onSubmit={(event) => void handleSubmit(event)}>
      <label htmlFor="enable-devices-password">Tu contraseña de Verifire</label>
      <input ref={passwordRef} id="enable-devices-password" type="password" autoComplete="current-password" placeholder="La misma con la que entrás" required />
      <p className="field-hint">Con tu contraseña habilitamos tu cuenta para usarla en el celular. Es una sola vez y no se guarda en ningún lado. Hacelo desde la dirección donde creaste la cuenta: es la que tiene tu llave de firma.</p>
      <div className="device-form-actions">
        <button className="button button-primary" type="submit" disabled={busy}>Habilitar</button>
        <button className="button button-secondary" type="button" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}
