import { useToast } from '../context/ToastProvider';

export default function Sidebar({ view, onChange, theme, setTheme, onLogout, bookingLink, isOpen, onClose }) {
  const { addToast } = useToast();
  const items = [
    { id: 'calendar', label: 'Calendar', icon: 'calendar' },
    { id: 'today', label: 'Today', icon: 'clock' },
    { id: 'patients', label: 'Patients', icon: 'users' },
    { id: 'requests', label: 'Requests', icon: 'inbox' },
    { id: 'settings', label: 'Settings', icon: 'gear' },
    { id: 'reports', label: 'Reports', icon: 'bar' },
    { id: 'activity', label: 'Activity', icon: 'pulse' },
  ];

  const renderIcon = (icon) => {
    switch (icon) {
      case 'calendar':
        return (
          <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        );
      case 'clock':
        return (
          <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        );
      case 'users':
        return (
          <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        );
      case 'inbox':
        return (
          <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 12h-6l-2 3h-4l-2-3H2" />
            <path d="M5.45 5h13.1l2.45 7v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7l2.45-7z" />
          </svg>
        );
      default:
        if (icon === 'gear') {
          return (
            <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          );
        }
        if (icon === 'bar') {
          return (
            <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          );
        }
        return (
          <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        );
    }
  };

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <img className="sidebar-logo-img" src="/assets/Mr_Bur_Logo-01.png" alt="MR.BUR" />
        </div>
        <button
          type="button"
          className="btn btn-icon sidebar-close-btn"
          onClick={onClose}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <nav className="sidebar-nav" aria-label="Primary">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item ${view === item.id ? 'active' : ''}`}
            onClick={() => onChange(item.id)}
            aria-current={view === item.id ? 'page' : undefined}
          >
            {renderIcon(item.icon)}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-booking">
          <div>
            <div className="sidebar-theme-title">Booking link</div>
            <div className="sidebar-theme-subtitle">Share with patients</div>
          </div>
          <div className="sidebar-booking-row">
            <input
              className="form-input sidebar-booking-input"
              value={bookingLink || 'Set clinic slug to enable link'}
              readOnly
              aria-label="Booking link"
            />
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              disabled={!bookingLink}
              onClick={() => {
                if (!bookingLink) return;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(bookingLink);
                } else {
                  window.prompt('Copy booking link:', bookingLink);
                }
              }}
            >
              Copy
            </button>
          </div>
        </div>
        <div className="sidebar-theme">
          <div>
            <div className="sidebar-theme-title">Theme</div>
            <div className="sidebar-theme-subtitle">Light / Dark</div>
          </div>
          <label className="theme-toggle">
            <input
              type="checkbox"
              checked={theme === 'dark'}
              onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')}
              aria-label="Toggle dark mode"
            />
            <span className="theme-slider"></span>
            <span className="theme-label">{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </label>
        </div>
        <button className="btn btn-secondary sidebar-logout" onClick={onLogout}>
          Logout
        </button>
      </div>
    </aside>
  );
}


