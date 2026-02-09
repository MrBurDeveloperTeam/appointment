import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import DataStore from '../data';

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
                const { data: { session: initialSession } } = await supabase.auth.getSession();

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
                    .single();

                if (fetchError) throw fetchError;

                if (mounted) {
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
        try {
            await supabase.auth.signOut();
            // Local storage cleanup
            DataStore.setActiveClinicId(null);
            setActiveClinicId(null);
            localStorage.removeItem('appointmentApp_activeClinic');
            // Clear supabase keys if needed (though signOut handles mostly)
            for (let i = localStorage.length - 1; i >= 0; i -= 1) {
                const key = localStorage.key(i);
                if (key && (key.startsWith('sb-') || key.startsWith('supabase.auth.'))) {
                    localStorage.removeItem(key);
                }
            }
            setSession(null);
            setUser(null);
            setProfile(null);
            setRole(null);
        } catch (err) {
            console.error('Error signing out:', err);
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
