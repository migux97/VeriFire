// Configuración of the company panel: look, language, animations, notifications, demo mode and role permissions.
// Every choice is kept in this browser.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { demoActive, disableDemo, enableDemo } from '@/lib/client/demo';
import { defaultPrefs, notify, readPrefs, savePrefs, type LeadHours, type NotificationPrefs } from '@/lib/client/notifications';
import { motionEnabled, setMotionEnabled, setTheme, themePreference, type ThemePreference } from '@/lib/client/theme';
import { LOCALE_COOKIE, type Locale } from '@/lib/locale';
import { CompanyProfileSettings } from './CompanyProfileSettings';
import { CompanyRoleSettings } from './CompanyRoleSettings';
import { CompanyTextProvider, useCompanyText } from './CompanyText';

const LOCALE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

export function CompanySettings({ locale = 'es' }: { locale?: Locale | undefined }) {
  return (
    <CompanyTextProvider locale={locale}>
      <Settings locale={locale} />
    </CompanyTextProvider>
  );
}

function Switch({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="settings-switch" disabled={disabled} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (value: T) => void; label: string }) {
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  return (
    <div className="settings-segmented" role="radiogroup" aria-label={label} style={{ '--count': options.length, '--index': index } as CSSProperties}>
      <span className="settings-segmented-thumb" aria-hidden="true" />
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={option.value === value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Row({ title, help, children }: { title: string; help?: string | undefined; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div>
        <strong>{title}</strong>
        {help && <small>{help}</small>}
      </div>
      {children}
    </div>
  );
}

function Card({ icon, title, lead, badge, children }: { icon: string; title: string; lead: string; badge?: string; children: ReactNode }) {
  return (
    <section className="company-card settings-card">
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true">
          <i className={`fa-solid ${icon}`} />
        </span>
        <div>
          <h2>{title}</h2>
          <p>{lead}</p>
        </div>
        {badge && <span className="company-badge is-warning">{badge}</span>}
      </div>
      {children}
    </section>
  );
}

function Settings({ locale }: { locale: Locale }) {
  const t = useCompanyText();
  const text = t.settings;
  const [theme, setThemeChoice] = useState<ThemePreference>('light');
  const [motion, setMotion] = useState(true);
  const [systemReduced, setSystemReduced] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [demo, setDemo] = useState(false);
  const [working, setWorking] = useState('');

  useEffect(() => {
    setThemeChoice(themePreference());
    setMotion(motionEnabled());
    setSystemReduced(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
    setPrefs(readPrefs());
    setPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
    setDemo(demoActive());
  }, []);

  const chooseTheme = (value: ThemePreference) => {
    setTheme(value);
    setThemeChoice(value);
  };

  const chooseMotion = (value: boolean) => {
    setMotionEnabled(value);
    setMotion(value);
  };

  const chooseLocale = (value: Locale) => {
    if (value === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${value}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
    setWorking(text.language.reloading);
    window.location.reload();
  };

  const updatePrefs = (next: Partial<NotificationPrefs>) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    savePrefs(merged);
  };

  const chooseBrowser = async (value: boolean) => {
    if (!value || permission === 'unsupported') return updatePrefs({ browser: false });
    const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    setPermission(result);
    updatePrefs({ browser: result === 'granted' });
  };

  // The switch moves at once; the data is written in the next frame, after the change is painted, and the page reloads
  // so every island of the panel reads it again.
  const chooseDemo = (value: boolean, reset = false) => {
    setDemo(value);
    setWorking(text.demo.working);
    requestAnimationFrame(() =>
      window.setTimeout(() => {
        if (value || reset) enableDemo();
        else disableDemo();
        window.location.hash = value ? '#dashboard' : '#settings';
        window.location.reload();
      }, 120)
    );
  };

  return (
    <div className="settings-grid">
      <CompanyProfileSettings />

      <Card icon="fa-palette" title={text.appearance.title} lead={text.appearance.lead}>
        <Row title={text.appearance.theme}>
          <Segmented<ThemePreference>
            label={text.appearance.theme}
            value={theme}
            onChange={chooseTheme}
            options={[
              { value: 'light', label: <><i className="fa-regular fa-sun" aria-hidden="true" /> {text.appearance.themes.light}</> },
              { value: 'dark', label: <><i className="fa-regular fa-moon" aria-hidden="true" /> {text.appearance.themes.dark}</> },
              { value: 'system', label: <><i className="fa-solid fa-desktop" aria-hidden="true" /> {text.appearance.themes.system}</> }
            ]}
          />
        </Row>
        <Row title={text.appearance.motion} help={systemReduced && motion ? text.appearance.motionSystem : text.appearance.motionHelp}>
          <Switch checked={motion} onChange={chooseMotion} label={text.appearance.motion} />
        </Row>
      </Card>

      <Card icon="fa-language" title={text.language.title} lead={text.language.lead}>
        <Row title={text.language.title}>
          <Segmented<Locale>
            label={text.language.title}
            value={locale}
            onChange={chooseLocale}
            options={[
              { value: 'es', label: 'Español' },
              { value: 'en', label: 'English' }
            ]}
          />
        </Row>
      </Card>

      <Card icon="fa-bell" title={text.notifications.title} lead={text.notifications.lead}>
        <Row title={text.notifications.payments} help={text.notifications.paymentsHelp}>
          <Switch checked={prefs.payments} onChange={(value) => updatePrefs({ payments: value })} label={text.notifications.payments} />
        </Row>
        <Row title={text.notifications.batches} help={text.notifications.batchesHelp}>
          <Switch checked={prefs.batches} onChange={(value) => updatePrefs({ batches: value })} label={text.notifications.batches} />
        </Row>
        <Row title={text.notifications.reminders} help={text.notifications.remindersHelp}>
          <Switch checked={prefs.reminders} onChange={(value) => updatePrefs({ reminders: value })} label={text.notifications.reminders} />
        </Row>
        <Row title={text.notifications.lead_time}>
          <select className="settings-select" value={prefs.leadHours} disabled={!prefs.reminders} onChange={(event) => updatePrefs({ leadHours: Number(event.target.value) as LeadHours })}>
            {([1, 24, 72] as const).map((hours) => (
              <option key={hours} value={hours}>
                {text.notifications.leadOptions[hours]}
              </option>
            ))}
          </select>
        </Row>
        <Row
          title={text.notifications.browser}
          help={permission === 'unsupported' ? text.notifications.browserUnsupported : permission === 'denied' ? text.notifications.browserDenied : text.notifications.browserHelp}
        >
          <Switch checked={prefs.browser} disabled={permission === 'unsupported' || permission === 'denied'} onChange={(value) => void chooseBrowser(value)} label={text.notifications.browser} />
        </Row>
        <div className="settings-actions">
          <button className="company-button" type="button" onClick={() => notify({ id: `test:${Date.now()}`, kind: 'test', href: '#settings' })}>
            <i className="fa-regular fa-paper-plane" aria-hidden="true" /> {text.notifications.test}
          </button>
        </div>
      </Card>

      <Card icon="fa-flask" title={text.demo.title} lead={text.demo.lead} badge={text.demo.badge}>
        <Row title={text.demo.toggle} help={demo ? text.demo.on : undefined}>
          <Switch checked={demo} disabled={Boolean(working)} onChange={(value) => chooseDemo(value)} label={text.demo.toggle} />
        </Row>
        {working === text.demo.working && (
          <p className="settings-working" role="status">
            <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" /> {working}
          </p>
        )}
        {demo && (
          <div className="settings-actions">
            <button
              className="company-button"
              type="button"
              disabled={Boolean(working)}
              onClick={() => chooseDemo(true, true)}
            >
              <i className="fa-solid fa-rotate" aria-hidden="true" /> {text.demo.reset}
            </button>
          </div>
        )}
      </Card>

      <CompanyRoleSettings />

      {working && working !== text.demo.working && (
        <p className="settings-working" role="status">
          <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" /> {working}
        </p>
      )}
    </div>
  );
}
