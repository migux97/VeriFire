// Invitations to a company's team, as the invitee sees them: the /invite page (behind a link or a QR) and the
// invitations in the buyer's panel. The company's side is in company.ts.
import type { Locale } from '@/lib/locale';
import type { TeamRole } from '@/lib/types';

const es = {
  intl: 'es-AR',
  meta: { title: 'Verifire | Invitación a un equipo', description: 'Aceptá la invitación para sumarte al equipo de una empresa en Verifire.' },
  roles: { admin: 'Administrador', operator: 'Operador', auditor: 'Auditor', viewer: 'Solo lectura' } as Record<TeamRole, string>,
  page: {
    loading: 'Abriendo la invitación…',
    missing: 'Este link no trae ninguna invitación. Pedile a la empresa que te lo envíe de nuevo.',
    eyebrow: 'Invitación a un equipo',
    heading: (company: string) => `Te invitaron a ${company}`,
    lead: (inviter: string, role: string) => `${inviter} te invita a sumarte como ${role}.`,
    forEmail: (email: string) => `Para ${email}`,
    open: 'Cualquiera con este link puede sumarse',
    expiresIn: (left: string) => `Vence en ${left}`,
    role: 'Rol',
    company: 'Empresa',
    from: 'Invita',
    accept: 'Aceptar y entrar',
    decline: 'Rechazar',
    login: 'Iniciar sesión para aceptar',
    register: 'Crear una cuenta',
    loggedAs: (email: string) => `Vas a responder como ${email}.`,
    accepted: '¡Listo! Ya sos parte del equipo. Entrando al panel…',
    declined: 'Rechazaste la invitación. La empresa va a ver tu respuesta.',
    status: {
      accepted: 'Esta invitación ya fue aceptada.',
      declined: 'Esta invitación fue rechazada.',
      revoked: 'La empresa canceló esta invitación.',
      expired: 'La invitación venció. Pedile a la empresa que te envíe otra.'
    } as Record<string, string>,
    home: 'Ir a mi panel'
  },
  inbox: {
    button: 'Invitaciones',
    buttonCount: (count: number) => `Invitaciones, ${count} pendientes`,
    title: 'Invitaciones a equipos',
    empty: 'No tenés invitaciones pendientes. Cuando una empresa te invite a su equipo, aparece acá.',
    from: (inviter: string, role: string) => `${inviter} te invita como ${role}`,
    expiresIn: (left: string) => `Vence en ${left}`,
    expired: 'Venció',
    accept: 'Aceptar',
    decline: 'Rechazar',
    close: 'Cerrar'
  }
};

export type InvitationMessages = typeof es;

const en: InvitationMessages = {
  intl: 'en-US',
  meta: { title: 'Verifire | Team invitation', description: 'Accept the invitation to join a company team on Verifire.' },
  roles: { admin: 'Administrator', operator: 'Operator', auditor: 'Auditor', viewer: 'Read only' },
  page: {
    loading: 'Opening the invitation…',
    missing: 'This link carries no invitation. Ask the company to send it again.',
    eyebrow: 'Team invitation',
    heading: (company: string) => `You were invited to ${company}`,
    lead: (inviter: string, role: string) => `${inviter} invites you to join as ${role}.`,
    forEmail: (email: string) => `For ${email}`,
    open: 'Anyone with this link can join',
    expiresIn: (left: string) => `Expires in ${left}`,
    role: 'Role',
    company: 'Company',
    from: 'Invited by',
    accept: 'Accept and enter',
    decline: 'Decline',
    login: 'Log in to accept',
    register: 'Create an account',
    loggedAs: (email: string) => `You will answer as ${email}.`,
    accepted: 'Done! You are part of the team. Opening the dashboard…',
    declined: 'You declined the invitation. The company will see your answer.',
    status: {
      accepted: 'This invitation was already accepted.',
      declined: 'This invitation was declined.',
      revoked: 'The company cancelled this invitation.',
      expired: 'The invitation expired. Ask the company to send you another one.'
    },
    home: 'Go to my dashboard'
  },
  inbox: {
    button: 'Invitations',
    buttonCount: (count: number) => `Invitations, ${count} pending`,
    title: 'Team invitations',
    empty: 'You have no pending invitations. When a company invites you to its team, it shows up here.',
    from: (inviter: string, role: string) => `${inviter} invites you as ${role}`,
    expiresIn: (left: string) => `Expires in ${left}`,
    expired: 'Expired',
    accept: 'Accept',
    decline: 'Decline',
    close: 'Close'
  }
};

export const invitationMessages = (locale: Locale = 'es'): InvitationMessages => (locale === 'en' ? en : es);
