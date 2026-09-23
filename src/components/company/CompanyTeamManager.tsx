import { useEffect, useState, type SyntheticEvent } from 'react';
import { companyMemberships, createCompanyInvitation, updateCompanyMembershipRole, type CompanyRole } from '@/lib/client/workspace';
import { storedUser } from '@/lib/client/account';
import { accountKey, userSession } from '@/lib/client/session';
import { readStored, writeStored } from '@/lib/client/storage';

type Role = 'admin' | 'operator' | 'auditor' | 'viewer';
type MemberStatus = 'active' | 'pending';

interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: MemberStatus;
}

const storageKey = () => accountKey('company-team');
const roleLabels: Record<Role, string> = {
  admin: 'Administrador',
  operator: 'Operador',
  auditor: 'Auditor',
  viewer: 'Solo lectura'
};

const roleHelp: Record<Role, string> = {
  admin: 'Gestiona equipo, lotes, productos y configuración.',
  operator: 'Gestiona productos, lotes y verificaciones.',
  auditor: 'Consulta reportes, alertas y actividad.',
  viewer: 'Solo puede consultar el resumen y los productos.'
};

const initials = (name: string) => name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();

export function CompanyTeamManager() {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('operator');
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const user = storedUser();
    if (!user || !userSession.isActive()) return;
    try {
      const saved = readStored<Member[]>(localStorage, storageKey());
      if (saved) {
        setMembers(saved);
        return;
      }
      const memberships = companyMemberships(user.email);
      setMembers([{ id: 'owner', name: user.name, email: user.email, role: 'admin', status: 'active' }, ...memberships.map((membership) => ({ id: membership.invitationId, name: membership.email.split('@')[0] || membership.email, email: membership.email, role: membership.role, status: 'active' as const }))]);
    } catch {
      setMembers([{ id: 'owner', name: user.name, email: user.email, role: 'admin', status: 'active' }]);
    }
  }, []);

  const persist = (next: Member[]) => {
    setMembers(next);
    writeStored(localStorage, storageKey(), next);
  };

  const invite = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setNotice('Ingresá un correo válido.');
      return;
    }
    if (members.some((member) => member.email === normalizedEmail)) {
      setNotice('Ese correo ya pertenece al equipo.');
      return;
    }
    createCompanyInvitation(normalizedEmail, role as CompanyRole);
    const next = [...members, { id: crypto.randomUUID(), name: normalizedEmail.split('@')[0] || normalizedEmail, email: normalizedEmail, role, status: 'pending' as const }];
    persist(next);
    setEmail('');
    setNotice(`Invitación preparada para ${normalizedEmail}.`);
    setOpen(false);
  };

  const updateRole = (id: string, nextRole: Role) => {
    const member = members.find((item) => item.id === id);
    if (member) updateCompanyMembershipRole(member.email, nextRole);
    persist(members.map((item) => item.id === id ? { ...item, role: nextRole } : item));
    setNotice('Rol actualizado.');
  };

  const removeMember = (id: string) => {
    persist(members.filter((member) => member.id !== id));
    setNotice('Acceso revocado.');
  };

  return (
    <div className="team-manager">
      <div className="team-manager-list">
        {members.map((member) => (
          <div className="team-manager-member" key={member.id}>
            <span className="team-avatar">{initials(member.name)}</span>
            <span className="team-manager-identity"><strong>{member.name}</strong><small>{member.email}</small></span>
            <select aria-label={`Rol de ${member.email}`} value={member.role} disabled={member.id === 'owner'} onChange={(event) => updateRole(member.id, event.target.value as Role)}>
              {Object.entries(roleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
            <span className={`team-manager-status ${member.status === 'pending' ? 'is-pending' : ''}`}>{member.status === 'pending' ? 'Pendiente' : 'Activo'}</span>
            {member.id !== 'owner' && <button className="team-manager-remove" type="button" onClick={() => removeMember(member.id)} aria-label={`Revocar acceso de ${member.email}`}><i className="fa-solid fa-xmark" /></button>}
          </div>
        ))}
      </div>

      {open && (
        <form className="team-manager-form" onSubmit={invite}>
          <label><span>Correo del integrante</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="persona@empresa.com" autoFocus /></label>
          <label><span>Rol y permisos</span><select value={role} onChange={(event) => setRole(event.target.value as Role)}>{Object.entries(roleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><small>{roleHelp[role]}</small></label>
          <div className="team-manager-form-actions"><button type="button" className="team-manager-cancel" onClick={() => setOpen(false)}>Cancelar</button><button type="submit" className="team-manager-submit">Crear invitación</button></div>
        </form>
      )}

      <div className="team-manager-footer"><button className="team-invite" type="button" onClick={() => setOpen((value) => !value)}><i className="fa-solid fa-user-plus" /> {open ? 'Cerrar invitación' : 'Invitar integrante'}</button>{notice && <span className="team-manager-notice" role="status">{notice}</span>}</div>
    </div>
  );
}
