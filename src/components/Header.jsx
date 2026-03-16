import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthProvider';

export default function Header({ title, onNewAppointment, onToggleSidebar, credits, onOpenCredits, isSidebarOpen, isUnconfigured }) {
    const { user, signOut } = useAuth();
    const [showAccountMenu, setShowAccountMenu] = useState(false);
    const menuRef = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setShowAccountMenu(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <header className="header" style={{ position: 'relative', zIndex: 1000 }}>
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
                {/* Account Dropdown */}
                <div className="account-dropdown-container" ref={menuRef} style={{ position: 'relative' }}>
                    <button
                        className="btn btn-icon"
                        onClick={() => setShowAccountMenu(!showAccountMenu)}
                        aria-label="Account Settings"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                    </button>

                    {showAccountMenu && (
                        <div className="account-dropdown-menu" style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            marginTop: '8px',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            width: '200px',
                            zIndex: 100,
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden'
                        }}>
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '0.85rem', color: 'var(--text-light)', background: 'var(--bg)' }}>
                                {user?.email || 'Account Login'}
                            </div>

                            {credits !== undefined && (
                                <button
                                    onClick={() => {
                                        onOpenCredits();
                                        setShowAccountMenu(false);
                                    }}
                                    style={{ padding: '12px 16px', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: 'var(--text)' }}
                                    onMouseOver={(e) => e.target.style.background = 'var(--bg)'}
                                    onMouseOut={(e) => e.target.style.background = 'transparent'}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="2" y="5" width="20" height="14" rx="2" />
                                        <line x1="2" y1="10" x2="22" y2="10" />
                                    </svg>
                                    Subscription Plan
                                </button>
                            )}

                            <button
                                onClick={() => {
                                    signOut();
                                    setShowAccountMenu(false);
                                }}
                                style={{ padding: '12px 16px', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: 'var(--danger)' }}
                                onMouseOver={(e) => e.target.style.background = 'var(--danger-light)'}
                                onMouseOut={(e) => e.target.style.background = 'transparent'}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                                    <polyline points="16 17 21 12 16 7"></polyline>
                                    <line x1="21" y1="12" x2="9" y2="12"></line>
                                </svg>
                                Logout
                            </button>
                        </div>
                    )}
                </div>

                {/* New Appointment Action */}
                {!isUnconfigured && (
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
                )}
            </div>
        </header>
    );
}
