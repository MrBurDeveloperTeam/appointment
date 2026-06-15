import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthProvider';
import { supabase } from '../lib/supabaseClient';
import { PET_OPTIONS, getPetOption, normalizePetId } from '../VirtualPet/petOptions';

export default function Header({ title, onNewAppointment, onToggleSidebar, credits, onOpenCredits, isSidebarOpen, isUnconfigured }) {
    const { user, signOut } = useAuth();
    const [showAccountMenu, setShowAccountMenu] = useState(false);
    const [accountMenuView, setAccountMenuView] = useState('main');
    const [selectedPetId, setSelectedPetId] = useState(() => normalizePetId(localStorage.getItem('pet_name')));
    const [isSavingPet, setIsSavingPet] = useState(false);
    const menuRef = useRef(null);
    const selectedPet = getPetOption(selectedPetId);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setShowAccountMenu(false);
                setAccountMenuView('main');
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        let isMounted = true;

        const loadPet = async () => {
            const localPetId = normalizePetId(localStorage.getItem('pet_name'));
            if (isMounted) setSelectedPetId(localPetId);

            if (!user?.id) return;

            const { data, error } = await supabase
                .from('inventory_pet')
                .select('pet_name')
                .eq('user_id', user.id)
                .maybeSingle();

            if (isMounted && data && !error) {
                const petId = normalizePetId(data.pet_name);
                setSelectedPetId(petId);
                localStorage.setItem('pet_name', petId);
                window.dispatchEvent(new CustomEvent('virtual-pet-selection-change', { detail: petId }));
            }
        };

        const handlePetSelectionChange = (event) => {
            if (isMounted) setSelectedPetId(normalizePetId(event.detail));
        };

        const handleStorage = (event) => {
            if (event.key === 'pet_name' && isMounted) {
                setSelectedPetId(normalizePetId(event.newValue));
            }
        };

        loadPet();
        window.addEventListener('virtual-pet-selection-change', handlePetSelectionChange);
        window.addEventListener('storage', handleStorage);

        return () => {
            isMounted = false;
            window.removeEventListener('virtual-pet-selection-change', handlePetSelectionChange);
            window.removeEventListener('storage', handleStorage);
        };
    }, [user?.id]);

    const handlePetSelect = async (petId) => {
        const nextPetId = normalizePetId(petId);
        if (nextPetId === selectedPetId || isSavingPet) return;

        setIsSavingPet(true);
        try {
            if (user?.id) {
                const { error } = await supabase
                    .from('inventory_pet')
                    .update({
                        pet_name: nextPetId,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('user_id', user.id);

                if (error) throw error;
            }

            setSelectedPetId(nextPetId);
            localStorage.setItem('pet_name', nextPetId);
            window.dispatchEvent(new CustomEvent('virtual-pet-selection-change', { detail: nextPetId }));
        } catch (error) {
            console.error('Failed to update pet selection:', error);
        } finally {
            setIsSavingPet(false);
        }
    };

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
                            setShowAccountMenu((current) => {
                                const next = !current;
                                if (next) setAccountMenuView('main');
                                return next;
                            });
                        }}
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
                            width: accountMenuView === 'pets' ? '310px' : '248px',
                            zIndex: 100,
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden'
                        }}>
                            {accountMenuView === 'main' ? (
                                <>
                                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '0.85rem', color: 'var(--text-light)', background: 'var(--bg)' }}>
                                        {user?.email || 'Account Login'}
                                    </div>

                                    {credits !== undefined && (
                                        <button
                                            onClick={() => {
                                                onOpenCredits();
                                                setShowAccountMenu(false);
                                                setAccountMenuView('main');
                                            }}
                                            style={{ padding: '12px 16px', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: 'var(--text)' }}
                                            onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg)'}
                                            onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <rect x="2" y="5" width="20" height="14" rx="2" />
                                                <line x1="2" y1="10" x2="22" y2="10" />
                                            </svg>
                                            Subscription Plan
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => setAccountMenuView('pets')}
                                        style={{ padding: '12px 16px', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', fontSize: '0.9rem', color: 'var(--text)' }}
                                        onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg)'}
                                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span
                                                aria-hidden="true"
                                                style={{
                                                    width: 20,
                                                    height: 22,
                                                    backgroundImage: `url("${selectedPet.spriteSheetUrl}")`,
                                                    backgroundRepeat: 'no-repeat',
                                                    backgroundSize: `${192 * 8 * 0.105}px ${208 * 9 * 0.105}px`,
                                                    backgroundPosition: '0 0',
                                                    imageRendering: 'pixelated',
                                                }}
                                            />
                                            Pet
                                        </span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontSize: '0.82rem', fontWeight: 700 }}>
                                            {selectedPet.label}
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <polyline points="9 18 15 12 9 6"></polyline>
                                            </svg>
                                        </span>
                                    </button>

                                    <button
                                        onClick={() => {
                                            signOut();
                                            setShowAccountMenu(false);
                                            setAccountMenuView('main');
                                        }}
                                        style={{ padding: '12px 16px', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: 'var(--danger)' }}
                                        onMouseOver={(e) => e.currentTarget.style.background = 'var(--danger-light)'}
                                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                                            <polyline points="16 17 21 12 16 7"></polyline>
                                            <line x1="21" y1="12" x2="9" y2="12"></line>
                                        </svg>
                                        Logout
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg)' }}>
                                        <button
                                            type="button"
                                            onClick={() => setAccountMenuView('main')}
                                            style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)', fontSize: '0.9rem', fontWeight: 700 }}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <polyline points="15 18 9 12 15 6"></polyline>
                                            </svg>
                                            Pet
                                        </button>
                                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)' }}>
                                            {selectedPet.label}
                                        </span>
                                    </div>

                                    <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        {PET_OPTIONS.map((pet) => {
                                            const isSelected = pet.id === selectedPetId;
                                            return (
                                                <button
                                                    key={pet.id}
                                                    type="button"
                                                    disabled={isSavingPet}
                                                    onClick={() => handlePetSelect(pet.id)}
                                                    style={{
                                                        minHeight: '74px',
                                                        padding: '8px',
                                                        border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                                                        borderRadius: '8px',
                                                        background: isSelected ? 'rgba(42, 157, 143, 0.08)' : 'var(--surface)',
                                                        color: isSelected ? 'var(--primary)' : 'var(--text)',
                                                        cursor: isSavingPet ? 'wait' : 'pointer',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '4px',
                                                        fontSize: '0.78rem',
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    <span
                                                        aria-hidden="true"
                                                        style={{
                                                            width: 38,
                                                            height: 42,
                                                            backgroundImage: `url("${pet.spriteSheetUrl}")`,
                                                            backgroundRepeat: 'no-repeat',
                                                            backgroundSize: `${192 * 8 * 0.2}px ${208 * 9 * 0.2}px`,
                                                            backgroundPosition: '0 0',
                                                            imageRendering: 'pixelated',
                                                        }}
                                                    />
                                                    {pet.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
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
