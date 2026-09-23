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
import { useCompanyText } from './CompanyText';

const roles: CompanyRole[] = ['admin', 'operator', 'auditor', 'viewer'];

// Rendered inside the settings island, which provides the texts.
export function CompanyRoleSettings() {
  const t = useCompanyText();
  const text = t.rolesSettings;
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
    setNotice('');
  };

  const save = () => {
    saveCompanyRolePermissions(permissions);
    setNotice(text.saved);
  };

  return (
    <section className="company-card settings-card company-role-settings" aria-labelledby="role-settings-title">
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true">
          <i className="fa-solid fa-user-shield" />
        </span>
        <div>
          <h2 id="role-settings-title">{text.title}</h2>
          <p>{text.intro}</p>
        </div>
        <span className="company-badge">{text.badge}</span>
      </div>
      <div className="company-role-grid">
        {roles.map((role) => (
          <fieldset key={role}>
            <legend>{t.roles[role]}</legend>
            {(Object.keys(text.permissions) as CompanyPermission[]).map((permission) => (
              <label key={permission}>
                <input type="checkbox" checked={permissions[role].includes(permission)} disabled={!editable || role === 'admin'} onChange={() => toggle(role, permission)} />
                <span>{text.permissions[permission]}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      {editable && (
        <div className="settings-actions">
          <button className="company-button is-primary" type="button" onClick={save}>
            <i className="fa-solid fa-check" aria-hidden="true" /> {text.save}
          </button>
          {notice && (
            <span className="settings-success" role="status">
              {notice}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
