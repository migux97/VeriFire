import { useRef, useState } from 'react';
import { useCompanyText } from '@/components/company/CompanyText';
import { Icon } from '@/components/ui/Icon';
import { preparePhoto, saveBatchPhoto, type PhotoError } from '@/lib/client/photo';
import { errorMessage } from '@/lib/errors';

interface BatchPhotoProps {
  purchaseId: string;
  photoUrl: string | null;
  // Called once the server has the new photo (or none), so the list reads the batch again.
  onSaved: () => void;
}

// Add, change or remove the photo of a batch already issued. It is what every product of the batch looks like to whoever
// verifies it, and what a buyer needs to be able to show it on the home page.
export function BatchPhoto({ purchaseId, photoUrl, onSaved }: BatchPhotoProps) {
  const text = useCompanyText().photo;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);

  const save = async (task: () => Promise<string | null>, done: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await saveBatchPhoto(purchaseId, await task(), text.uploadFailed);
      setNotice({ text: done, tone: 'success' });
      onSaved();
    } catch (failure) {
      const reason = failure instanceof Error ? (failure.message as PhotoError) : 'read';
      setNotice({ text: text.errors[reason] ?? errorMessage(failure), tone: 'error' });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="batch-photo">
      <div className="batch-photo-actions">
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => input.current?.click()}>
          <Icon name={`fa-solid ${busy ? 'fa-circle-notch fa-spin' : 'fa-camera'}`} /> {busy ? text.saving : photoUrl ? text.change : text.add}
        </button>
        {photoUrl && (
          <button type="button" className="button button-secondary" disabled={busy} onClick={() => void save(async () => null, text.removed)}>
            {text.remove}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void save(() => preparePhoto(file), text.saved);
        }}
      />
      {notice && <p className={`batch-item-note${notice.tone === 'error' ? ' is-error' : ''}`} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.text}</p>}
    </div>
  );
}
