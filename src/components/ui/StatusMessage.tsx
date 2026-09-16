export type MessageTone = 'info' | 'success' | 'error';

export interface Message {
  text: string;
  tone: MessageTone;
}

interface StatusMessageProps {
  id?: string;
  message: Message | null;
}

// Status line under an action. Empty, it takes no space.
export function StatusMessage({ id, message }: StatusMessageProps) {
  return (
    <p id={id} className={message?.text ? `claim-message is-${message.tone}` : 'claim-message'} role="status" aria-live="polite">
      {message?.text}
    </p>
  );
}
