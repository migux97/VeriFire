// The bell of the company panel: the list of notifications, a toast for each one that arrives while the page is open,
// and the check of the agenda's dates every half minute.
import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState } from 'react';
import { relativeTime, type CompanyMessages } from '@/i18n/company';
import {
  $freshNotices,
  $notices,
  checkReminders,
  clearNotices,
  dismissFresh,
  loadNotices,
  markAllRead,
  markRead,
  setNoticeDescriber,
  type Notice,
  type NoticeKind
} from '@/lib/client/notifications';
import { userSession } from '@/lib/client/session';
import type { Locale } from '@/lib/locale';
import { CompanyTextProvider, useCompanyText, useHydrated } from './CompanyText';

const REMINDER_CHECK_MS = 30_000;
const TOAST_MS = 6500;

const ICONS: Record<NoticeKind, { icon: string; tone: string }> = {
  paymentSucceeded: { icon: 'fa-circle-check', tone: 'success' },
  batchCreated: { icon: 'fa-layer-group', tone: 'info' },
  paymentSoon: { icon: 'fa-clock', tone: 'warning' },
  paymentDue: { icon: 'fa-triangle-exclamation', tone: 'danger' },
  batchSoon: { icon: 'fa-calendar-day', tone: 'warning' },
  batchDue: { icon: 'fa-calendar-xmark', tone: 'danger' },
  demo: { icon: 'fa-flask', tone: 'info' },
  test: { icon: 'fa-bell', tone: 'info' }
};

export const describeNotice = (notice: Notice, t: CompanyMessages) => {
  const kind = t.notifications.kinds[notice.kind];
  const date = notice.params['date'];
  const when = date ? new Intl.DateTimeFormat(t.intl, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(date)) : '';
  return { title: kind.title, body: kind.body({ ...notice.params, when }) };
};

export function CompanyNotifications({ locale }: { locale?: Locale | undefined }) {
  return (
    <CompanyTextProvider locale={locale}>
      <Notifications />
    </CompanyTextProvider>
  );
}

function Notifications() {
  const t = useCompanyText();
  const text = t.notifications;
  // Another island can notify before this one hydrates; the first render must match the server's empty bell.
  const hydrated = useHydrated();
  const storedNotices = useStore($notices);
  const storedFresh = useStore($freshNotices);
  const notices = hydrated ? storedNotices : [];
  const fresh = hydrated ? storedFresh : [];
  const [open, setOpen] = useState(false);
  const [ring, setRing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const unread = notices.filter((notice) => !notice.read).length;

  useEffect(() => {
    if (!userSession.isActive()) return undefined;
    setNoticeDescriber((notice) => describeNotice(notice, t));
    loadNotices();
    checkReminders();
    const timer = window.setInterval(() => checkReminders(), REMINDER_CHECK_MS);
    // Another tab of the panel notified or read something.
    const sync = (event: StorageEvent) => {
      if (event.key?.includes(':notifications:')) loadNotices();
    };
    window.addEventListener('storage', sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', sync);
      setNoticeDescriber(null);
    };
  }, []);

  // The bell swings once for each new arrival.
  useEffect(() => {
    if (!fresh.length) return undefined;
    setRing(true);
    const timer = window.setTimeout(() => setRing(false), 900);
    return () => window.clearTimeout(timer);
  }, [fresh.length]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('click', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('click', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const openNotice = (notice: Notice) => {
    markRead(notice.id);
    setOpen(false);
    if (notice.href) window.location.hash = notice.href;
  };

  return (
    <div className="company-notifications" ref={rootRef}>
      <button
        ref={buttonRef}
        className={`company-icon-button company-bell ${ring ? 'is-ringing' : ''}`}
        type="button"
        aria-label={unread ? text.buttonUnread(unread) : text.button}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="company-notifications-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <i className="fa-regular fa-bell" aria-hidden="true" />
        {unread > 0 && (
          <span className="company-bell-badge" key={unread}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <div className="notifications-panel" id="company-notifications-panel" role="dialog" aria-label={text.title} hidden={!open}>
        <div className="notifications-head">
          <strong>{text.title}</strong>
          <button type="button" className="notifications-text-button" disabled={!unread} onClick={markAllRead}>
            {text.markAll}
          </button>
        </div>
        {notices.length ? (
          <ul className="notifications-list">
            {notices.map((notice) => {
              const { title, body } = describeNotice(notice, t);
              const look = ICONS[notice.kind];
              return (
                <li key={notice.id}>
                  <button type="button" className={`notification-item ${notice.read ? '' : 'is-unread'}`} onClick={() => openNotice(notice)}>
                    <span className={`notification-icon is-${look.tone}`} aria-hidden="true">
                      <i className={`fa-solid ${look.icon}`} />
                    </span>
                    <span className="notification-text">
                      <strong>{title}</strong>
                      <span>{body}</span>
                      <time dateTime={notice.at}>{relativeTime(notice.at, t.intl)}</time>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="notifications-empty">
            <i className="fa-regular fa-bell-slash" aria-hidden="true" />
            {text.empty}
          </p>
        )}
        <div className="notifications-foot">
          <a href="#settings" onClick={() => setOpen(false)}>
            <i className="fa-solid fa-sliders" aria-hidden="true" /> {text.settings}
          </a>
          <button type="button" className="notifications-text-button" disabled={!notices.length} onClick={clearNotices}>
            {text.clear}
          </button>
        </div>
      </div>

      <div className="notification-toasts" role="status" aria-live="polite">
        {fresh.map((notice) => (
          <NoticeToast key={notice.id} notice={notice} t={t} onOpen={() => openNotice(notice)} />
        ))}
      </div>
    </div>
  );
}

function NoticeToast({ notice, t, onOpen }: { notice: Notice; t: CompanyMessages; onOpen: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const { title, body } = describeNotice(notice, t);
  const look = ICONS[notice.kind];

  useEffect(() => {
    const leave = window.setTimeout(() => setLeaving(true), TOAST_MS);
    return () => window.clearTimeout(leave);
  }, []);

  useEffect(() => {
    if (!leaving) return undefined;
    // Removed once its exit animation had time to play (instantly when animations are off).
    const gone = window.setTimeout(() => dismissFresh(notice.id), document.documentElement.dataset['motion'] === 'off' ? 0 : 320);
    return () => window.clearTimeout(gone);
  }, [leaving]);

  return (
    <div className={`notification-toast is-${look.tone} ${leaving ? 'is-leaving' : ''}`}>
      <span className={`notification-icon is-${look.tone}`} aria-hidden="true">
        <i className={`fa-solid ${look.icon}`} />
      </span>
      <button type="button" className="notification-toast-body" onClick={onOpen}>
        <strong>{title}</strong>
        <span>{body}</span>
      </button>
      <button type="button" className="notification-toast-close" aria-label={t.notifications.close} onClick={() => setLeaving(true)}>
        <i className="fa-solid fa-xmark" aria-hidden="true" />
      </button>
    </div>
  );
}
