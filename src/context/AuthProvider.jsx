import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { api } from '../services/api';
import DataStore from '../data';
import React from "react";

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
    const [session, setSession] = useState(null);
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [role, setRole] = useState(null);
    const [activeClinicId, setActiveClinicId] = useState(() => DataStore.getActiveClinicId());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // 1. Initialize Session
    useEffect(() => {
        let mounted = true;

        const initializeAuth = async () => {
            try {
                // 1. First, try to exchange SSO session to ensure we have the latest tokens
                try {
                    const { data: sso } = await api.get("/sso/exchange");
                    if (sso?.access_token && sso?.refresh_token) {
                        await supabase.auth.setSession({
                            access_token: sso.access_token,
                            refresh_token: sso.refresh_token,
                        });
                    }
                } catch (ssoErr) {
                    console.error('SSO exchange failed in AuthProvider:', ssoErr);
                    
                    if (ssoErr.status === 401) {
                        console.log('Clearing local auth session due to SSO 401');
                        try {
                            await supabase.auth.signOut();
                        } catch (e) {
                            console.error('Error auto-signing out on 401:', e);
                        }
                        
                        if (mounted) {
                            setSession(null);
                            setUser(null);
                            setProfile(null);
                            setRole(null);
                            DataStore.setActiveClinicId(null);
                            setActiveClinicId(null);
                            setLoading(false);
                        }
                        return; 
                    }
                    // For network errors, we fall back to existing local session
                }

                // 2. Now get the session (either from SSO update or local storage)
                const { data: { session: initialSession } } = await supabase.auth.getSession();

                console.log("initialSession", initialSession);
                if (mounted) {
                    setSession(initialSession);
                    setUser(initialSession?.user ?? null);
                    if (!initialSession) {
                        setLoading(false);
                    }
                }
            } catch (err) {
                console.error('Error checking session:', err);
                if (mounted) setLoading(false);
            }
        };

        initializeAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
            if (mounted) {
                setSession(newSession);
                setUser(newSession?.user ?? null);
                if (!newSession) {
                    setProfile(null);
                    setRole(null);
                    DataStore.setActiveClinicId(null);
                    setActiveClinicId(null);
                    setLoading(false);
                }
            }
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    // 2. Load Profile when User changes
    useEffect(() => {
        let mounted = true;

        const loadProfile = async () => {
            if (!user) return;

            // Keep loading true while fetching profile if we just got a user
            // But if we already have a profile and just switching, maybe not? 
            // safer to generic loading state or specific profile loading state.
            // For global auth "ready", we want to wait for profile.

            try {
                const { data, error: fetchError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (fetchError) throw fetchError;

                if (mounted) {
                    if (!data) {
                        console.warn('No profile found for user:', user.id);
                        setProfile(null);
                        setRole(null);
                        return;
                    }
                    setProfile(data);
                    const derivedRole = data.account_type === 'admin' ? 'admin' : 'dentist';
                    setRole(derivedRole);

                    if (data.clinic_id) {
                        DataStore.setActiveClinicId(data.clinic_id);
                        setActiveClinicId(data.clinic_id);
                    } else {
                        DataStore.setActiveClinicId(null);
                        setActiveClinicId(null);
                    }
                }
            } catch (err) {
                console.error('Failed to load profile:', err);
                if (mounted) {
                    setError('Unable to load your profile. Please try again.');
                    setProfile(null);
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        };

        if (user) {
            // If we have a user but no profile yet (or user changed), load it
            loadProfile();
        }
    }, [user]);

    const signOut = async () => {
        // 1. Best-effort: clear the SSO cookie on the server
        try {
            await api.post('/logout');
        } catch (err) {
            // Expected to fail on localhost (no Cloudflare worker running)
            console.warn('Backend /logout failed (ok on localhost):', err?.message);
        }

        // 2. Always clear Supabase session (works locally too)
        try {
            await supabase.auth.signOut();

            // 3. Wipe localStorage
            DataStore.setActiveClinicId(null);
            setActiveClinicId(null);
            localStorage.removeItem('appointmentApp_activeClinic');
            for (let i = localStorage.length - 1; i >= 0; i -= 1) {
                const key = localStorage.key(i);
                if (key && (key.startsWith('sb-') || key.startsWith('supabase.auth.'))) {
                    localStorage.removeItem(key);
                }
            }

            // 4. Clear React state
            setSession(null);
            setUser(null);
            setProfile(null);
            setRole(null);

            if (window.opener && !window.opener.closed) {
                window.opener.postMessage(
                    { type: 'SSO_LOGOUT', source: 'miniapp' },
                    'https://app.snabbb.com'
                );
            }
        } catch (err) {
            console.error('Error signing out of Supabase:', err);
        } finally {
            window.location.href = 'https://app.snabbb.com';
        }
    };

    const value = {
        session,
        user,
        profile,
        role,
        activeClinicId,
        loading,
        error,
        signOut,
        isAdmin: role === 'admin',
        isAuthenticated: !!user && !!profile
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
