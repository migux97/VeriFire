import { useRef, useState } from 'react';
import { useCompanyText } from '@/components/company/CompanyText';
import { Icon } from '@/components/ui/Icon';
import { preparePhoto, type PhotoError } from '@/lib/client/photo';

interface PhotoPickerProps {
  // The prepared photo as a data URL, or '' without one.
  value: string;
  onChange: (photo: string) => void;
  // The demonstration keeps nothing on a server, so there is nowhere to keep a photo.
  disabled?: boolean;
}

// The photo of the batch being issued: chosen here, prepared in the browser and sent once the purchase exists. The form
// carries it in a hidden field, like the rest of the configuration.
export function PhotoPicker({ value, onChange, disabled = false }: PhotoPickerProps) {
  const text = useCompanyText().photo;
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [preparing, setPreparing] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setPreparing(true);
    try {
      onChange(await preparePhoto(file));
    } catch (failure) {
      const reason = (failure instanceof Error ? failure.message : 'read') as PhotoError;
      setError(text.errors[reason] ?? text.errors.read);
    } finally {
      setPreparing(false);
      // The same file can be chosen again after removing it.
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="photo-picker">
      <span className="photo-picker-title">
        {text.title} <small>{text.optional}</small>
      </span>
      <div className="photo-picker-body">
        <span className={`photo-picker-frame${value ? ' has-photo' : ''}`} aria-hidden="true">
          {value ? <img src={value} alt="" /> : <Icon name="fa-regular fa-image" />}
        </span>
        <div className="photo-picker-actions">
          <button type="button" className="button button-secondary" disabled={disabled || preparing} onClick={() => input.current?.click()}>
            <Icon name={`fa-solid ${preparing ? 'fa-circle-notch fa-spin' : 'fa-arrow-up-from-bracket'}`} /> {value ? text.change : text.choose}
          </button>
          {value && (
            <button type="button" className="button button-secondary" disabled={preparing} onClick={() => onChange('')}>
              {text.remove}
            </button>
          )}
        </div>
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={disabled} onChange={(event) => void pick(event.currentTarget.files?.[0])} />
      <input type="hidden" name="photo" value={value} />
      <small className="field-hint">{text.hint}</small>
      {error && <p role="alert" className="field-hint photo-picker-error">{error}</p>}
    </div>
  );
}
