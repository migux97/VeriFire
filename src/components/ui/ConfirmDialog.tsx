import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

export interface Confirmation {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  // A step that cannot be undone is asked in red.
  danger?: boolean;
  onConfirm: () => void;
}

interface ConfirmDialogProps {
  // Null closes it: the page decides what it is asking about.
  confirmation: Confirmation | null;
  onCancel: () => void;
}

// Asks before something that cannot be taken back, in the app's own look instead of the browser's grey box. It is a
// native <dialog>, so Escape, the backdrop and the focus trap work without any of that being written here.
export function ConfirmDialog({ confirmation, onCancel }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirmation && !dialog.open) {
      dialog.showModal();
      confirmRef.current?.focus();
    }
    if (!confirmation && dialog.open) dialog.close();
  }, [confirmation]);

  if (!confirmation) return <dialog ref={dialogRef} className="confirm-dialog" />;

  const { title, message, confirmLabel, cancelLabel, danger = false, onConfirm } = confirmation;
  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      onCancel={(event) => {
        // Escape and the browser's own close: the page keeps deciding.
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onCancel();
      }}
    >
      <div className="confirm-dialog-body">
        <span className={`confirm-dialog-icon${danger ? ' is-danger' : ''}`} aria-hidden="true">
          <Icon name={danger ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-question'} />
        </span>
        <div>
          <h2 id="confirm-title">{title}</h2>
          <p id="confirm-message">{message}</p>
        </div>
      </div>
      <div className="confirm-dialog-actions">
        <button className="button button-secondary" type="button" onClick={onCancel}>{cancelLabel}</button>
        <button ref={confirmRef} className="button button-primary" type="button" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </dialog>
  );
}
