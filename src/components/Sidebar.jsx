import { useToast } from '../context/ToastProvider';

export default function Sidebar({
  view,
  onChange,
  theme,
  setTheme,
  onLogout,
  bookingLink,
  isOpen,
  onClose,
  isUnconfigured,
  enforceConfiguration = false,
  pendingRequestsCount,
  permissions = {},
}) {
  const { addToast } = useToast();
  const items = [
    {
      id: "calendar",
      label: "Calendar",
      icon: "calendar",
      permission:
        "appointment.schedule.access",
    },
    {
      id: "today",
      label: "Today",
      icon: "clock",
      permission:
        "appointment.schedule.access",
    },
    {
      id: "patients",
      label: "Patients",
      icon: "users",
      permission:
        "appointment.patients.access",
    },
    {
      id: "requests",
      label: "Requests",
      icon: "inbox",
      permission:
        "appointment.requests.manage",
    },
    {
      id: "settings",
      label: "Settings",
      icon: "gear",
      permission:
        "appointment.settings.manage",
    },
    {
      id: "reports",
      label: "Reports",
      icon: "bar",
      permission:
        "appointment.reports.view",
    },
    {
      id: "activity",
      label: "Activity",
      icon: "pulse",
      permission:
        "appointment.reports.view",
    },
  ].filter(
    (item) =>
      permissions[item.permission] === true
  );


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
        <div
          className="sidebar-logo"
          onClick={() => window.open('https://app.snabbb.com/', '_self')}
          style={{ cursor: 'pointer' }}
        >
          <img
            className="sidebar-logo-img"
            src={theme === 'dark' ? "/assets/Snabbb (White).png" : "/assets/Snabbb (Teal).png"}
            alt="Snabbb"
          />
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
        {items.map((item) => {
        const isDisabled =enforceConfiguration &&item.id !== "settings";
            return (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${view === item.id ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
              onClick={() => onChange(item.id)}
              aria-current={view === item.id ? 'page' : undefined}
              style={isDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            >
              {renderIcon(item.icon)}
              <span>{item.label}</span>
              {item.id === 'requests' && pendingRequestsCount > 0 && (
                <span style={{
                  marginLeft: 'auto',
                  background: '#ef4444',
                  color: '#fff',
                  borderRadius: '999px',
                  fontSize: '11px',
                  fontWeight: 700,
                  lineHeight: 1,
                  padding: '3px 7px',
                  minWidth: '18px',
                  textAlign: 'center',
                  display: 'inline-block',
                }}>
                  {pendingRequestsCount > 99 ? '99+' : pendingRequestsCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-booking">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                background: 'var(--primary-bg)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10 13a5 5 0 0 0 7.07.07l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15" />
                <path d="M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20l1.15-1.15" />
              </svg>
            </div>

            <div style={{ minWidth: 0 }}>
              <div className="sidebar-theme-title">Booking link</div>
              <div className="sidebar-theme-subtitle">
                Share with patients
              </div>
            </div>
          </div>

          <div className="sidebar-booking-row">
            <input
              className="form-input sidebar-booking-input"
              value={bookingLink || 'Set clinic slug to enable link'}
              readOnly
              aria-label="Booking link"
              style={{
                flex: 1,
                minWidth: 0,
              }}
            />

            <button
              className="btn btn-primary btn-sm"
              type="button"
              disabled={!bookingLink || isUnconfigured}
              onClick={() => {
                if (!bookingLink) return;

                if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(bookingLink);
                } else {
                  window.prompt('Copy booking link:', bookingLink);
                }
              }}
              style={{
                flexShrink: 0,
                gap: '6px',
                paddingLeft: '10px',
                paddingRight: '10px',

                background: 'var(--primary-light)',
                border: '1px solid var(--primary-light)',
                color: '#ffffff',
                boxShadow: '0 2px 6px rgba(90, 184, 174, 0.22)',
                textShadow: 'none',
              }}
              aria-label="Copy booking link"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>

              <span>Copy</span>
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
        <button
          className="btn btn-ghost sidebar-logout"
          onClick={onLogout}
          style={{
            justifyContent: 'flex-start',
            paddingLeft: '12px',
            paddingRight: '12px',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>

          <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}


