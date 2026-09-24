// The bell of the company panel: a drawer that slides in with the notifications, a toast for each one that arrives
// while the page is open, and the check of the agenda's dates every half minute.
import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
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
  notify,
  setNoticeDescriber,
  type Notice,
  type NoticeKind
} from '@/lib/client/notifications';
import { userSession } from '@/lib/client/session';
import { storedUser } from '@/lib/client/account';
import { fetchInbox } from '@/lib/client/invitations';
import type { Locale } from '@/lib/locale';
import type { TeamRole } from '@/lib/types';
import { CompanyTextProvider, useCompanyText, useHydrated } from './CompanyText';

const REMINDER_CHECK_MS = 30_000;
// Invitations other companies sent to this account, looked for every 20 seconds (they last 3 minutes).
const INBOX_CHECK_MS = 20_000;
const TOAST_MS = 6500;

const ICONS: Record<NoticeKind, { icon: string; tone: string }> = {
  paymentSucceeded: { icon: 'fa-circle-check', tone: 'success' },
  batchCreated: { icon: 'fa-layer-group', tone: 'info' },
  paymentSoon: { icon: 'fa-clock', tone: 'warning' },
  paymentDue: { icon: 'fa-triangle-exclamation', tone: 'danger' },
  batchSoon: { icon: 'fa-calendar-day', tone: 'warning' },
  batchDue: { icon: 'fa-calendar-xmark', tone: 'danger' },
  teamInvite: { icon: 'fa-envelope-open-text', tone: 'info' },
  inviteAccepted: { icon: 'fa-user-check', tone: 'success' },
  inviteDeclined: { icon: 'fa-user-xmark', tone: 'warning' },
  test: { icon: 'fa-bell', tone: 'info' }
};

export const describeNotice = (notice: Notice, t: CompanyMessages) => {
  const kind = t.notifications.kinds[notice.kind];
  const date = notice.params['date'];
  const when = date ? new Intl.DateTimeFormat(t.intl, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(date)) : '';
  // A date that ends in "a. m." already has its period: the sentence does not add a second one.
  const roleLabel = t.roles[notice.params['role'] as TeamRole] ?? '';
  return { title: kind.title, body: kind.body({ ...notice.params, when, roleLabel }).replace(/\.\.$/, '.') };
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
  // Opening the drawer reads everything, but what was new stays marked while it is open, so it can still be told apart.
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(new Set());
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const unread = notices.filter((notice) => !notice.read).length;

  useEffect(() => {
    if (!userSession.isActive()) return undefined;
    setNoticeDescriber((notice) => describeNotice(notice, t));
    loadNotices();
    checkReminders();
    const timer = window.setInterval(() => checkReminders(), REMINDER_CHECK_MS);
    const checkInbox = async () => {
      const email = storedUser()?.email;
      if (!email) return;
      try {
        for (const invitation of await fetchInbox(email)) {
          notify({
            id: `invite:${invitation.id}`,
            kind: 'teamInvite',
            params: { inviter: invitation.inviterName, company: invitation.companyName, role: invitation.role },
            href: `/invite#t=${invitation.token}`
          });
        }
      } catch {
        // Offline or the server is busy: the next check tries again.
      }
    };
    void checkInbox();
    const inboxTimer = window.setInterval(() => void checkInbox(), INBOX_CHECK_MS);
    // Another tab of the panel notified or read something.
    const sync = (event: StorageEvent) => {
      if (event.key?.includes(':notifications:')) loadNotices();
    };
    window.addEventListener('storage', sync);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(inboxTimer);
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

  const openDrawer = () => {
    setHighlighted(new Set());
    setOpen(true);
  };

  const closeDrawer = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus({ preventScroll: true });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer();
      // A modal drawer: Tab cycles inside it instead of wandering into the dimmed page behind.
      if (event.key !== 'Tab') return;
      const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') ?? [])];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  // Opening reads everything that was new, and so does a notice that arrives while it is open; it stays marked as new
  // until the drawer closes. Its toast would repeat what the drawer already shows.
  useEffect(() => {
    if (!open || !unread) return;
    setHighlighted((current) => new Set([...current, ...notices.filter((notice) => !notice.read).map((notice) => notice.id)]));
    markAllRead();
    fresh.forEach((notice) => dismissFresh(notice.id));
  }, [open, unread]);

  const openNotice = (notice: Notice) => {
    markRead(notice.id);
    dismissFresh(notice.id);
    // Focus goes back to the bell unless the notice leads to another view (the view focuses its own heading).
    closeDrawer(!notice.href || notice.href === window.location.hash);
    if (notice.href?.startsWith('#')) window.location.hash = notice.href;
    else if (notice.href) window.location.href = notice.href;
  };

  return (
    <div className="company-notifications">
      <button
        ref={buttonRef}
        className={`company-icon-button company-bell ${ring ? 'is-ringing' : ''}`}
        type="button"
        aria-label={unread ? text.buttonUnread(unread) : text.button}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="company-notifications-panel"
        onClick={() => (open ? closeDrawer() : openDrawer())}
      >
        <i className="fa-regular fa-bell" aria-hidden="true" />
        {unread > 0 && (
          <span className="company-bell-badge" key={unread}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <div className={`notifications-scrim ${open ? 'is-open' : ''}`} aria-hidden="true" onClick={() => closeDrawer()} />
      <aside
        ref={panelRef}
        className={`notifications-panel ${open ? 'is-open' : ''}`}
        id="company-notifications-panel"
        role="dialog"
        aria-modal="true"
        aria-label={text.title}
        inert={!open}
      >
        <div className="notifications-head">
          <strong>{text.title}</strong>
          <button ref={closeRef} type="button" className="company-icon-button is-small" aria-label={text.closePanel} onClick={() => closeDrawer()}>
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>
        {notices.length ? (
          <ul className="notifications-list">
            {notices.map((notice, index) => {
              const { title, body } = describeNotice(notice, t);
              const look = ICONS[notice.kind];
              return (
                <li key={notice.id} style={{ '--item-index': Math.min(index, 8) } as CSSProperties}>
                  <button type="button" className={`notification-item ${highlighted.has(notice.id) ? 'is-new' : ''}`} onClick={() => openNotice(notice)}>
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
          <a href="#settings" onClick={() => closeDrawer(false)}>
            <i className="fa-solid fa-sliders" aria-hidden="true" /> {text.settings}
          </a>
          <button type="button" className="notifications-text-button" disabled={!notices.length} onClick={clearNotices}>
            <i className="fa-regular fa-trash-can" aria-hidden="true" /> {text.clear}
          </button>
        </div>
      </aside>

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
