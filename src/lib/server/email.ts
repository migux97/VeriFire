// Email through Resend (resend.com), called with its REST API. Used only for the team invitations.
import { config } from './config';

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type EmailResult = { sent: true; id: string } | { sent: false; reason: 'not-configured' | 'rejected' | 'unreachable'; detail?: string };

const RESEND_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

export const emailConfigured = () => Boolean(config.resend.apiKey);

export const sendEmail = async (email: Email): Promise<EmailResult> => {
  if (!emailConfigured()) return { sent: false, reason: 'not-configured' };
  try {
    const response = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.resend.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.resend.from, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok || !body.id) {
      // The reason (an unverified domain, a wrong key) is for the server log, not for whoever invited.
      console.error('Resend rejected an email:', response.status, body.message ?? '');
      return { sent: false, reason: 'rejected', ...(body.message ? { detail: body.message } : {}) };
    }
    return { sent: true, id: body.id };
  } catch (error) {
    console.error('Resend could not be reached:', error);
    return { sent: false, reason: 'unreachable' };
  }
};
