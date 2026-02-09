import React from 'react';

export default function Header({ title, onNewAppointment, onToggleSidebar, credits, onOpenCredits, isSidebarOpen }) {
    return (
        <header className="header">
            <div className="header-left">
                {!isSidebarOpen && (
                    <button
                        className="btn btn-icon header-menu-btn"
                        onClick={onToggleSidebar}
                        aria-label="Open menu"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="3" y1="12" x2="21" y2="12"></line>
                            <line x1="3" y1="6" x2="21" y2="6"></line>
                            <line x1="3" y1="18" x2="21" y2="18"></line>
                        </svg>
                    </button>
                )}
                <h1 className="header-title">{title}</h1>
            </div>

            <div className="header-right">
                {/* Credits Badge */}
                {credits !== undefined && (
                    <button
                        className="credit-badge"
                        onClick={onOpenCredits}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="5" width="20" height="14" rx="2" />
                            <line x1="2" y1="10" x2="22" y2="10" />
                        </svg>
                        <span>{credits} Credits</span>
                    </button>
                )}

                {/* New Appointment Action */}
                <button
                    className="btn btn-primary"
                    onClick={onNewAppointment}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    <span className="hide-on-mobile">New Appointment</span>
                </button>
            </div>
        </header>
    );
}
