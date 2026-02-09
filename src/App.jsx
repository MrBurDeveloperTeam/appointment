import { useEffect, useState } from 'react';
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
  const { addToast } = useToast();
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

  const viewTitle = {
    calendar: 'Calendar',
    today: 'Today',
    patients: 'Patients',
    settings: 'Settings',
    reports: 'Reports',
    activity: 'Activity Log',
    requests: 'Requests',
  }[view];

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
          setView(newView);
          closeSidebar(); // Close sidebar on mobile when navigating
        }}
        theme={theme}
        setTheme={setTheme}
        onLogout={signOut}
        bookingLink={bookingLink}
        isOpen={sidebarOpen}
        onClose={closeSidebar}
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


      {showCreditModal && (
        <CreditModal
          credits={credits}
          history={creditHistory}
          loading={isRedeeming}
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
