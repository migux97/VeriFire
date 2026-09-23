// Team invitations from the browser: the company creates them (by email, or as an open link and QR), the invitee
// finds them in their panel or opens the link, and accepting one joins the team in the invitee's browser.
// The link carries its token after the #, so it never reaches a server log (like the transfer links).
import type { InboxInvitation, InvitationView, TeamRole } from '../types';
import { postJson } from './api';
import { storedUser } from './account';
import { readRaw, removeStored, writeRaw } from './storage';
import { addCompanyMembership } from './workspace';

// A link opened before logging in waits here for the login to come back to it.
const PENDING_KEY = 'verifirePendingInvite';

export interface CreatedInvitation {
  invitation: InvitationView;
  token: string;
}

export const invitationLink = (token: string) => `${window.location.origin}/invite#t=${token}`;

export const tokenFromHash = (hash = window.location.hash) => new URLSearchParams(hash.slice(1)).get('t') ?? '';

export const rememberPendingInvite = (token: string) => writeRaw(sessionStorage, PENDING_KEY, token);
export const pendingInvite = () => readRaw(sessionStorage, PENDING_KEY) ?? '';
export const forgetPendingInvite = () => removeStored(sessionStorage, PENDING_KEY);

export type ValidHours = 1 | 24 | 72 | 168;

export const createInvitation = (request: { companyName: string; inviterName: string; inviterEmail: string; email: string; role: TeamRole; validHours: ValidHours }) =>
  postJson<CreatedInvitation>('/api/invitations', request, 'No se pudo crear la invitación.');

export const fetchInbox = async (email: string) =>
  (await postJson<{ invitations: InboxInvitation[] }>('/api/invitations/inbox', { email }, 'No se pudieron consultar las invitaciones.')).invitations;

export const viewInvitation = async (token: string) =>
  (await postJson<{ invitation: InvitationView }>('/api/invitations/view', { token }, 'No se pudo abrir la invitación.')).invitation;

export const invitationStatuses = async (ids: string[]) =>
  ids.length ? (await postJson<{ invitations: InvitationView[] }>('/api/invitations/status', { ids }, 'No se pudo consultar el estado de las invitaciones.')).invitations : [];

export const revokeInvitation = async (token: string) =>
  (await postJson<{ invitation: InvitationView }>('/api/invitations/revoke', { token }, 'No se pudo cancelar la invitación.')).invitation;

// Answers an invitation as the account signed in here. Accepting it joins the team in this browser.
export const respondInvitation = async (token: string, action: 'accept' | 'decline') => {
  const user = storedUser();
  if (!user) throw new Error('Iniciá sesión para responder la invitación.');
  const { invitation } = await postJson<{ invitation: InvitationView }>('/api/invitations/respond', { token, action, email: user.email }, 'No se pudo responder la invitación.');
  if (action === 'accept') {
    addCompanyMembership({
      invitationId: invitation.id,
      email: user.email,
      companyName: invitation.companyName,
      role: invitation.role,
      joinedAt: invitation.respondedAt ?? new Date().toISOString()
    });
  }
  forgetPendingInvite();
  return invitation;
};
