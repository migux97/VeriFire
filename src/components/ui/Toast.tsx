import { useEffect } from 'react';
import { Icon } from './Icon';
import type { Message, MessageTone } from './StatusMessage';

// How long each tone stays on screen. Progress messages ("info") stay until the next one replaces them.
const HIDE_AFTER_MS: Partial<Record<MessageTone, number>> = { success: 5000, error: 9000 };

const ICONS: Record<MessageTone, string> = {
  info: 'fa-solid fa-circle-notch fa-spin',
  success: 'fa-solid fa-circle-check',
  error: 'fa-solid fa-circle-exclamation'
};

interface ToastProps {
  message: Message | null;
  onClose: () => void;
}

// A page's status, floating in a corner instead of pushing the page down.
export function Toast({ message, onClose }: ToastProps) {
  useEffect(() => {
    const delay = message?.text ? HIDE_AFTER_MS[message.tone] : undefined;
    if (!delay) return undefined;
    const timer = window.setTimeout(onClose, delay);
    return () => window.clearTimeout(timer);
    // A new message object restarts the countdown, even with the same text.
  }, [message]);

  return (
    <div className="toast-region" role={message?.tone === 'error' ? 'alert' : 'status'} aria-live={message?.tone === 'error' ? 'assertive' : 'polite'}>
      {message?.text && (
        <div className={`toast is-${message.tone}`}>
          <Icon name={ICONS[message.tone]} />
          <p>{message.text}</p>
          <button className="toast-close" type="button" aria-label="Cerrar aviso" onClick={onClose}>
            <Icon name="fa-solid fa-xmark" />
          </button>
        </div>
      )}
    </div>
  );
}
