import { useEffect, useState } from 'react';
import { persistUser, storedUser } from '@/lib/client/account';
import { acceptCompanyInvitation, pendingCompanyInvitation, type CompanyInvitation } from '@/lib/client/workspace';

const roleLabels = { admin: 'Administrador', operator: 'Operador', auditor: 'Auditor', viewer: 'Solo lectura' } as const;

export function WorkspaceChooser() {
  const [invitation, setInvitation] = useState<CompanyInvitation | null>(null);
  const [email, setEmail] = useState('');

  useEffect(() => {
    const user = storedUser();
    if (!user) {
      window.location.href = '/login';
      return;
    }
    setEmail(user.email);
    setInvitation(pendingCompanyInvitation(user.email) ?? null);
  }, []);

  const enterPersonal = () => {
    window.location.href = '/app';
  };
  const enterCompany = () => {
    const user = storedUser();
    if (!user || !invitation) return;
    acceptCompanyInvitation(invitation);
    persistUser({ ...user, accountType: 'business' });
    window.location.href = '/company';
  };

  return (
    <section className="workspace-chooser" aria-labelledby="workspace-title">
      <span className="workspace-chooser-mark">
        <i className="fa-solid fa-building" />
      </span>
      <span className="company-eyebrow">Invitación pendiente</span>
      <h1 id="workspace-title">Te invitaron a un espacio empresarial</h1>
      <p className="workspace-chooser-lead">
        La invitación está asociada a <strong>{email}</strong>. Elegí dónde querés continuar.
      </p>
      {invitation && (
        <article className="workspace-invitation">
          <div>
            <small>Empresa</small>
            <strong>{invitation.companyName}</strong>
          </div>
          <div>
            <small>Rol autorizado</small>
            <strong>{roleLabels[invitation.role]}</strong>
          </div>
          <span className="workspace-invitation-status">
            <i className="fa-solid fa-check" /> Invitación válida
          </span>
        </article>
      )}
      <div className="workspace-options">
        <button className="workspace-option workspace-option-company" type="button" onClick={enterCompany} disabled={!invitation}>
          <span className="workspace-option-icon">
            <i className="fa-solid fa-building" />
          </span>
          <span>
            <strong>Entrar a la empresa</strong>
            <small>Usar el panel y permisos asignados</small>
          </span>
          <i className="fa-solid fa-arrow-right" />
        </button>
        <button className="workspace-option" type="button" onClick={enterPersonal}>
          <span className="workspace-option-icon">
            <i className="fa-solid fa-user" />
          </span>
          <span>
            <strong>Continuar en modo personal</strong>
            <small>Ir a tus garantías y productos</small>
          </span>
          <i className="fa-solid fa-arrow-right" />
        </button>
      </div>
    </section>
  );
}
