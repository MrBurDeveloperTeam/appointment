import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthProvider';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, LogOut, Mail, Phone } from 'lucide-react';
import { useProfileImage } from '../../hooks/useProfileImage';

export default function Header({ createAppLink, title, onNewAppointment, onToggleSidebar, credits, onOpenCredits, isSidebarOpen, isUnconfigured }) {
    const { user, signOut, role } = useAuth();
    const { profileImageUrl } = useProfileImage(Boolean(user));
    const [failedImageUrl, setFailedImageUrl] = useState(null);
    const metadata = user?.user_metadata;
    const displayName = metadata?.full_name || metadata?.name
        || [metadata?.first_name, metadata?.last_name].filter(Boolean).join(' ')
        || user?.email?.split('@')[0] || 'U';
    const initials = displayName.trim().split(/\s+/).filter(Boolean).slice(0, 2)
        .map((part) => Array.from(part)[0]).join('').toUpperCase();
    const [showAccountMenu, setShowAccountMenu] = useState(false);
    const [
        creditBalance,
        setCreditBalance
    ] = useState(null);

    const [
        creditLoading,
        setCreditLoading
    ] = useState(false);

    const [
        creditError,
        setCreditError
    ] = useState(null);
    const [isOpeningSupportTickets, setIsOpeningSupportTickets] = useState(false);
    const showSupportTickets = true;
    const menuRef = useRef(null);

    function openSupportTickets() {
        if (isOpeningSupportTickets) return;

        setShowAccountMenu(false);
        setIsOpeningSupportTickets(true);
        const dashboardPath = role === 'admin' ? '/admin/dashboard' : '/user/dashboard';
        window.location.assign(`https://app.snabbb.com${dashboardPath}`);
    }

    /*
    * Load Snabbb Credit using the authenticated
    * Supabase user's email.
    */
    useEffect(() => {
        const email =
            user?.email?.trim();

        if (!email) {
            setCreditBalance(null);
            setCreditLoading(false);
            setCreditError(null);

            return;
        }

        const controller =
            new AbortController();

        async function loadCreditBalance() {
            setCreditLoading(true);
            setCreditError(null);

            try {
                const response =
                    await fetch(
                        `/api/wallet?email=${encodeURIComponent(
                            email
                        )}`,
                        {
                            method: 'GET',
                            credentials: 'include',
                            headers: {
                                Accept:
                                    'application/json',
                            },
                            signal:
                                controller.signal,
                        }
                    );

                const result =
                    await response
                        .json()
                        .catch(() => null);

                if (
                    !response.ok ||
                    !result?.ok
                ) {
                    throw new Error(
                        result?.error ||
                        'Unable to load balance'
                    );
                }

                /*
                * E-learning uses snabbb_balance.
                * Keep balance as a fallback for compatibility.
                */
                const rawBalance =
                    result?.data
                        ?.snabbb_balance ??
                    result?.data?.balance ??
                    result?.snabbb_balance ??
                    result?.balance;

                const parsedBalance =
                    Number(rawBalance);

                if (
                    !Number.isFinite(
                        parsedBalance
                    )
                ) {
                    throw new Error(
                        'Invalid wallet balance'
                    );
                }

                setCreditBalance(
                    parsedBalance
                );
            } catch (error) {
                if (
                    error?.name ===
                    'AbortError'
                ) {
                    return;
                }

                console.error(
                    'Failed to load Snabbb Credit:',
                    error
                );

                setCreditBalance(null);

                setCreditError(
                    'Unable to load balance'
                );
            } finally {
                if (
                    !controller.signal.aborted
                ) {
                    setCreditLoading(false);
                }
            }
        }

        loadCreditBalance();

        return () => {
            controller.abort();
        };
    }, [
        user?.id,
        user?.email
    ]);

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
          {/* New Appointment Action */}
          {onNewAppointment && (
            <button
              type="button"
              className="btn"
              onClick={onNewAppointment}
              style={{
                gap: '6px',
                paddingLeft: '14px',
                paddingRight: '14px',
                background: 'var(--primary-light)',
                border: '1px solid var(--primary-light)',
                color: '#ffffff',
                boxShadow: '0 2px 6px rgba(90, 184, 174, 0.22)',
                textShadow: 'none',
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>

              <span>New Appointment</span>
            </button>
          )}
                {/* Account Dropdown */}
                <div className="account-dropdown-container" ref={menuRef} style={{ position: 'relative' }}>
                    <button
                        className="account-avatar-trigger"
                        type="button"
                        onClick={() => {
                            setShowAccountMenu((current) => !current);
                        }}
                        aria-label="Account Settings"
                        aria-haspopup="menu"
                        aria-expanded={showAccountMenu}
                    >
                        {profileImageUrl && failedImageUrl !== profileImageUrl ? (
                            <img src={profileImageUrl} alt="" onError={() => setFailedImageUrl(profileImageUrl)} />
                        ) : <span aria-hidden="true">{initials}</span>}
                    </button>

                    <AnimatePresence>
                    {showAccountMenu && (
                        // <div className="account-dropdown-menu" style={{
                        //     position: 'absolute',
                        //     top: '100%',
                        //     right: 0,
                        //     marginTop: '8px',
                        //     background: 'var(--surface)',
                        //     border: '1px solid var(--border)',
                        //     borderRadius: '8px',
                        //     boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        //     width: '248px',
                        //     zIndex: 100,
                        //     display: 'flex',
                        //     flexDirection: 'column',
                        //     overflow: 'hidden'
                        // }}>
                        //     <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '0.85rem', color: 'var(--text-light)', background: 'var(--bg)' }}>
                        //         {user?.email || 'Account Login'}
                        //     </div>

                        //     {credits !== undefined && (
                        //         <button
                        //             onClick={() => {
                        //                 onOpenCredits();
                        //                 setShowAccountMenu(false);
                        //             }}
                        //             style={{ padding: '12px 16px', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: 'var(--text)' }}
                        //             onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg)'}
                        //             onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                        //         >
                        //             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        //                 <rect x="2" y="5" width="20" height="14" rx="2" />
                        //                 <line x1="2" y1="10" x2="22" y2="10" />
                        //             </svg>
                        //             Subscription Plan
                        //         </button>
                        //     )}

                        //     <button
                        //         onClick={() => {
                        //             signOut();
                        //             setShowAccountMenu(false);
                        //         }}
                        //         style={{ padding: '12px 16px', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: 'var(--danger)' }}
                        //         onMouseOver={(e) => e.currentTarget.style.background = 'var(--danger-light)'}
                        //         onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                        //     >
                        //         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        //             <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        //             <polyline points="16 17 21 12 16 7"></polyline>
                        //             <line x1="21" y1="12" x2="9" y2="12"></line>
                        //         </svg>
                        //         Logout
                        //     </button>
                        // </div>
                         <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute right-0 mt-3 w-80 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] overflow-hidden"
                  >
                    {/* Profile Info */}
                    <div className="p-6 border-b border-[var(--border-light)]">
                      <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em] mb-4">
                        Profile Info
                      </p>

                      <div className="flex flex-col gap-3">
                        <div>
                          <p className="text-base font-bold text-[var(--text-primary)] truncate leading-tight">
                            {user?.user_metadata?.name}
                          </p>

                          {user?.jobPosition && (
                            <div className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--primary-bg)] text-[var(--primary-dark)] text-[9px] font-black uppercase tracking-wider border border-[var(--primary-light)]">
                              {user.jobPosition}
                            </div>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                            <Mail size={12} className="shrink-0" aria-hidden="true" />
                            <p className="text-xs font-semibold truncate">{user?.email}</p>
                          </div>

                          {user?.phone && (
                            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                              <Phone size={12} className="shrink-0" aria-hidden="true" />
                              <p className="text-xs font-semibold truncate">{user.phone}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Nav Items */}
                    <div className="p-2 border-b border-[var(--border-light)]">
                      {/* Snabbb Credit */}
                    <button
                      onClick={async () => {
                        // Open the tab synchronously inside the click so popup blockers allow it,
                        // then point it at the SSO login link once the API responds.
                        const w = window.open('', '_blank');
                        try {
                          const res = await createAppLink({
                            app: 'reward',
                            email: user?.email,
                            name: user?.user_metadata?.name,
                          });

                          // The reward app signs the user in through this one-time SSO link.
                          // (supabase_user_id can be null for this app, so it must not gate navigation.)
                          const ssoUrl = res.result?.url;
                          if (!ssoUrl) throw new Error('Reward SSO link missing from response');

                          // Deep-link hint, delivered two ways so it survives the SSO redirect chain:
                          // a short-lived shared cookie and a query param on the SSO link.
                          try {
                            document.cookie = 'snabbb_reward_section=credit; domain=.snabbb.com; path=/; max-age=300; SameSite=Lax; Secure';
                          } catch {}
                          const target = new URL(ssoUrl);
                          target.searchParams.set('section', 'credit');

                          if (w) {
                            w.location.href = target.toString();
                          } else {
                            window.location.assign(target.toString());
                          }
                        } catch (error) {
                          console.error('Failed to open Snabbb Reward:', error);
                          w?.close();
                        }
                      }}
                      className="w-full flex items-center px-4 py-3.5 hover:bg-[var(--bg-hover)] rounded-2xl transition-all group text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[var(--text-primary)] leading-tight">
                          Snabbb Credit
                        </p>

                        <p className="text-[11px] font-semibold text-[var(--text-muted)] truncate">
                          {creditLoading
                            ? 'Loading...'
                            : creditError
                              ? creditError
                              : creditBalance !== null
                                ? `${creditBalance} credits`
                                : 'Balance unavailable'}
                        </p>
                      </div>

                      <ChevronRight size={12} className="shrink-0 text-[var(--border-strong)] group-hover:text-[var(--text-muted)] transition-colors" aria-hidden="true" />
                    </button>
                        
                      {/* My Channel */}
                      <button
                        onClick={async () => {
                          const res = await createAppLink({
                            app: 'e-learning',
                            email: user?.email,
                            name: user?.user_metadata?.name,
                          });
                          
                          const supabaseUserId = res.result?.supabase_user_id;
                          const w = window.open('', '_blank');
                          if (supabaseUserId && w) {
                            w.location.href = `https://e-learning.snabbb.com/channel/${supabaseUserId}`;
                          }
                        }}
                        className="w-full flex items-center px-4 py-3.5 hover:bg-[var(--bg-hover)] rounded-2xl transition-all group text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[var(--text-primary)] leading-tight">My Channel</p>
                          <p className="text-[11px] font-semibold text-[var(--text-muted)] truncate">Manage your channel</p>
                        </div>
                        <ChevronRight size={12} className="shrink-0 text-[var(--border-strong)] group-hover:text-[var(--text-muted)] transition-colors" aria-hidden="true" />
                      </button>

                      {/* Support Tickets: retained but hidden until the feature is complete. */}
                      {showSupportTickets && (
                        <button
                          type="button"
                          disabled={isOpeningSupportTickets}
                          onClick={openSupportTickets}
                          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--bg-hover)] rounded-2xl transition-all group text-left disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-[var(--text-primary)] leading-tight">{role === 'admin' ? 'Support Tickets' : 'Support Tickets'}</p>
                            <p className="text-[11px] font-semibold text-[var(--text-muted)] truncate">{role === 'admin' ? 'Manage all support tickets' : 'Create and track support tickets'}</p>
                          </div>
                          <ChevronRight size={12} className="shrink-0 text-[var(--border-strong)] group-hover:text-[var(--text-muted)] transition-colors" aria-hidden="true" />
                        </button>
                      )}
                        
                      {/* Settings */}
                      <button
                        onClick={async () => {
                          const res = await createAppLink({
                            app: 'snabbb',
                            email: user?.email,
                            name: user?.user_metadata?.name,
                          });
                          
                          const supabaseUserId = res.result?.supabase_user_id;
                          if (supabaseUserId) {
                            window.location.assign('https://app.snabbb.com/profile-settings');
                          }
                        }}
                        className="w-full flex items-center px-4 py-3.5 hover:bg-[var(--bg-hover)] rounded-2xl transition-all group text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[var(--text-primary)] leading-tight">Settings</p>
                          <p className="text-[11px] font-semibold text-[var(--text-muted)] truncate">Account & preferences</p>
                        </div>
                        <ChevronRight size={12} className="shrink-0 text-[var(--border-strong)] group-hover:text-[var(--text-muted)] transition-colors" aria-hidden="true" />
                      </button>
                    </div>
                        
                    {/* Log Out */}
                    <div className="p-2">
                      <button
                        onClick={() => {
                          signOut();
                          setShowAccountMenu(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-bold text-[var(--danger)] hover:bg-[var(--danger-bg)] rounded-2xl transition-all group text-left"
                      >
                        <LogOut size={18} className="shrink-0 w-5" aria-hidden="true" />
                        Log Out
                      </button>
                    </div>
                  </motion.div>
                    )}
                    </AnimatePresence>
                </div>

            </div>
        </header>
    );
}
