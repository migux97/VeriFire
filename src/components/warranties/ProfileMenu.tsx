import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { storedUser, type StoredUser } from '@/lib/client/account';
import { leaveSession } from '@/lib/client/session';
import { $deviceEnrollmentOffered, $deviceFormOpen } from '@/stores/devices';

export function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<StoredUser | null>(null);
  const enrollmentOffered = useStore($deviceEnrollmentOffered);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setUser(storedUser());
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('click', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('click', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const openDeviceForm = () => {
    setOpen(false);
    $deviceFormOpen.set(true);
  };

  return (
    <div ref={menuRef} className="profile-menu">
      <button
        ref={buttonRef}
        className="icon-button"
        type="button"
        aria-label="Mi perfil"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="profile-popover"
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="fa-regular fa-user" />
      </button>
      <div id="profile-popover" className="profile-popover" role="dialog" aria-label="Mi perfil" hidden={!open}>
        <div className="profile-popover-header">
          <span className="profile-avatar" aria-hidden="true">{(user?.name || 'V').charAt(0).toUpperCase()}</span>
          <div className="profile-popover-copy">
            <strong>{user?.name || 'Usuario Verifire'}</strong>
            <span>{user?.email || 'Correo no disponible'}</span>
          </div>
        </div>
        {enrollmentOffered && (
          <button className="profile-action" type="button" onClick={openDeviceForm}>
            <Icon name="fa-solid fa-mobile-screen" /> Habilitar en mis otros dispositivos
          </button>
        )}
        <button className="profile-action" type="button" onClick={() => leaveSession('cerrada')}>
          <Icon name="fa-solid fa-arrow-right-from-bracket" /> Cerrar sesión
        </button>
      </div>
    </div>
  );
}
