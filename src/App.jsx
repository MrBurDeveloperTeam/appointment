import { useCallback, useEffect, useState } from 'react';
import React from 'react';
import useDataStore from './hooks/useDataStore';
import { useAuth } from './context/AuthProvider';
import { ToastProvider, useToast } from './context/ToastProvider';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import CalendarView from './components/CalendarView';
import TodayView from './components/TodayView';
import PatientsView from './components/PatientsView';
import SettingsView from './components/SettingsView';
import ReportsView from './components/ReportsView';
import ActivityView from './components/ActivityView';
import RequestsView from './components/RequestsView';
import AppointmentForm from './components/AppointmentForm';
import PatientModal from './components/PatientModal';
import LoginView from './components/LoginView';
import LoginPage from './components/auth/LoginPage';
import RegisterPage from './components/auth/RegisterPage';
import AdminDashboard from './components/AdminDashboard';
import PublicBookingView from './components/PublicBookingView';
import ConfirmDialog from './components/ConfirmDialog';
import CreditModal from './components/CreditModal';
import { todayISO } from './utils/date';
import { startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { supabase } from './lib/supabaseClient';
import DataStore from "./data";
import { api } from './services/api';
import CatMascot from './components/CatMascot';
import AppointmentsVirtualPet from './petExperience/AppointmentsVirtualPet';
import MolarAIFloat from './components/MolarAIFloat';
import {
  normalizeTheme,
  readStoredTheme,
  readThemeCookie,
  writeThemeCookie,
  writeStoredTheme,
  applyThemeToDocument,
  broadcastTheme,
  syncThemeFromOdoo,
  pushThemeToOdoo,
  THEME_SYNC,
} from './utils/themeSync';
import { useGetUserId } from './mutation/useGetUserId';
import useGetSessionInfo from './hooks/useGetSessionInfo';
import { useAppointmentPersonalizedInsight } from './aiExperience/hooks/useAppointmentPersonalizedInsight';
import { isTodayCoveredByDateRange } from './aiExperience/utils/appointmentCoverage';

const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getLocalTimeString = (date = new Date()) => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${hours}:${minutes}`;
};

const isAppointmentRequestExpired = (
  request,
  now = new Date()
) => {
  const requestDate =
    request.appointmentDate ||
    request.preferredDates?.[0] ||
    '';

  const requestTime =
    request.appointmentStartTime ||
    request.preferredTimes?.[0] ||
    '';

  if (!requestDate) return false;

  const today = getLocalDateString(now);

  if (requestDate < today) return true;
  if (requestDate > today) return false;
  if (!requestTime) return false;

  const normalizedRequestTime =
    String(requestTime).slice(0, 5);

  return normalizedRequestTime <=
    getLocalTimeString(now);
};

const getBookingSlugFromPath = () => {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts[0] === 'book' && parts[1]) return parts[1];
  return null;
};

export default function App() {

  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

function AppContent() {
  const { mutateAsync: createAppLink, isPending } = useGetUserId();
  const { addToast } = useToast();
  const { mutateAsync: getSessionInfo } = useGetSessionInfo();

  const [exchangeDone, setExchangeDone] = useState(false);

  useEffect(() => {
    setExchangeDone(true);
  }, []);

  const {
    session,
    user,
    profile,
    role: authRole,
    activeClinicId,
    loading: authLoading,
    error: authError,
    signOut
  } = useAuth();

  // ─── Theme — hybrid: cookie (instant) + Odoo (cross-device) ─────────────────
  // Initial value comes from cookie/localStorage synchronously (no flash).
  // Background Odoo fetch runs after mount to apply cross-device preference.
  const [theme, setTheme] = useState(() => readStoredTheme() || 'light');

  useEffect(() => {
    DataStore.clearLegacyLocalData();
  }, []);

  // Apply theme to DOM whenever it changes
  useEffect(() => {
    const normalized = normalizeTheme(theme) || 'light';
    applyThemeToDocument(normalized);
  }, [theme]);

  // Background Odoo sync on first mount — cross-device source of truth
  useEffect(() => {
    syncThemeFromOdoo((odooTheme) => {
      // Only fires if Odoo returned a DIFFERENT theme than the cookie
      setTheme((current) => (current === odooTheme ? current : odooTheme));
    });
  }, []);

  // Live sync: storage events (same-origin tabs) + cookie poll (cross-subdomain)
  useEffect(() => {
    const handleStorageSync = (event) => {
      if (event.key !== THEME_SYNC.localStorageKey && event.key !== 'snabbb-theme') return;
      const next = normalizeTheme(event.newValue);
      if (next) setTheme((cur) => (cur === next ? cur : next));
    };

    const handleMessageSync = (event) => {
      const data = event.data;
      if (!data || data.type !== THEME_SYNC.messageType) return;
      if (data.source === 'appointment') return; // ignore own broadcasts
      const next = normalizeTheme(data.theme);
      if (next) setTheme((cur) => (cur === next ? cur : next));
    };

    const handleSystemThemeChange = () => {
      setTheme((cur) => {
        if (cur === 'system') applyThemeToDocument('system');
        return cur;
      });
    };

    // 1s cookie poll — catches theme changes from other subdomains (e.g. app.snabbb.com)
    let lastCookie = readThemeCookie();
    const cookieInterval = window.setInterval(() => {
      const current = readThemeCookie();
      if (current && current !== lastCookie) {
        lastCookie = current;
        setTheme((cur) => (cur === current ? cur : current));
      }
    }, 1000);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    window.addEventListener('storage', handleStorageSync);
    window.addEventListener('message', handleMessageSync);
    mediaQuery.addEventListener?.('change', handleSystemThemeChange);
    mediaQuery.addListener?.(handleSystemThemeChange);

    return () => {
      window.removeEventListener('storage', handleStorageSync);
      window.removeEventListener('message', handleMessageSync);
      mediaQuery.removeEventListener?.('change', handleSystemThemeChange);
      mediaQuery.removeListener?.(handleSystemThemeChange);
      window.clearInterval(cookieInterval);
    };
  }, []);

  // Called by UI (Sidebar, SettingsView, AdminDashboard) when user picks a theme.
  // Writes cookie immediately + pushes to Odoo in background.
  const handleSetTheme = (newTheme) => {
    const normalized = normalizeTheme(newTheme) || 'light';
    setTheme(normalized);
    writeThemeCookie(normalized);
    writeStoredTheme(normalized);
    broadcastTheme(normalized);
    pushThemeToOdoo(normalized); // fire and forget
  };

  const [bookingLink, setBookingLink] = useState('');

  // Responsive Sidebar State
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggleSidebar = () => setSidebarOpen(prev => !prev);
  const closeSidebar = () => setSidebarOpen(false);

  useEffect(() => {
    if (!activeClinicId) {
      setBookingLink('');
      return;
    }
    let isActive = true;
    const loadClinicSlug = async () => {
      try {
        const data = await DataStore.getClinicById(activeClinicId);
        if (!isActive) return;
        if (!data?.slug) {
          setBookingLink('');
          return;
        }
        setBookingLink(`${window.location.origin}/book/${data.slug}`);
      } catch (error) {
        if (!isActive) return;
        console.error('Failed to load clinic slug:', error);
        setBookingLink('');
      }
    };
    loadClinicSlug();
    return () => {
      isActive = false;
    };
  }, [activeClinicId]);

  const dataEnabled = Boolean(!!user && authRole !== 'admin' && activeClinicId);

  // Original single-file state wiring preserved, now split into modules.
  const {
    patients,
    appointments,
    rooms,
    dateRange,
    treatments,
    settings,
    activity,
    staff,
    holidays,
    appointmentRequests,
    activeClinicData,
    isReady,
    addPatient,
    updatePatient,
    deletePatient,
    addAppointment,
    updateAppointment,
    deleteAppointment,
    saveSettings,
    addRoom,
    updateRoom,
    deleteRoom,
    addTreatment,
    updateTreatment,
    deleteTreatment,
    addStaff,
    updateStaff,
    deleteStaff,
    saveHolidays,
    addHoliday,
    updateHoliday,
    deleteHoliday,
    clearAll,
    updateAppointmentRequest,
    refreshRequests,
    setDateRange,
    searchPatients,
    credits,
    creditHistory,
    addCredits,
    appointmentDataStatus,
    loadedAppointmentRange,
  } = useDataStore(activeClinicId, dataEnabled);

  const [view, setView] = useState('calendar');
  // Phase-2A: Appointment Within 2 Hours, Daily Summary (today's count +
  // room-in-use), No Appointments Today. Pure, synchronous, reevaluates
  // whenever `appointments`/`rooms`/`dateRange` (already owned above via
  // useDataStore) change or the local minute clock ticks — no new
  // Supabase query, no dedupe, no polling of the database. See
  // ./aiExperience/hooks/useAppointmentPersonalizedInsight.ts.
  const { candidates: appointmentDialoguePool } =
    useAppointmentPersonalizedInsight(appointments, rooms, dateRange);
  // Takes the candidate to act on explicitly — invoked by CatMascot with
  // whichever candidate it is currently showing (its own dismissal-aware
  // scan over `appointmentDialoguePool` below). Every current candidate's
  // action is the same "Today" behavior regardless of which one is
  // passed, but the binding is implemented explicitly rather than relying
  // on that coincidence — see personalizedInsightState.onAction's doc
  // below.
  const handleAppointmentInsightAction = useCallback((candidate) => {
    // Reuses CalendarView.jsx's exact existing "Today" button behavior —
    // never a fabricated navigation.
    if (candidate?.action) setCurrentDate(new Date());
  }, []);
  // Proactive Cat reminder readiness: reuses the SAME authoritative signals
  // already piped to MolarAIFloat for Phase-3 Data Chat's own readiness
  // gate (see resolveAppointmentDataQuery.ts's identical
  // `appointmentDataStatus !== 'ready'` + `isTodayCoveredByDateRange`
  // check) — not a new query, not a new readiness flag. `loadedAppointmentRange`
  // is the SUCCESSFULLY LOADED range (not the currently-requested
  // `dateRange`), so a calendar-range change in flight never authorizes a
  // Personalized reminder against stale prior data before the new fetch
  // actually completes. CatMascot is a direct child of THIS component (not
  // reached through a separate layout/Home file), so this is passed as a
  // plain prop rather than through a Context bridge — a Provider rendered
  // inside this same component's own return couldn't supply a context
  // value back to this component's own hook calls above the return
  // statement, so Context would not actually work for this specific tree;
  // see CatMascot.jsx for how the equivalent read-only contract is
  // preserved via props instead.
  const personalizedInsightState =
    appointmentDataStatus === 'ready' && isTodayCoveredByDateRange(loadedAppointmentRange)
      ? {
          status: 'ready',
          // Ordered pool across Appointment Soon > Daily Summary > None
          // Today — see useAppointmentPersonalizedInsight.ts /
          // buildAppointmentDialoguePool.ts. CatMascot scans this via
          // selectFirstEligibleDialogueCandidate.
          candidates: appointmentDialoguePool,
          // Takes the candidate to act on explicitly (see
          // handleAppointmentInsightAction above) so CatMascot always
          // executes the action belonging to the exact candidate it is
          // currently showing.
          onAction: handleAppointmentInsightAction,
        }
      : { status: 'not_ready' };
  const [currentDate, setCurrentDate] = useState(new Date());

  // Sync date range for appointments
  useEffect(() => {
    if (!setDateRange) return;
    // Fetch current month + previous + next to allow smooth navigation
    const start = startOfMonth(subMonths(currentDate, 1));
    const end = endOfMonth(addMonths(currentDate, 1));

    setDateRange({
      start: start.toISOString(),
      end: end.toISOString(),
    });
  }, [currentDate, setDateRange]);
  const [calendarView, setCalendarView] = useState('month');
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState(null);
  const [appointmentDefaults, setAppointmentDefaults] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, type: '', payload: null });
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [isVirtualPetOpen, setIsVirtualPetOpen] = useState(false);
  const bookingSlug = getBookingSlugFromPath();
  const [authInitializing, setAuthInitializing] = useState(true);

  // Check what is missing
  const missingSettings = !settings?.workingHours?.start;
  const missingStaff = staff.length === 0;
  const missingRooms = rooms.length === 0;
  const missingTreatments = treatments.length === 0;

  // Check if unconfigured
  const isUnconfigured = isReady && user && activeClinicId && (
    missingSettings || missingStaff || missingRooms || missingTreatments
  );

  // Count of pending appointment requests for the sidebar badge
  const pendingRequestsCount =
    appointmentRequests.filter(
      (request) =>
        request.status === 'pending' &&
        !isAppointmentRequestExpired(request)
    ).length;

  // Check if subscription is expired
  const isExpired = React.useMemo(() => {
    if (!activeClinicData?.subscriptionEnd) return false;
    const end = new Date(activeClinicData.subscriptionEnd);
    end.setHours(23, 59, 59, 999);
    return new Date() > end;
  }, [activeClinicData]);

  const viewTitle = {
    calendar: 'Calendar',
    today: 'Today',
    patients: 'Patients',
    settings: 'Settings',
    reports: 'Reports',
    activity: 'Activity Log',
    requests: 'Requests',
  }[view];

  // Force configuration of settings for new clinics
  useEffect(() => {
    let timeoutId;
    // Ensure data is ready, the user is active, we are not already on the settings view,
    // and they have an active clinic assigned.
    if (isReady && user && activeClinicId && view !== 'settings') {
      if (isUnconfigured) {
        setView('settings');
        
        // Build dynamic warning message
        const missing = [];
        if (missingSettings) missing.push("working hours");
        if (missingStaff) missing.push("1 staff");
        if (missingRooms) missing.push("1 room");
        if (missingTreatments) missing.push("1 treatment");

        const message = `Please configure: ${missing.join(', ')} to get started.`;

        // Small delay to ensure the ToastProvider is mounted and ready
        timeoutId = setTimeout(() => {
          addToast(message, 'warning');
        }, 500);
      }
    }
    return () => clearTimeout(timeoutId);
  }, [
    isReady, 
    isUnconfigured, 
    missingSettings, 
    missingStaff, 
    missingRooms, 
    missingTreatments, 
    user, 
    activeClinicId, 
    view, 
    addToast
  ]);

  // Build real-time context for Molar AI
  const aiContext = React.useMemo(() => {
    if (!isReady || !user) return "";
    const lines = [];
    lines.push(`# SNAI SYSTEM CONTEXT: SNABBB APPOINTMENT`);
    lines.push(`## Operational Profile`);
    lines.push(`- **User**: ${profile?.name || user?.email} (UID: ${user.id})`);
    lines.push(`- **Role**: ${authRole || 'Provider'}`);
    lines.push(`- **Clinic**: ${activeClinicData?.name || 'Snabbb Dental'} (ID: ${activeClinicId})`);
    if (activeClinicData?.subscriptionEnd) {
      lines.push(`- **License Status**: Active (Expires ${new Date(activeClinicData.subscriptionEnd).toLocaleDateString()})`);
    }
    
    if (isUnconfigured) {
      lines.push(`\n## CONFIGURATION ALERT: PENDING`);
      if (missingSettings) lines.push("- ACTION REQUIRED: Working hours not set.");
      if (missingStaff) lines.push("- ACTION REQUIRED: No staff members registered.");
      if (missingRooms) lines.push("- ACTION REQUIRED: No treatment rooms defined.");
      if (missingTreatments) lines.push("- ACTION REQUIRED: Services/Treatments list is empty.");
    }

    if (staff?.length > 0) {
      lines.push(`\n## Clinic Staff (${staff.length})`);
      staff.forEach(s => lines.push(`- [ID: ${s.id}] **${s.name}** (${s.role || 'dentist'})`));
    }

    if (treatments?.length > 0) {
      lines.push(`\n## Service Menu/Treatments (${treatments.length})`);
      treatments.forEach(t => {
        lines.push(`- [ID: ${t.id}] **${t.name}**: $${t.price} (${t.duration}m)`);
      });
    }

    if (patients?.length > 0) {
      lines.push(`\n## Patient Directory (${patients.length})`);
      // Show first 100 patients to ensure context window remains performant
      const patientList = patients.slice(0, 100);
      patientList.forEach(p => {
        lines.push(`- [ID: ${p.id}] **${p.name}** ${p.phone ? `| ${p.phone}` : ''}${p.email ? ` | ${p.email}` : ''}`);
      });
      if (patients.length > 100) lines.push(`- ...and ${patients.length - 100} more patients.`);
    }

    // --- Performance & Monthly Reports ---
    const nowMonth = new Date();
    const currentMonthStr = nowMonth.toISOString().slice(0, 7);
    const monthApts = appointments?.filter(a => a.date?.startsWith(currentMonthStr)) || [];
    
    lines.push(`\n## Monthly Operational Report (${nowMonth.toLocaleString('default', { month: 'long', year: 'numeric' })})`);
    lines.push(`- **Current Month Appointments**: ${monthApts.length}`);
    lines.push(`- **Completed Visits**: ${monthApts.filter(a => a.status === 'completed').length}`);
    lines.push(`- **Growth**: ${patients.filter(p => p.createdAt?.startsWith(currentMonthStr)).length} new patients registered this month`);
    
    // Dentist Performance
    const dentists = staff?.filter(s => s.role === 'dentist') || [];
    const dayNamesShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (dentists.length > 0) {
      lines.push(`\n### Dentist Performance & Schedule (Current Month)`);
      dentists.forEach(d => {
        const dApts = monthApts.filter(a => a.dentistId === d.id);
        const uniquePts = new Set(dApts.map(a => a.patientId)).size;
        const workingDays = (d.workingDays || []).map(idx => dayNamesShort[idx]).join(', ');
        lines.push(`- **${d.name}**: ${dApts.length} appointments | ${uniquePts} unique patients | Days: ${workingDays || 'Not set'}`);
      });
    }

    // Nurse Hours
    const nurses = staff?.filter(s => s.role === 'nurse') || [];
    if (nurses.length > 0) {
      lines.push(`\n### Nurse Working Hours`);
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      nurses.forEach(n => {
        const workingDays = n.workingDays || [];
        const workingDayNames = workingDays.map(d => dayNames[d]).join(', ');
        const [sh, sm] = (n.startTime || '09:00').split(':').map(Number);
        const [eh, em] = (n.endTime || '18:00').split(':').map(Number);
        const daily = Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
        const total = Math.round(daily * workingDays.length * 4 * 10) / 10;
        lines.push(`- **${n.name}**: ${daily}h/day | Days: ${workingDayNames} | Est. ${total}h/month`);
      });
    }

    // Treatment Stats
    if (monthApts.length > 0) {
      lines.push(`\n### Treatment Procedure Breakdown`);
      const tStats = {};
      monthApts.forEach(a => {
        const tId = a.treatmentId;
        if (tId) tStats[tId] = (tStats[tId] || 0) + 1;
      });
      Object.entries(tStats).forEach(([id, count]) => {
        const trt = treatments.find(t => t.id === id)?.name || 'General';
        lines.push(`- **${trt}**: ${count} procedures`);
      });
    }

    if (appointments?.length > 0 || appointmentRequests?.length > 0) {
      lines.push(`\n## Appointment & Request Records`);
      
      const allReqs = appointmentRequests || [];
      const pendingReqs = allReqs.filter(r => r.status === 'pending');
      const acceptedReqs = allReqs.filter(r => r.status === 'accepted');
      const declinedReqs = allReqs.filter(r => r.status === 'declined');

      lines.push(`- **Request Summary**: Total: ${allReqs.length} | Pending: ${pendingReqs.length} | Accepted: ${acceptedReqs.length} | Declined: ${declinedReqs.length}`);
      
      if (pendingReqs.length > 0) {
        lines.push(`\n### Pending Patient Submissions (${pendingReqs.length})`);
        pendingReqs.slice(0, 5).forEach(r => {
          const trtName = treatments?.find(t => t.id === r.appointmentTreatmentId)?.name || 'General Treatment';
          lines.push(`- PENDING: **${r.patientName}** requested **${trtName}** for **${r.appointmentDate}** @ **${r.appointmentStartTime}**`);
        });
      }

      if (acceptedReqs.length > 0 || declinedReqs.length > 0) {
        lines.push(`\n### Recently Reviewed Requests`);
        allReqs.filter(r => r.status !== 'pending').slice(0, 5).forEach(r => {
          lines.push(`- ${r.status.toUpperCase()}: **${r.patientName}** (${r.appointmentDate})`);
        });
      }

      if (appointments?.length > 0) {
        lines.push(`\n### Confirmed Schedule (30-Day Window)`);
        
        // Sort and slice a broader range of appointments (Upcoming & Recent Past)
        const now = new Date();
        const sortedApts = [...appointments].sort((a, b) => new Date(a.date) - new Date(b.date));
        const relevantApts = sortedApts.filter(a => {
          const aptDate = new Date(a.date);
          const diffDays = Math.abs(aptDate - now) / (1000 * 60 * 60 * 24);
          return diffDays <= 30; // Show appointments within 30 days window
        }).slice(0, 40);

        relevantApts.forEach(a => {
          const pt = patients?.find(p => p.id === a.patientId)?.name || 'Unknown Patient';
          const trt = treatments?.find(t => t.id === a.treatmentId)?.name || 'Procedure';
          const dr = staff?.find(s => s.id === a.dentistId)?.name || 'Staff';
          lines.push(`- ${a.date} @ ${a.startTime}: **${pt}** for **${trt}** with **${dr}** (Status: ${a.status || 'Active'})`);
        });
      }
    }

    if (activity?.length > 0) {
      lines.push(`\n## System Logs (Latest Activity)`);
      activity.slice(0, 8).forEach(act => {
        lines.push(`- [${new Date(act.created_at).toLocaleTimeString()}] **${act.action}**: ${act.details}`);
      });
    }

    return lines.join("\n");
  }, [isReady, user, profile, authRole, activeClinicId, activeClinicData, isUnconfigured, missingSettings, missingStaff, missingRooms, missingTreatments, appointments, appointmentRequests, staff, patients, treatments, activity]);

  // Expose handlers to Molar AI
  useEffect(() => {
    window.__MOLAR_ACTIONS__ = {
      addAppointment,
      updateAppointment,
      addStaff,
      addRoom,
      addTreatment,
      addHoliday,
      addPatient,
    };
    return () => { delete window.__MOLAR_ACTIONS__; };
  }, [addAppointment, updateAppointment, addStaff, addRoom, addTreatment, addHoliday, addPatient]);

  const handleSaveAppointment = (data) => {
    if (data.id) {
      return updateAppointment(data.id, data).then(() => {
        setShowAppointmentModal(false);
        setAppointmentDefaults(null);
      });
    } else {
      // Logic is now inside useDataStore.addAppointment
      return addAppointment(data)
        .then(() => {
          setShowAppointmentModal(false);
          setAppointmentDefaults(null);
        })
        .catch((err) => {
          // If we want to show the specific error (like "Insufficient credits"), re-throw or handle here
          addToast(err.message || "Failed to create appointment", 'error');
          // Important: re-throw so form knows it failed!
          throw err;
        });
    }
  };

  const handleDeleteAppointment = (data) => {
    if (!data || !data.id) return;
    setConfirmDialog({
      open: true,
      type: 'appointment',
      payload: data,
    });
  };

  const handleSavePatient = (data) => {
    if (editingPatient) {
      updatePatient(editingPatient.id, data);
    } else {
      addPatient(data);
    }
    setShowPatientModal(false);
    setEditingPatient(null);
  };

  const handleDeletePatient = () => {
    if (!editingPatient) return;
    const hasAppointments = appointments.some((a) => String(a.patientId) === String(editingPatient.id));
    if (hasAppointments) {
      addToast('Cannot delete: patient has appointments', 'warning');
      return;
    }
    setConfirmDialog({
      open: true,
      type: 'patient',
      payload: editingPatient,
    });
  };

  const handleConfirmDelete = () => {
    if (confirmDialog.type === 'appointment' && confirmDialog.payload?.id) {
      deleteAppointment(confirmDialog.payload.id);
      setShowAppointmentModal(false);
      setAppointmentDefaults(null);
    }
    if (confirmDialog.type === 'patient' && confirmDialog.payload?.id) {
      deletePatient(confirmDialog.payload.id);
      setShowPatientModal(false);
      setEditingPatient(null);
    }
    setConfirmDialog({ open: false, type: '', payload: null });
  };

  const openNewAppointment = (date, startTime, dentistId) => {
    const defaults = {
      date: date || todayISO(),
      startTime: startTime || '09:00',
    };
    if (typeof dentistId !== 'undefined') {
      defaults.dentistId = dentistId;
    }
    setAppointmentDefaults(defaults);
    setShowAppointmentModal(true);
  };

  const handleAppointmentClick = (apt) => {
    setAppointmentDefaults(apt);
    setShowAppointmentModal(true);
  };

  const handleRescheduleAppointment = (appointment, updates) => {
    if (!appointment || !appointment.id) return;
    updateAppointment(appointment.id, updates);
  };

  if (!exchangeDone) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f8fafc",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              border: "4px solid #4f46e5",
              borderTop: "4px solid transparent",
              borderRadius: "9999px",
              animation: "spin 1s linear infinite",
            }}
          />
          <div
            style={{
              color: "#334155",
              fontWeight: 500,
            }}
          >
            Checking session...
          </div>
        </div>
      </div>
    );
  }

  if (bookingSlug) {
    return <PublicBookingView clinicSlug={bookingSlug} />;
  }

  if (authLoading) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1 className="login-title">Loading your account…</h1>
          <p className="login-subtitle">Please wait while we verify your session.</p>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1 className="login-title">Something went wrong</h1>
          <p className="login-subtitle">{authError}</p>
          <button className="btn btn-secondary" onClick={signOut}>
            Logout
          </button>
        </div>
      </div>
    );
  }

  if (user && !isReady && authRole !== 'admin' && activeClinicId) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1 className="login-title">Loading your clinic…</h1>
          <p className="login-subtitle">We are fetching your appointments and settings.</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (window.location.pathname === '/login') return <LoginPage />;
    if (window.location.pathname === '/register') return <RegisterPage />;
    return <LoginView />;
  }

  if (authRole === 'admin') {
    return (
      <AdminDashboard onLogout={signOut} theme={theme} setTheme={handleSetTheme} />
    );
  }

  if (!activeClinicId) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1 className="login-title">Clinic access pending</h1>
          <p className="login-subtitle">An admin needs to assign you to a clinic before you can access the app.</p>
          <button className="btn btn-secondary" onClick={signOut}>
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Sidebar
        view={view}
        onChange={(newView) => {
          if (isUnconfigured && newView !== 'settings') {
            const missing = [];
            if (missingSettings) missing.push("working hours");
            if (missingStaff) missing.push("1 staff");
            if (missingRooms) missing.push("1 room");
            if (missingTreatments) missing.push("1 treatment");
            addToast(`Please configure: ${missing.join(', ')} first.`, 'warning');
            return;
          }
          setView(newView);
          closeSidebar(); // Close sidebar on mobile when navigating
        }}
        theme={theme}
        setTheme={handleSetTheme}
        onLogout={signOut}
        bookingLink={bookingLink}
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        isUnconfigured={isUnconfigured}
        pendingRequestsCount={pendingRequestsCount}
      />
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={closeSidebar}
        />
      )}
      <main className="main-content">
        <Header
          createAppLink={createAppLink}
          title={viewTitle}
          onNewAppointment={() => { setAppointmentDefaults(null); setShowAppointmentModal(true); }}
          onToggleSidebar={toggleSidebar}
          isSidebarOpen={sidebarOpen}
          credits={credits}
          onOpenCredits={() => setShowCreditModal(true)}
          isUnconfigured={isUnconfigured}
        />
        <div className="content">
          {view === 'calendar' && (
            <>
              <CalendarView
                currentDate={currentDate}
                setCurrentDate={setCurrentDate}
                calendarView={calendarView}
                setCalendarView={setCalendarView}
                appointments={appointments}
                patients={patients}
                rooms={rooms}
                treatments={treatments}
                staff={staff}
                holidays={holidays}
                settings={settings}
                onSlotSelect={(date, time) => openNewAppointment(date, time)}
                onAppointmentSelect={handleAppointmentClick}
                onAppointmentReschedule={handleRescheduleAppointment}
              />
            </>
          )}
          {view === 'today' && (
            <TodayView
              appointments={appointments}
              patients={patients}
              rooms={rooms}
              treatments={treatments}
              onAppointmentSelect={handleAppointmentClick}
              onNewAppointment={() => { setAppointmentDefaults(null); setShowAppointmentModal(true); }}
            />
          )}
          {view === 'patients' && (
            <PatientsView
              patients={patients}
              appointments={appointments}
              dentists={staff.filter((s) => s.role === 'dentist')}
              treatments={treatments}
              onNew={() => {
                setEditingPatient(null);
                setShowPatientModal(true);
              }}
              onEdit={(p) => {
                setEditingPatient(p);
                setShowPatientModal(true);
              }}
            />
          )}
          {view === 'settings' && (
            <SettingsView
              settings={settings}
              rooms={rooms}
              treatments={treatments}
              staff={staff}
              holidays={holidays}
              saveSettings={saveSettings}
              addRoom={addRoom}
              updateRoom={updateRoom}
              deleteRoom={deleteRoom}
              addTreatment={addTreatment}
              updateTreatment={updateTreatment}
              deleteTreatment={deleteTreatment}
              addStaff={addStaff}
              updateStaff={updateStaff}
              deleteStaff={deleteStaff}
              saveHolidays={saveHolidays}
              addHoliday={addHoliday}
              updateHoliday={updateHoliday}
              deleteHoliday={deleteHoliday}
              clearAll={clearAll}
              onLogout={signOut}
              theme={theme}
              setTheme={handleSetTheme}
            />
          )}
          {view === 'reports' && (
            <ReportsView appointments={appointments} patients={patients} treatments={treatments} staff={staff} />
          )}
          {view === 'activity' && <ActivityView activity={activity} />}
          {view === 'requests' && (
            <RequestsView
              appointmentRequests={appointmentRequests}
              patients={patients}
              treatments={treatments}
              settings={settings}
              appointments={appointments}
              addPatient={addPatient}
              addAppointment={addAppointment}
              updateAppointmentRequest={updateAppointmentRequest}
              refreshRequests={refreshRequests}
            />
          )}
        </div>
      </main>

      {showAppointmentModal && (
        <AppointmentForm
          patients={patients}
          rooms={rooms}
          treatments={treatments}
          dentists={staff.filter((s) => s.role === 'dentist')}
          appointments={appointments}
          settings={settings}
          initialData={appointmentDefaults}
          onSave={handleSaveAppointment}
          onDelete={handleDeleteAppointment}
          searchPatients={searchPatients}
          credits={credits}
          onClose={() => {
            setShowAppointmentModal(false);
            setAppointmentDefaults(null);
          }}
        />
      )}

      {showPatientModal && (
        <PatientModal
          patient={editingPatient}
          dentists={staff.filter((s) => s.role === 'dentist')}
          onSave={handleSavePatient}
          onDelete={handleDeletePatient}
          onClose={() => {
            setShowPatientModal(false);
            setEditingPatient(null);
          }}
        />
      )}


      {(showCreditModal || isExpired) && (
        <CreditModal
          credits={credits}
          history={creditHistory}
          loading={isRedeeming}
          subscriptionEnd={activeClinicData?.subscriptionEnd}
          disableClose={isExpired}
          onClose={() => setShowCreditModal(false)}
          onRedeem={async (code) => {
            setIsRedeeming(true);
            try {
              if (code === 'DEMO10') {
                await addCredits(10, 'Voucher Redemption: DEMO10');
                addToast('Start up credits added!', 'success');
              } else {
                await new Promise(r => setTimeout(r, 500)); // Fake delay for error too
                addToast('Invalid code. Try DEMO10.', 'error');
              }
            } finally {
              setIsRedeeming(false);
            }
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.type === 'patient' ? 'Delete patient' : 'Delete appointment'}
        description={
          confirmDialog.type === 'patient'
            ? 'This will permanently remove the patient record. This action cannot be undone.'
            : 'This will permanently remove the appointment from the schedule.'
        }
        confirmLabel={confirmDialog.type === 'patient' ? 'Delete patient' : 'Delete appointment'}
        confirmVariant="danger"
        onClose={() => setConfirmDialog({ open: false, type: '', payload: null })}
        onConfirm={handleConfirmDelete}
      />

      {/* 🐱 MOLAR ECOSYSTEM */}
      {/* APPOINTMENTS-2: `key` on CatMascot forces a fresh mount (and
          therefore a fresh useSharedCatDialogueRuntime instance) on every
          distinct authenticated identity boundary — this JSX only ever
          renders once `user` is confirmed non-null (see the `!user` ->
          LoginView early-return above), so `user.id` is always the real
          canonical Supabase Auth uuid here, never "still resolving".
          `catCacheOwnerId` account-scopes CatMascot's own ambient
          presentation cache (sleep/mood/selected-pet) so a fresh mount for
          a different signed-in user never reads a previous user's bare
          localStorage values — same canonical identity as `key`, threaded
          in synchronously as a prop so even the very first render's lazy
          useState initializers read the right namespace. The permanent-
          mount `hidden`/`contents` wrapper below is unchanged — Cat still
          never unmounts merely because Virtual Pet opens/closes. */}
      <div className={isVirtualPetOpen ? 'hidden' : 'contents'}>
        <CatMascot
          key={user.id}
          onCatClick={() => setIsVirtualPetOpen(true)}
          personalizedInsightState={personalizedInsightState}
          catCacheOwnerId={user.id}
        />
        <MolarAIFloat
          userContext={aiContext}
          disabled={!isReady || !user || !activeClinicId}
          onPetToggle={() => setIsVirtualPetOpen(true)}
          appointments={appointments}
          rooms={rooms}
          appointmentDataStatus={appointmentDataStatus}
          loadedAppointmentRange={loadedAppointmentRange}
          patients={patients}
          staff={staff}
          treatments={treatments}
        />
      </div>
      {/* APPOINTMENTS-2: `key` forces a fresh Pet runtime mount on every
          distinct canonical identity boundary — mirroring CatMascot's own
          `key={user.id}` above. `userId` is now host-supplied (see
          AppointmentsVirtualPet.tsx), never independently re-resolved by
          the component itself. */}
      <AppointmentsVirtualPet
        key={user.id}
        isOpen={isVirtualPetOpen}
        onClose={() => setIsVirtualPetOpen(false)}
        userId={user.id}
      />

    </div>
  );
}
