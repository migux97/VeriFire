import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import type { ConsumerMessages } from '@/i18n/consumer';

interface DeviceEnrollFormProps {
  // Resolves once the attempt ends; the panel shows how it went.
  onEnroll: (password: string) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  hint: string;
  labels: ConsumerMessages['device'];
}

// Asks for the account's password once, to enable this browser to sign or the account on other devices.
export function DeviceEnrollForm({ onEnroll, onCancel, submitLabel, hint, labels }: DeviceEnrollFormProps) {
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
      <label htmlFor="enable-devices-password">{labels.password}</label>
      <input ref={passwordRef} id="enable-devices-password" type="password" autoComplete="current-password" placeholder={labels.placeholder} required />
      <p className="field-hint">{hint}</p>
      <div className="device-form-actions">
        <button className="button button-primary" type="submit" disabled={busy}>{submitLabel}</button>
        <button className="button button-secondary" type="button" onClick={onCancel}>{labels.cancel}</button>
      </div>
    </form>
  );
}
