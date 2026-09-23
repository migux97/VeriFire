import { useEffect, useState } from 'react';
import { storedUser } from '@/lib/client/account';
import {
  companyMemberships,
  companyRolePermissions,
  defaultCompanyRolePermissions,
  saveCompanyRolePermissions,
  type CompanyPermission,
  type CompanyRole,
  type CompanyRolePermissions
} from '@/lib/client/workspace';

const labels: Record<CompanyPermission, string> = {
  viewProducts: 'Ver productos',
  viewBatches: 'Ver lotes',
  viewSensitive: 'Ver información importante',
  scheduleBatches: 'Programar lotes y pagos',
  manageTeam: 'Gestionar equipo',
  manageSettings: 'Gestionar configuración'
};

const roles: CompanyRole[] = ['admin', 'operator', 'auditor', 'viewer'];

export function CompanyRoleSettings() {
  const [permissions, setPermissions] = useState<CompanyRolePermissions>(defaultCompanyRolePermissions);
  const [editable, setEditable] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const user = storedUser();
    const membership = user ? companyMemberships(user.email)[0] : undefined;
    setPermissions(companyRolePermissions());
    setEditable(Boolean(user?.accountType === 'business' && (!membership || membership.role === 'admin')));
  }, []);

  const toggle = (role: CompanyRole, permission: CompanyPermission) => {
    const current = permissions[role];
    const next = current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission];
    setPermissions({ ...permissions, [role]: next });
  };

  const save = () => {
    saveCompanyRolePermissions(permissions);
    setNotice('Permisos guardados para este navegador.');
  };

  return (
    <section className="company-role-settings" id="settings" aria-labelledby="role-settings-title">
      <div className="company-panel-heading">
        <div>
          <span className="company-eyebrow">Administración</span>
          <h2 id="role-settings-title">Permisos por rol</h2>
        </div>
        <span className="company-settings-note">Configuración local</span>
      </div>
      <p className="company-settings-intro">Define qué puede consultar o programar cada rol dentro de la empresa.</p>
      <div className="company-role-grid">
        {roles.map((role) => (
          <fieldset key={role}>
            <legend>{role === 'admin' ? 'Administrador' : role === 'operator' ? 'Operador' : role === 'auditor' ? 'Auditor' : 'Solo lectura'}</legend>
            {(Object.keys(labels) as CompanyPermission[]).map((permission) => (
              <label key={permission}>
                <input
                  type="checkbox"
                  checked={permissions[role].includes(permission)}
                  disabled={!editable || role === 'admin'}
                  onChange={() => toggle(role, permission)}
                />
                <span>{labels[permission]}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      {editable && (
        <button className="company-settings-save" type="button" onClick={save}>
          <i className="fa-solid fa-check" /> Guardar permisos
        </button>
      )}
      {notice && (
        <span className="company-settings-success" role="status">
          {notice}
        </span>
      )}
    </section>
  );
}
