// Invitations to a company's team. The company panel lives in each browser, so the server is the only place where an
// invitation can wait for the other person: they find it in their panel (by email), or open its link or QR.
//
// There are no server-side accounts, so the email is the one the browser says it is signed in with. That is enough
// for what an invitation grants today (a membership kept in the invitee's own browser), not for anything that must be
// proven: a link or QR token is the only real secret here.
import { randomBytes, randomUUID } from 'node:crypto';
import { toLocale } from '../locale';
import { config } from './config';
import { sendEmail } from './email';
import { HttpError } from './errors';
import type { JsonBody } from './http';
import { invitationEmail } from './invitation-email';
import { singleton } from './singleton';
import type { InvitationView, TeamRole } from '../types';
import { saveState, store, type Invitation } from './store';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
// Every invitation (by email, link or QR) works for this long, and only once.
export const INVITATION_MINUTES = 3;

// Without server-side accounts anyone can ask for an invitation email to any address, so sending is bounded: one
// email per address per minute, and a daily total for the whole server. Both live in memory and reset with it.
const EMAIL_COOLDOWN_MS = MINUTE_MS;
const EMAILS_PER_DAY = 300;
const emailLog = singleton('invitation-emails', () => ({ lastTo: new Map<string, number>(), day: '', count: 0 }));

export type InvitationEmailStatus = 'sent' | 'not-configured' | 'failed' | 'throttled';
// Answered invitations and expired ones are dropped this long after, so the file does not grow forever.
const KEEP_DAYS = 30;
const MAX_PENDING = 5000;
const MAX_STATUS_IDS = 100;
const ROLES: TeamRole[] = ['admin', 'operator', 'auditor', 'viewer'];
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

const text = (body: JsonBody, key: string, max: number) => {
  const value = typeof body[key] === 'string' ? (body[key] as string).trim() : '';
  if (value.length > max) throw new HttpError(400, 'Hay un dato de la invitación demasiado largo.');
  return value;
};

const emailOf = (value: string) => value.trim().toLowerCase();

const statusOf = (invitation: Invitation, now = Date.now()): InvitationView['status'] =>
  invitation.status === 'pending' && Date.parse(invitation.expiresAt) <= now ? 'expired' : invitation.status;

export const viewOf = (invitation: Invitation): InvitationView => ({
  id: invitation.id,
  companyName: invitation.companyName,
  inviterName: invitation.inviterName,
  role: invitation.role,
  status: statusOf(invitation),
  email: invitation.email,
  createdAt: invitation.createdAt,
  expiresAt: invitation.expiresAt,
  respondedAt: invitation.respondedAt ?? null,
  acceptedBy: invitation.acceptedBy ?? null,
  // From the server's clock: the browser counts down from when it received this, so a phone whose clock is a few
  // minutes off does not see a 3-minute invitation as already expired.
  expiresInMs: Math.max(0, Date.parse(invitation.expiresAt) - Date.now())
});

const prune = (now = Date.now()) => {
  for (const [id, invitation] of store.invitations) {
    const endedAt = Date.parse(invitation.respondedAt ?? invitation.expiresAt);
    if (statusOf(invitation, now) !== 'pending' && now - endedAt > KEEP_DAYS * DAY_MS) store.invitations.delete(id);
  }
};

const byToken = (token: string) => {
  const found = token ? [...store.invitations.values()].find((invitation) => invitation.token === token) : undefined;
  if (!found) throw new HttpError(404, 'La invitación no existe o ya no está disponible.');
  return found;
};

// Sends the invitation email, unless the address was just written to or the day's budget is spent.
const emailInvitation = async (invitation: Invitation, locale: 'es' | 'en'): Promise<InvitationEmailStatus> => {
  // The link and the logo of the email use PUBLIC_APP_URL only. Taken from the request, they would come from its Host
  // header, and anyone could get a genuine Verifire email whose button leads to a site of their own.
  const baseUrl = config.publicAppUrl;
  if (!baseUrl) {
    console.error('Invitation email not sent: PUBLIC_APP_URL is not set.');
    return 'not-configured';
  }
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  if (emailLog.day !== today) {
    emailLog.day = today;
    emailLog.count = 0;
    emailLog.lastTo.clear();
  }
  if (emailLog.count >= EMAILS_PER_DAY || now - (emailLog.lastTo.get(invitation.email) ?? 0) < EMAIL_COOLDOWN_MS) return 'throttled';
  emailLog.lastTo.set(invitation.email, now);
  emailLog.count += 1;
  const result = await sendEmail({
    to: invitation.email,
    ...invitationEmail({
      companyName: invitation.companyName,
      inviterName: invitation.inviterName,
      role: invitation.role,
      link: `${baseUrl}/invite#t=${invitation.token}`,
      minutes: INVITATION_MINUTES,
      baseUrl,
      locale
    })
  });
  if (result.sent) return 'sent';
  return result.reason === 'not-configured' ? 'not-configured' : 'failed';
};

export const createInvitation = async (body: JsonBody) => {
  const companyName = text(body, 'companyName', 100);
  const inviterName = text(body, 'inviterName', 100);
  const inviterEmail = emailOf(text(body, 'inviterEmail', 254));
  const email = emailOf(text(body, 'email', 254));
  const role = body['role'] as TeamRole;
  const locale = toLocale(body['locale']) ?? 'es';
  if (!companyName) throw new HttpError(400, 'Completá el nombre de la empresa en Configuración antes de invitar.');
  if (!EMAIL.test(inviterEmail)) throw new HttpError(400, 'No se pudo identificar quién invita.');
  if (email && !EMAIL.test(email)) throw new HttpError(400, 'Ingresá un correo válido.');
  if (email && email === inviterEmail) throw new HttpError(400, 'No podés invitarte a vos mismo.');
  if (!ROLES.includes(role)) throw new HttpError(400, 'Elegí un rol válido.');

  const now = Date.now();
  prune(now);
  const pending = [...store.invitations.values()].filter((invitation) => statusOf(invitation, now) === 'pending');
  if (pending.length >= MAX_PENDING) throw new HttpError(503, 'No se pueden crear más invitaciones por ahora.', { retryable: true });
  // A previous invitation to the same person is left alone: its email already reached them, and a new email within the
  // minute is held back (see emailInvitation), so revoking it could leave them with no working link. It expires anyway.

  const invitation: Invitation = {
    id: randomUUID(),
    token: randomBytes(24).toString('base64url'),
    companyName,
    inviterName: inviterName || inviterEmail,
    inviterEmail,
    email,
    role,
    status: 'pending',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + INVITATION_MINUTES * MINUTE_MS).toISOString()
  };
  store.invitations.set(invitation.id, invitation);
  try {
    saveState();
  } catch (error) {
    store.invitations.delete(invitation.id);
    throw error;
  }
  // The invitation exists even if the email cannot go out: the company still has its panel notice, link and QR.
  const emailStatus = email ? await emailInvitation(invitation, locale) : null;
  // Only the creator ever receives the token together with the id.
  return { invitation: viewOf(invitation), token: invitation.token, emailStatus };
};

// Pending invitations addressed to an email, with the token each one needs to be answered.
export const inbox = (value: string) => {
  const email = emailOf(value);
  if (!EMAIL.test(email)) throw new HttpError(400, 'Correo inválido.');
  const now = Date.now();
  return [...store.invitations.values()]
    .filter((invitation) => invitation.email === email && statusOf(invitation, now) === 'pending')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((invitation) => ({ ...viewOf(invitation), token: invitation.token }));
};

export const invitationByToken = (token: string) => viewOf(byToken(token));

export const respond = (body: JsonBody) => {
  const invitation = byToken(text(body, 'token', 100));
  const email = emailOf(text(body, 'email', 254));
  const action = body['action'];
  if (action !== 'accept' && action !== 'decline') throw new HttpError(400, 'Respuesta inválida.');
  if (!EMAIL.test(email)) throw new HttpError(400, 'Iniciá sesión para responder la invitación.');
  const status = statusOf(invitation);
  if (status === 'expired') throw new HttpError(410, 'La invitación venció. Pedile a la empresa que te envíe otra.');
  if (status !== 'pending') throw new HttpError(409, 'Esta invitación ya fue respondida o cancelada.');
  if (invitation.email && invitation.email !== email)
    throw new HttpError(403, 'Esta invitación es para otro correo. Iniciá sesión con esa cuenta para aceptarla.');
  if (email === invitation.inviterEmail) throw new HttpError(400, 'No podés aceptar una invitación que creaste vos.');
  const before = { ...invitation };
  invitation.status = action === 'accept' ? 'accepted' : 'declined';
  invitation.respondedAt = new Date().toISOString();
  if (action === 'accept') invitation.acceptedBy = email;
  try {
    saveState();
  } catch (error) {
    // Otherwise it would stay answered in memory only: the person gets an error and can never answer it again.
    Object.assign(invitation, before);
    if (!before.respondedAt) delete invitation.respondedAt;
    if (!before.acceptedBy) delete invitation.acceptedBy;
    throw error;
  }
  return viewOf(invitation);
};

// What the inviter's team list shows: the state of the invitations it created.
export const statuses = (body: JsonBody) => {
  const ids = Array.isArray(body['ids']) ? body['ids'].filter((id): id is string => typeof id === 'string').slice(0, MAX_STATUS_IDS) : [];
  return ids
    .map((id) => store.invitations.get(id))
    .filter((invitation) => invitation !== undefined)
    .map(viewOf);
};

// Only whoever holds the token (the creator) can cancel it.
export const revoke = (body: JsonBody) => {
  const invitation = byToken(text(body, 'token', 100));
  if (invitation.status === 'pending') {
    invitation.status = 'revoked';
    invitation.respondedAt = new Date().toISOString();
    try {
      saveState();
    } catch (error) {
      invitation.status = 'pending';
      delete invitation.respondedAt;
      throw error;
    }
  }
  return viewOf(invitation);
};
