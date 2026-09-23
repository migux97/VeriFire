import { readStored, writeStored } from './storage';

export type CompanyRole = 'admin' | 'operator' | 'auditor' | 'viewer';

export type CompanyPermission = 'viewProducts' | 'viewBatches' | 'viewSensitive' | 'scheduleBatches' | 'manageTeam' | 'manageSettings';
export type CompanyRolePermissions = Record<CompanyRole, CompanyPermission[]>;

export interface CompanyInvitation {
  id: string;
  email: string;
  companyName: string;
  role: CompanyRole;
  status: 'pending' | 'accepted' | 'revoked';
  createdAt: string;
}

export interface CompanyMembership {
  invitationId: string;
  email: string;
  companyName: string;
  role: CompanyRole;
  joinedAt: string;
}

const INVITATIONS_KEY = 'verifire-company-invitations';
const MEMBERSHIPS_KEY = 'verifire-company-memberships';
const PERMISSIONS_KEY = 'verifire-company-role-permissions';

export const defaultCompanyRolePermissions: CompanyRolePermissions = {
  admin: ['viewProducts', 'viewBatches', 'viewSensitive', 'scheduleBatches', 'manageTeam', 'manageSettings'],
  operator: ['viewProducts', 'viewBatches', 'scheduleBatches'],
  auditor: ['viewProducts', 'viewBatches', 'viewSensitive'],
  viewer: ['viewProducts']
};

const readList = <T>(key: string) => readStored<T[]>(localStorage, key) ?? [];

export const createCompanyInvitation = (email: string, role: CompanyRole, companyName = 'Andes Manufacturing') => {
  const invitation: CompanyInvitation = {
    id: crypto.randomUUID(),
    email: email.trim().toLowerCase(),
    companyName,
    role,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  writeStored(localStorage, INVITATIONS_KEY, [...readList<CompanyInvitation>(INVITATIONS_KEY), invitation]);
  return invitation;
};

export const pendingCompanyInvitation = (email: string) =>
  readList<CompanyInvitation>(INVITATIONS_KEY).find(
    (invitation) => invitation.email === email.trim().toLowerCase() && invitation.status === 'pending'
  );

export const acceptCompanyInvitation = (invitation: CompanyInvitation) => {
  const invitations = readList<CompanyInvitation>(INVITATIONS_KEY).map((item) =>
    item.id === invitation.id ? { ...item, status: 'accepted' as const } : item
  );
  writeStored(localStorage, INVITATIONS_KEY, invitations);
  const membership: CompanyMembership = {
    invitationId: invitation.id,
    email: invitation.email,
    companyName: invitation.companyName,
    role: invitation.role,
    joinedAt: new Date().toISOString()
  };
  writeStored(localStorage, MEMBERSHIPS_KEY, [...readList<CompanyMembership>(MEMBERSHIPS_KEY), membership]);
};

// Joins a team whose invitation this account accepted (see invitations.ts). Accepting the same one twice changes nothing.
export const addCompanyMembership = (membership: CompanyMembership) => {
  const memberships = readList<CompanyMembership>(MEMBERSHIPS_KEY).filter((item) => item.invitationId !== membership.invitationId);
  writeStored(localStorage, MEMBERSHIPS_KEY, [...memberships, { ...membership, email: membership.email.trim().toLowerCase() }]);
};

export const companyMemberships = (email: string) =>
  readList<CompanyMembership>(MEMBERSHIPS_KEY).filter((membership) => membership.email === email.trim().toLowerCase());

export const updateCompanyMembershipRole = (email: string, role: CompanyRole) => {
  const memberships = readList<CompanyMembership>(MEMBERSHIPS_KEY).map((membership) =>
    membership.email === email.trim().toLowerCase() ? { ...membership, role } : membership
  );
  writeStored(localStorage, MEMBERSHIPS_KEY, memberships);
};

export const companyRolePermissions = (): CompanyRolePermissions => ({
  ...defaultCompanyRolePermissions,
  ...(readStored<Partial<CompanyRolePermissions>>(localStorage, PERMISSIONS_KEY) ?? {})
});

export const saveCompanyRolePermissions = (permissions: CompanyRolePermissions) =>
  writeStored(localStorage, PERMISSIONS_KEY, permissions);
