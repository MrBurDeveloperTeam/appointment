import { useEffect, useState } from 'react';
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
import AdminDashboard from './components/AdminDashboard';
import PublicBookingView from './components/PublicBookingView';
import ConfirmDialog from './components/ConfirmDialog';
import CreditModal from './components/CreditModal';
import { todayISO } from './utils/date';
import { startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { supabase } from './lib/supabaseClient';
import DataStore from "./data";
import { api } from './services/api';
import { useSsoExchange } from './mutation/useSsoExchange';

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
  const { mutateAsync: exchangeSso } = useSsoExchange();
  const [exchangeDone, setExchangeDone] = useState(false);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const sso = await exchangeSso();
      await supabase.auth.setSession({
        access_token: sso.access_token,
        refresh_token: sso.refresh_token
      });
    } catch (err) {
      await supabase.auth.signOut();
      console.error('SSO exchange failed:', err);
    }
  };
  const { addToast } = useToast();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // If your /sso/exchange sometimes returns 401 when no cookie,
        // that's fine — we still mark exchangeDone = true at the end.
        const sso = await exchangeSso();

        if (cancelled) return;

        // If API returns { access_token, refresh_token }
        if (sso?.access_token && sso?.refresh_token) {
          await supabase.auth.setSession({
            access_token: sso.access_token,
            refresh_token: sso.refresh_token,
          });
        } else {
          // Optional: if exchange returns nothing, just ensure signed out
          await supabase.auth.signOut();
        }
      } catch (err) {
        // If exchange fails, ensure clean state then proceed to login
        await supabase.auth.signOut();
        console.error("SSO exchange failed:", err);
      } finally {
        if (!cancelled) setExchangeDone(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [exchangeSso]);

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

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'light';
  });

  useEffect(() => {
    DataStore.clearLegacyLocalData();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

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
  } = useDataStore(activeClinicId, dataEnabled);

  const [view, setView] = useState('calendar');
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
    return <LoginView />;
  }

  if (authRole === 'admin') {
    return (
      <AdminDashboard onLogout={signOut} theme={theme} setTheme={setTheme} />
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
        setTheme={setTheme}
        onLogout={signOut}
        bookingLink={bookingLink}
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        isUnconfigured={isUnconfigured}
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
          title={viewTitle}
          onNewAppointment={() => setShowAppointmentModal(true)}
          onToggleSidebar={toggleSidebar}
          isSidebarOpen={sidebarOpen}
          credits={credits}
          onOpenCredits={() => setShowCreditModal(true)}
          isUnconfigured={isUnconfigured}
        />
        <div className="content">
          {view === 'calendar' && (
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
          )}
          {view === 'today' && (
            <TodayView
              appointments={appointments}
              patients={patients}
              rooms={rooms}
              treatments={treatments}
              onAppointmentSelect={handleAppointmentClick}
              onNewAppointment={() => setShowAppointmentModal(true)}
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
              setTheme={setTheme}
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
    </div>
  );
}
