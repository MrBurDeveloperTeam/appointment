import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthProvider';
import { motion, AnimatePresence } from 'framer-motion';
import api, {creditApi} from "../services/odooApi";

export default function Header({ createAppLink, title, onNewAppointment, onToggleSidebar, credits, onOpenCredits, isSidebarOpen, isUnconfigured }) {
    const { user, signOut } = useAuth();
    const [showAccountMenu, setShowAccountMenu] = useState(false);
    const [creditBalance, setCreditBalance] = useState(null)
    const menuRef = useRef(null);

    useEffect(() => {
        console.log('user changed in Header.jsx:', user);
      const partnerId = user?.partner_id // or however you store partner_id after login
      if (!partnerId) return

      fetch(`https://app.snabbb.com/api/wallet?partner_id=${partnerId}`, {
        credentials: 'include',
      })
        .then(r => r.json())
        .then(data => setCreditBalance(data?.data?.balance ?? null))
        .catch(() => setCreditBalance(null))
    }, [user]);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setShowAccountMenu(false);
            }
        }

        async function loadWallet() {
          try {
            const info  = await api.post('/web/session/get_session_info', {}).catch(err => {
              console.error('Session info error:', err);
            });
            const { data: sessionData } = info || {};
            const { data } = await creditApi.get(`/api/wallet?partner_id=${sessionData.result.partner_id}`);
            console.log("data from wallet API:", data.data);
            setCreditBalance(data.data.snabbb_balance);
          } catch (err) {
            console.error(err);
          }
        }

        loadWallet();

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
                        onClick={() => {
                            setShowAccountMenu((current) => !current);
                        }}
                        aria-label="Account Settings"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
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
                    <div className="p-6 border-b border-[var(--border-light)] bg-[var(--surface-2)]">
                      <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em] mb-4">
                        Profile Info
                      </p>

                      <div className="flex flex-col gap-3">
                        <div>
                          <p className="text-base font-bold text-[var(--text-primary)] truncate leading-tight">
                            {user?.user_metadata.name}
                          </p>

                          {user?.jobPosition && (
                            <div className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--primary-bg)] text-[var(--primary-dark)] text-[9px] font-black uppercase tracking-wider border border-[var(--primary-light)]">
                              {user.jobPosition}
                            </div>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                            <i className="fa-regular fa-envelope text-[10px] w-3 text-center"></i>
                            <p className="text-xs font-semibold truncate">{user?.email}</p>
                          </div>

                          {user?.phone && (
                            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                              <i className="fa-solid fa-phone text-[10px] w-3 text-center"></i>
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
                            console.log('user: ',user)
                          const res = await createAppLink({
                            app: 'reward',
                            email: user?.email,
                            name: user?.user_metadata?.name,
                          });
                          
                          const supabaseUserId = res.result?.supabase_user_id;
                          const w = window.open('', '_blank');
                          if (supabaseUserId && w) {
                            w.location.href = `https://reward.snabbb.com`;
                          }
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--bg-hover)] rounded-2xl transition-all group text-left"
                      >
                        <div className="w-7 h-7 rounded-xl bg-[var(--purple-bg)] flex items-center justify-center shrink-0">
                          <i className="fa-solid fa-wallet text-[11px] text-[var(--purple)]"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[var(--text-primary)] leading-tight">Snabbb Credit</p>
                          <p className="text-[11px] font-semibold text-[var(--text-muted)] truncate">
                            {creditBalance !== null ? `${creditBalance} credits` : 'Loading...'}
                          </p>
                        </div>
                        <i className="fa-solid fa-chevron-right text-[10px] text-[var(--border-strong)] group-hover:text-[var(--text-muted)] transition-colors"></i>
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
                        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--bg-hover)] rounded-2xl transition-all group text-left"
                      >
                        <div className="w-7 h-7 rounded-xl bg-[var(--info-bg-subtle)] flex items-center justify-center shrink-0">
                          <i className="fa-solid fa-tv text-[11px] text-[var(--primary)]"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[var(--text-primary)] leading-tight">My Channel</p>
                          <p className="text-[11px] font-semibold text-[var(--text-muted)] truncate">Manage your channel</p>
                        </div>
                        <i className="fa-solid fa-chevron-right text-[10px] text-[var(--border-strong)] group-hover:text-[var(--text-muted)] transition-colors"></i>
                      </button>
                        
                      {/* Settings */}
                      <button
                        onClick={async () => {
                          const res = await createAppLink({
                            app: 'snabbb',
                            email: user?.email,
                            name: user?.user_metadata?.name,
                          });
                          
                          const supabaseUserId = res.result?.supabase_user_id;
                          const w = window.open('', '_blank');
                          if (supabaseUserId && w) {
                            w.location.href = `https://app.snabbb.com/profile-settings`;
                          }
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--bg-hover)] rounded-2xl transition-all group text-left"
                      >
                        <div className="w-7 h-7 rounded-xl bg-[var(--surface-2)] flex items-center justify-center shrink-0">
                          <i className="fa-solid fa-gear text-[11px] text-[var(--text-secondary)]"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[var(--text-primary)] leading-tight">Settings</p>
                          <p className="text-[11px] font-semibold text-[var(--text-muted)] truncate">Account & preferences</p>
                        </div>
                        <i className="fa-solid fa-chevron-right text-[10px] text-[var(--border-strong)] group-hover:text-[var(--text-muted)] transition-colors"></i>
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
                        <i className="fa-solid fa-arrow-right-from-bracket w-5"></i>
                        Log Out
                      </button>
                    </div>
                  </motion.div>
                    )}
                    </AnimatePresence>
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
