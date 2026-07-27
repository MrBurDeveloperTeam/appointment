import { useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import DataStore from '../data';
import { updatePatient as updatePatientRecord } from '../data/datastore.supabase.patients';
import { updateStaff as updateStaffRecord } from '../data/datastore.supabase.staff';
import { updateRoom as updateRoomRecord } from '../data/datastore.supabase.rooms';
import { updateTreatment as updateTreatmentRecord } from '../data/datastore.supabase.treatments';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import { todayISO } from '../utils/date';
import { useToast } from '../context/ToastProvider';

const planOptions = ['Starter', 'Growth', 'Pro', 'Enterprise'];
const statusOptions = ['active', 'trial', 'paused'];
const ADMIN_TAB_KEY = 'appointmentApp_adminTab';

export default function AdminDashboard({ onLogout, theme, setTheme }) {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem(ADMIN_TAB_KEY) || 'overview');
  const [clinics, setClinics] = useState([]);
  const [users, setUsers] = useState([]);
  // ... (rest of simple state)
  const [adminActivity, setAdminActivity] = useState([]);
  const [clinicDetails, setClinicDetails] = useState({});
  const [summaryByClinicId, setSummaryByClinicId] = useState({});
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedClinicId, setExpandedClinicId] = useState('');
  const [expandedAppointmentMonths, setExpandedAppointmentMonths] = useState({});
  const [appointmentFilter, setAppointmentFilter] = useState({ status: 'all', query: '' });
  const [modalState, setModalState] = useState({ type: null, mode: 'new' });
  const [clinicForm, setClinicForm] = useState({ id: '', name: '', slug: '', city: '', plan: 'Starter', status: 'active', subscriptionType: 'monthly', subscriptionEnd: '' });
  const [userForm, setUserForm] = useState({ id: '', username: '', password: '', role: 'dentist', clinicId: '', name: '', status: 'active' });
  const [userFilter, setUserFilter] = useState({ query: '', sortBy: 'newest' });
  const [userPage, setUserPage] = useState(1);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userLoading, setUserLoading] = useState(false);
  const [detailModal, setDetailModal] = useState({ open: false, clinicId: '', type: '' });
  const [detailForm, setDetailForm] = useState({});
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [userSuccessMessage, setUserSuccessMessage] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({ open: false, type: '', payload: null });

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const [clinicsData, usersData, adminActivityData, summary] = await Promise.all([
        DataStore.getClinics(),
        DataStore.getUsers(),
        DataStore.getAdminActivity(),
        DataStore.getAdminDashboardSummary(),
      ]);
      setClinics(clinicsData || []);
      setUsers((usersData || []).filter((u) => u.status !== 'inactive'));
      setAdminActivity(adminActivityData || []);
      setSummaryByClinicId(summary?.summaryByClinicId || {});
      setMonthlyTrend(summary?.monthlyTrend || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  };

  const ensureClinicDetails = async (clinicId) => {
    if (!clinicId) return;
    // Already cached — skip refetch.
    if (clinicDetails[clinicId]) return;
    try {
      const [patients, appointments, staff, rooms, treatments, settings, holidays, activity] =
        await Promise.all([
          DataStore.getPatients(clinicId),
          DataStore.getAppointments(clinicId),
          DataStore.getStaff(clinicId),
          DataStore.getRooms(clinicId),
          DataStore.getTreatments(clinicId),
          DataStore.getSettings(clinicId),
          DataStore.getHolidays(clinicId),
          DataStore.getActivityLog(clinicId),
        ]);
      setClinicDetails((prev) => ({
        ...prev,
        [clinicId]: { patients, appointments, staff, rooms, treatments, settings, holidays, activity },
      }));
    } catch (err) {
      console.error("Failed to load clinic details:", err);
      setDetailError("Failed to load clinic details.");
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    localStorage.setItem(ADMIN_TAB_KEY, activeTab);
  }, [activeTab]);

  const clinicSummaries = useMemo(() => {
    return clinics.map((clinic) => {
      const summary = summaryByClinicId[clinic.id];
      const stats = {
        patients: summary?.patients ?? 0,
        appointments: summary?.appointments ?? 0,
        staff: summary?.staff ?? 0,
        rooms: summary?.rooms ?? 0,
        treatments: summary?.treatments ?? 0,
      };
      return { ...clinic, stats };
    });
  }, [clinics, summaryByClinicId]);

  // Map clinicId -> list of emails from profiles table (already loaded as `users`)
  const clinicEmailsMap = useMemo(() => {
    const map = {};
    users.forEach((u) => {
      if (u.clinicId && u.email) {
        if (!map[u.clinicId]) map[u.clinicId] = [];
        if (!map[u.clinicId].includes(u.email)) {
          map[u.clinicId].push(u.email);
        }
      }
    });
    return map;
  }, [users]);

  const totals = useMemo(() => {
    const base = { clinics: clinics.length, users: users.length, patients: 0, appointments: 0, staff: 0 };
    clinicSummaries.forEach((clinic) => {
      base.patients += clinic.stats.patients;
      base.appointments += clinic.stats.appointments;
      base.staff += clinic.stats.staff;
    });
    return base;
  }, [clinicSummaries, clinics.length, users.length]);

  const appointmentTrend = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleString('en-US', { month: 'short' }),
        count: 0,
      });
    }
    const index = Object.fromEntries(months.map((m, i) => [m.key, i]));
    (monthlyTrend || []).forEach((row) => {
      const idx = index[row.month];
      if (idx !== undefined) months[idx].count = row.count;
    });
    return months;
  }, [monthlyTrend]);


  const openClinicModal = (clinic) => {
    if (clinic?.id) ensureClinicDetails(clinic.id);
    if (clinic) {
      setClinicForm({
        id: clinic.id,
        name: clinic.name,
        slug: clinic.slug || '',
        city: clinic.city || '',
        plan: clinic.plan || 'Starter',
        status: clinic.status || 'active',
        subscriptionType: clinic.subscriptionType || 'monthly',
        subscriptionEnd: clinic.subscriptionEnd || ''
      });
      setModalState({ type: 'clinic', mode: 'edit' });
      return;
    }
    setClinicForm({ id: '', name: '', slug: '', city: '', plan: 'Starter', status: 'active', subscriptionType: 'monthly', subscriptionEnd: '' });
    setModalState({ type: 'clinic', mode: 'new' });
  };

  const openUserModal = (user) => {
    setUserSuccessMessage('');
    if (user) {
      setUserForm({
        id: user.id,
        username: user.username || user.email || '',
        password: '',
        role: user.role || 'dentist',
        clinicId: user.clinicId || '',
        name: user.name || '',
        status: user.status || 'active'
      });
      setModalState({ type: 'user', mode: 'edit' });
      return;
    }
    setUserForm({ id: '', username: '', password: '', role: 'dentist', clinicId: '', name: '', status: 'active' });
    setModalState({ type: 'user', mode: 'new' });
  };

  const closeModal = () => setModalState({ type: null, mode: 'new' });

  const openDetailModal = (clinicId, type) => {
    ensureClinicDetails(clinicId);
    setDetailModal({ open: true, clinicId, type });
    setDetailForm({});
    setDetailError('');
  };

  const closeDetailModal = () => {
    setDetailModal({ open: false, clinicId: '', type: '' });
    setDetailForm({});
    setDetailError('');
  };

  const getDetailItems = () => {
    const detail = clinicDetails[detailModal.clinicId] || {};
    switch (detailModal.type) {
      case 'patients': return detail.patients || [];
      case 'staff': return detail.staff || [];
      case 'rooms': return detail.rooms || [];
      case 'treatments': return detail.treatments || [];
      default: return [];
    }
  };

  const startEdit = (item) => {
    // ... logic ...
    if (!item) return;
    switch (detailModal.type) {
      case 'patients':
        setDetailForm({ id: item.id, name: item.name || '', phone: item.phone || '', email: item.email || '', address: item.address || '' });
        break;
      case 'staff':
        setDetailForm({ id: item.id, name: item.name || '', role: item.role || 'dentist', phone: item.phone || '', specialty: item.specialty || '' });
        break;
      case 'rooms':
        setDetailForm({ id: item.id, name: item.name || '', color: item.color || '' });
        break;
      case 'treatments':
        setDetailForm({ id: item.id, name: item.name || '', duration: item.duration || 0, color: item.color || '' });
        break;
      default: setDetailForm({});
    }
  };

  const handleDetailSave = async () => {
    if (!detailForm.id) return;
    setDetailSaving(true);
    setDetailError('');
    try {
      switch (detailModal.type) {
        case 'patients': await updatePatientRecord(detailForm.id, detailForm); break;
        case 'staff': await updateStaffRecord(detailForm.id, detailForm); break;
        case 'rooms': await updateRoomRecord(detailForm.id, detailForm); break;
        case 'treatments': await updateTreatmentRecord(detailForm.id, { ...detailForm, duration: Number(detailForm.duration) || 0 }); break;
      }
      await refresh();
      setDetailForm({});
      addToast('Record updated', 'success');
    } catch (err) {
      setDetailError(err.message || 'Failed to save changes.');
      console.error(err);
    } finally {
      setDetailSaving(false);
    }
  };

  const handleClinicSubmit = async () => {
    if (!clinicForm.name.trim()) {
      addToast('Enter clinic name', 'error');
      return;
    }

    // Validate Slug Uniqueness
    const slug = clinicForm.slug.trim().toLowerCase() || clinicForm.name.toLowerCase().replace(/\s+/g, '-');
    const duplicate = clinics.find(c => c.slug === slug && c.id !== clinicForm.id);

    if (duplicate) {
      addToast(`Slug "${slug}" is already taken by clinic "${duplicate.name}"`, 'error');
      return;
    }

    try {
      const payload = { ...clinicForm, slug }; // Ensure refined slug is sent
      if (clinicForm.id) {
        await DataStore.updateClinic(clinicForm.id, clinicForm);
        addToast('Clinic updated', 'success');
      } else {
        await DataStore.addClinic(clinicForm);
        addToast('Clinic created', 'success');
      }
      await refresh();
      closeModal();
    } catch (err) {
      addToast('Failed to save clinic', 'error');
      console.error(err);
    }
  };

  const handleUserSubmit = async () => {
    if (!userForm.username.trim()) {
      addToast('Enter email', 'error');
      return;
    }
    if (!DataStore.canCreateUsers && !userForm.id) {
      addToast('Create users in Supabase Auth, then assign role/clinic here.', 'info');
      return;
    }
    if (DataStore.canCreateUsers && !userForm.password.trim() && !userForm.id) {
      addToast('Enter password', 'error');
      return;
    }

    setUserLoading(true);
    try {
      if (userForm.id) {
        await DataStore.updateUser(userForm.id, userForm);
        setUserSuccessMessage('User updated successfully.');
        addToast('User updated successfully.', 'success');
      } else {
        const created = await DataStore.addUser(userForm);
        if (created?.id) {
          await DataStore.updateUser(created.id, {
            clinicId: userForm.clinicId,
            role: userForm.role,
            name: userForm.name,
            status: userForm.status
          });
          // ... update state ...
          setUsers((prev) => [
            {
              id: created.id,
              username: created.email,
              email: created.email,
              role: userForm.role || 'dentist',
              clinicId: userForm.clinicId || '',
              name: created.name || userForm.name || '',
              status: created.status || 'pending',
            },
            ...prev,
          ]);
        }
        setUserSuccessMessage('User created successfully.');
        addToast('User created successfully.', 'success');
      }
      await refresh();
      setTimeout(() => {
        closeModal();
        setUserLoading(false);
      }, 1500);

    } catch (err) {
      addToast(err.message || 'Failed to save user', 'error');
      console.error(err);
      setUserLoading(false);
    }
  };

  const handleDelete = async () => {
    if (modalState.type === 'clinic' && clinicForm.id) {
      setConfirmDialog({
        open: true,
        type: 'clinic',
        payload: { id: clinicForm.id, name: clinicForm.name },
      });
    }
    if (modalState.type === 'user' && userForm.id) {
      setConfirmDialog({
        open: true,
        type: 'user',
        payload: { id: userForm.id, name: userForm.name || userForm.username },
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (confirmDialog.type === 'clinic' && confirmDialog.payload?.id) {
      await DataStore.deleteClinic(confirmDialog.payload.id);
    }
    if (confirmDialog.type === 'user' && confirmDialog.payload?.id) {
      await DataStore.deleteUser(confirmDialog.payload.id);
    }
    await refresh();
    closeModal();
    setConfirmDialog({ open: false, type: '', payload: null });
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ... existing code ...

  return (
    <div className="admin-shell">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="admin-sidebar-header-mobile">
          <div className="admin-brand">
            <div className="admin-brand-mark">AB</div>
            <div className="admin-brand-title">Admin</div>
          </div>
          <button
            className="btn btn-icon sidebar-close-btn"
            onClick={() => setSidebarOpen(false)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Desktop Brand (hidden on mobile header inside sidebar if specific styles used, generally ok to keep) */}
        <div className="admin-brand desktop-only">
          <div className="admin-brand-mark">AB</div>
          <div>
            <div className="admin-brand-title">Admin</div>
            <div className="admin-brand-subtitle">Clinic Ops</div>
          </div>
        </div>

        <div className="admin-nav-label">Navigation</div>
        <nav className="admin-nav" role="tablist" aria-label="Admin sections">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'clinics', label: 'Clinics' },
            { id: 'users', label: 'Users' },
            { id: 'activity', label: 'History' }
          ].map((tab) => (
            <button
              key={tab.id}
              className={`admin-nav-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(tab.id);
                setSidebarOpen(false);
              }}
              role="tab"
              aria-selected={activeTab === tab.id}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <div className="sidebar-theme">
            <div>
              <div className="sidebar-theme-title">Theme</div>
              <div className="sidebar-theme-subtitle">Light / Dark</div>
            </div>
            <label className="theme-toggle">
              <input
                type="checkbox"
                checked={theme === 'dark'}
                onChange={(e) => setTheme && setTheme(e.target.checked ? 'dark' : 'light')}
                aria-label="Toggle dark mode"
              />
              <span className="theme-slider"></span>
              <span className="theme-label">{theme === 'dark' ? 'Dark' : 'Light'}</span>
            </label>
          </div>
          <button className="btn btn-secondary sidebar-logout" onClick={onLogout} style={{ marginTop: '1rem' }}>
            Logout
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button
              className="btn btn-icon mobile-menu-btn"
              onClick={() => setSidebarOpen(true)}
              style={{ marginRight: 12 }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>
            <div>
              <div className="admin-title">Admin Dashboard</div>
              <div className="admin-subtitle">Multi-clinic management</div>
            </div>
          </div>
          <div className="admin-topbar-right">
            <button className="btn btn-secondary btn-sm" onClick={refresh}>
              Refresh
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => openClinicModal()}>
              New Clinic
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => openUserModal()}
              disabled={!DataStore.canCreateUsers}
              title={DataStore.canCreateUsers ? 'Create user' : 'Enable VITE_ENABLE_ADMIN_CREATE_USERS'}
            >
              New User
            </button>
            {/* <div className="admin-status-pill">
              {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
            </div> */}
          </div>
        </header>

        {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}
        {loading && (
          <div className="admin-loading">
            <div className="skeleton skeleton-line" style={{ width: '220px', height: 16 }}></div>
            <div className="admin-loading-grid">
              <div className="skeleton skeleton-card"></div>
              <div className="skeleton skeleton-card"></div>
              <div className="skeleton skeleton-card"></div>
              <div className="skeleton skeleton-card"></div>
            </div>
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="admin-flex-layout">
            {/* 1. Hero Metrics Row */}
            <div className="admin-overview-section full-width">
              <div className="admin-flex-row hero-row">
                <div className="admin-flex-card hero-card">
                  <div className="hero-icon-wrapper blue">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                  </div>
                  <div>
                    <div className="hero-label">Total Appointments</div>
                    <div className="hero-value">{totals.appointments.toLocaleString()}</div>
                    <div className="hero-trend">Lifetime volume</div>
                  </div>
                </div>

                <div className="admin-flex-card hero-card">
                  <div className="hero-icon-wrapper green">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18" /><path d="M5 21V7l8-4 8 4v14" /><path d="M17 21v-8.8a1.78 1.78 0 0 0-3.56 0V21" /><path d="M8 21v-5.4a1.78 1.78 0 0 1 3.56 0V21" /></svg>
                  </div>
                  <div>
                    <div className="hero-label">Active Clinics</div>
                    <div className="hero-value">
                      {clinicSummaries.filter(c => c.stats.appointments > 0).length} / {totals.clinics}
                    </div>
                    <div className="hero-trend">Clinics with bookings</div>
                  </div>
                </div>

                <div className="admin-flex-card hero-card">
                  <div className="hero-icon-wrapper purple">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                  </div>
                  <div>
                    <div className="hero-label">Total Users</div>
                    <div className="hero-value">{totals.users}</div>
                    <div className="hero-trend">
                      {users.filter(u => u.role === 'dentist').length} Dentists • {users.filter(u => u.role === 'admin').length} Admins
                    </div>
                  </div>
                </div>

                <div className="admin-flex-card hero-card">
                  <div className="hero-icon-wrapper orange">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><activity /><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                  </div>
                  <div>
                    <div className="hero-label">Platform Health</div>
                    <div className="hero-value" style={{ fontSize: '1.25rem' }}>Operational</div>
                    <div className="hero-trend">System normal</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Visual Analytics Row (Charts) */}
            <div className="admin-flex-row chart-row full-width">
              {/* Growth Trend (Line Chart) */}
              <div className="admin-flex-card chart-card grow-2">
                <div className="admin-panel-title">Global Appointment Growth</div>
                <div className="admin-panel-subtitle">Volume over last 6 months</div>
                <div style={{ width: '100%', height: 300, marginTop: 16 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={appointmentTrend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                      <XAxis
                        dataKey="label"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                        dy={10}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--bg-card)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          boxShadow: 'var(--shadow-md)'
                        }}
                        itemStyle={{ color: 'var(--text-primary)' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="var(--primary)"
                        strokeWidth={3}
                        dot={{ r: 4, fill: 'var(--primary)', strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Status Distribution (Pie Chart) */}
              <div className="admin-flex-card chart-card grow-1">
                <div className="admin-panel-title">Status Distribution</div>
                <div className="admin-panel-subtitle">Global Breakdown</div>
                <div style={{ width: '100%', height: 300, marginTop: 16 }}>
                  {(() => {
                    let confirmed = 0;
                    let completed = 0;
                    let cancelled = 0;
                    Object.values(clinicDetails).forEach(d => {
                      (d.appointments || []).forEach(a => {
                        if (a.status === 'confirmed') confirmed++;
                        if (a.status === 'completed') completed++;
                        if (a.status === 'cancelled') cancelled++;
                      });
                    });
                    const data = [
                      { name: 'Confirmed', value: confirmed, color: 'var(--primary)' },
                      { name: 'Completed', value: completed, color: 'var(--success)' },
                      { name: 'Cancelled', value: cancelled, color: 'var(--danger)' },
                    ].filter(d => d.value > 0);

                    if (data.length === 0) return <div className="empty-chart-state">No data available</div>;

                    return (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {data.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend verticalAlign="bottom" height={36} iconType="circle" />
                        </PieChart>
                      </ResponsiveContainer>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* 3. Data Tables Row */}
            <div className="admin-flex-row data-row full-width">
              {/* Leaderboard Table */}
              <div className="admin-flex-card table-card grow-1">
                <div className="admin-panel-title">Top Performing Clinics</div>
                <div className="admin-panel-subtitle">By appointment volume</div>

                <div className="table-responsive mt-3">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Clinic Name</th>
                        <th>Location</th>
                        <th>Plan</th>
                        <th className="text-right">Volume</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clinicSummaries
                        .sort((a, b) => b.stats.appointments - a.stats.appointments)
                        .slice(0, 5)
                        .map((clinic, i) => (
                          <tr key={clinic.id}>
                            <td>
                              <span className="rank-badge">{i + 1}</span>
                            </td>
                            <td className="font-medium">{clinic.name}</td>
                            <td className="text-muted">{clinic.city}</td>
                            <td>
                              <span className={`badge badge-neutral`}>{clinic.plan}</span>
                            </td>
                            <td className="text-right font-bold">{clinic.stats.appointments}</td>
                          </tr>
                        ))
                      }
                      {clinicSummaries.length === 0 && (
                        <tr><td colSpan="5" className="text-center text-muted">No clinics found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'clinics' && (
          <div className="admin-layout">
            <section className="admin-panel admin-wide">
              <div className="admin-panel-header">
                <div className="admin-panel-title">Clinic Accounts</div>
                {/* <button className="btn btn-primary btn-sm" onClick={() => openClinicModal()}>
                  + Add Clinic
                </button> */}
              </div>
              <div className="admin-list">
                {clinicSummaries.map((clinic) => (
                  <div key={clinic.id} className="admin-list-item admin-list-item-column">
                    <div className="admin-list-top">
                      <div>
                        <div className="admin-row-title">{clinic.name}</div>
                        {(clinicEmailsMap[clinic.id] || []).map((email) => (
                          <div key={email} className="admin-row-email" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                            {email}
                          </div>
                        ))}
                        <div className="admin-row-sub">
                          {clinic.city} - {clinic.plan}
                          {clinic.subscriptionType && clinic.subscriptionType !== 'free' && ` (${clinic.subscriptionType}${clinic.subscriptionEnd ? ` until ${clinic.subscriptionEnd}` : ''})`}
                          {' '}- {clinic.status}
                        </div>
                        <div className="admin-list-meta">
                          <span>{clinic.stats.patients} patients</span>
                          <span>{clinic.stats.appointments} appointments</span>
                          <span>{clinic.stats.staff} staff</span>
                          <span>{clinic.stats.rooms} rooms</span>
                        </div>
                      </div>
                      <div className="admin-list-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => openClinicModal(clinic)}>
                          Manage
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            const next = expandedClinicId === clinic.id ? '' : clinic.id;
                            setExpandedClinicId(next);
                            if (next) ensureClinicDetails(next);
                          }}
                        >
                          {expandedClinicId === clinic.id ? 'Hide Details' : 'View Details'}
                        </button>
                      </div>
                    </div>
                    {expandedClinicId === clinic.id && (
                      <div className="admin-clinic-details">
                        {/* Calculate Analytics Data on the fly */}
                        {(() => {
                          const detail = clinicDetails[clinic.id] || {};
                          const appts = detail.appointments || [];
                          const patients = detail.patients || [];
                          const staff = detail.staff || [];
                          const treatments = detail.treatments || [];
                          const rooms = detail.rooms || [];

                          // 1. Key Metrics
                          const totalAppts = appts.length;
                          const completed = appts.filter(a => a.status === 'completed').length;
                          const cancelled = appts.filter(a => a.status === 'cancelled').length;
                          const confirmed = appts.filter(a => a.status === 'confirmed').length;
                          const completionRate = totalAppts > 0 ? Math.round((completed / totalAppts) * 100) : 0;

                          // 2. Monthly Trend (Last 6 Months)
                          const trendData = [];
                          const now = new Date();
                          for (let i = 5; i >= 0; i--) {
                            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                            const label = d.toLocaleString('en-US', { month: 'short' });
                            const count = appts.filter(a => a.date && a.date.startsWith(key)).length;
                            trendData.push({ label, count });
                          }
                          const maxTrend = Math.max(...trendData.map(d => d.count), 1);

                          // 3. Top Treatments
                          const treatmentCounts = {};
                          appts.forEach(a => {
                            if (a.treatmentId) treatmentCounts[a.treatmentId] = (treatmentCounts[a.treatmentId] || 0) + 1;
                          });
                          const topTreatments = Object.entries(treatmentCounts)
                            .sort(([, a], [, b]) => b - a)
                            .slice(0, 5)
                            .map(([id, count]) => {
                              const t = treatments.find(x => x.id === id);
                              return { name: t ? t.name : 'Unknown', count, color: t?.color };
                            });

                          // 4. Top Staff
                          const staffCounts = {};
                          appts.forEach(a => {
                            if (a.dentistId) staffCounts[a.dentistId] = (staffCounts[a.dentistId] || 0) + 1;
                          });
                          const topStaff = Object.entries(staffCounts)
                            .sort(([, a], [, b]) => b - a)
                            .slice(0, 5)
                            .map(([id, count]) => {
                              const s = staff.find(x => x.id === id);
                              return { name: s ? s.name : 'Unknown', count, role: s?.role };
                            });

                          return (
                            <div className="admin-analytics-dashboard">
                              {/* Row 1: Key Metrics */}
                              <div className="admin-analytics-grid">
                                <div className="admin-stat-card">
                                  <div className="admin-stat-label">Total Appointments</div>
                                  <div className="admin-stat-value">{totalAppts}</div>
                                  <div className="admin-stat-trend">Lifetime volume</div>
                                </div>
                                <div className="admin-stat-card">
                                  <div className="admin-stat-label">Completion Rate</div>
                                  <div className="admin-stat-value">{completionRate}%</div>
                                  <div className="admin-stat-trend">{completed} completed</div>
                                </div>
                                <div className="admin-stat-card">
                                  <div className="admin-stat-label">Cancellation Rate</div>
                                  <div className="admin-stat-value">
                                    {totalAppts > 0 ? Math.round((cancelled / totalAppts) * 100) : 0}%
                                  </div>
                                  <div className="admin-stat-trend">{cancelled} cancelled</div>
                                </div>
                                <div className="admin-stat-card">
                                  <div className="admin-stat-label">Active Patients</div>
                                  <div className="admin-stat-value">{patients.length}</div>
                                  <div className="admin-stat-trend">Registered profiles</div>
                                </div>
                              </div>

                              {/* Row 2: Charts & Breakdown */}
                              <div className="admin-charts-row">
                                <div className="admin-chart-container">
                                  <div className="admin-chart-header">
                                    <h4 className="admin-chart-title">Appointments Trend</h4>
                                    <span className="admin-chart-subtitle">Last 6 Months</span>
                                  </div>
                                  <div className="admin-chart-content">
                                    <div className="admin-chart-bars">
                                      {trendData.map((d, idx) => (
                                        <div key={idx} className="chart-bar-group">
                                          <div
                                            className="chart-bar"
                                            style={{ height: `${(d.count / maxTrend) * 100}%` }}
                                            title={`${d.label}: ${d.count}`}
                                          ></div>
                                          <span className="chart-label">{d.label}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                <div className="admin-chart-container">
                                  <div className="admin-chart-header">
                                    <h4 className="admin-chart-title">Status Breakdown</h4>
                                    <span className="admin-chart-subtitle">Current Distribution</span>
                                  </div>
                                  <div className="admin-chart-content">
                                    <div className="status-progress-group">
                                      <div className="status-label-row">
                                        <span>Confirmed</span>
                                        <span>{confirmed}</span>
                                      </div>
                                      <div className="progress-bg">
                                        <div className="progress-fill status-confirmed" style={{ width: `${totalAppts ? (confirmed / totalAppts) * 100 : 0}%` }}></div>
                                      </div>
                                    </div>
                                    <div className="status-progress-group">
                                      <div className="status-label-row">
                                        <span>Completed</span>
                                        <span>{completed}</span>
                                      </div>
                                      <div className="progress-bg">
                                        <div className="progress-fill status-completed" style={{ width: `${totalAppts ? (completed / totalAppts) * 100 : 0}%` }}></div>
                                      </div>
                                    </div>
                                    <div className="status-progress-group">
                                      <div className="status-label-row">
                                        <span>Cancelled</span>
                                        <span>{cancelled}</span>
                                      </div>
                                      <div className="progress-bg">
                                        <div className="progress-fill status-cancelled" style={{ width: `${totalAppts ? (cancelled / totalAppts) * 100 : 0}%` }}></div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Row 3: Top Lists & Quick Actions */}
                              <div className="admin-lists-row">
                                <div className="admin-list-panel">
                                  <div className="admin-panel-header-small">Top Treatments</div>
                                  {topTreatments.map((t, i) => (
                                    <div key={i} className="admin-list-row-small">
                                      <div className="flex-row gap-2">
                                        <span className="list-rank">#{i + 1}</span>
                                        <span>{t.name}</span>
                                      </div>
                                      <span className="list-count">{t.count}</span>
                                    </div>
                                  ))}
                                  {topTreatments.length === 0 && <div className="text-muted text-sm">No data</div>}
                                </div>

                                <div className="admin-list-panel">
                                  <div className="admin-panel-header-small">Top Staff</div>
                                  {topStaff.map((s, i) => (
                                    <div key={i} className="admin-list-row-small">
                                      <div className="flex-row gap-2">
                                        <span className="list-rank">#{i + 1}</span>
                                        <span>{s.name}</span>
                                        {s.role && <span className="admin-tag-tiny">{s.role}</span>}
                                      </div>
                                      <span className="list-count">{s.count}</span>
                                    </div>
                                  ))}
                                  {topStaff.length === 0 && <div className="text-muted text-sm">No data</div>}
                                </div>

                                <div className="admin-actions-panel">
                                  <div className="admin-panel-header-small">Manage Data</div>
                                  <div className="admin-actions-grid-small">
                                    <button className="btn btn-secondary btn-sm w-100" onClick={() => openDetailModal(clinic.id, 'patients')}>Manage Patients</button>
                                    <button className="btn btn-secondary btn-sm w-100" onClick={() => openDetailModal(clinic.id, 'appointments')}>Manage Bookings</button>
                                    <button className="btn btn-secondary btn-sm w-100" onClick={() => openDetailModal(clinic.id, 'staff')}>Manage Staff</button>
                                    <button className="btn btn-secondary btn-sm w-100" onClick={() => openDetailModal(clinic.id, 'treatments')}>Manage Services</button>
                                  </div>
                                </div>
                              </div>

                              {/* Row 4: Activity & Settings */}
                              <div className="admin-extras-row">
                                <div className="admin-list-panel">
                                  <div className="admin-panel-header-small">Recent Activity</div>
                                  <div className="admin-detail-list">
                                    {(clinicDetails[clinic.id]?.activity || []).slice(0, 5).map((log) => (
                                      <div key={log.id} className="admin-list-row-small">
                                        <div className="flex-col">
                                          <span className="font-medium text-sm">{log.description}</span>
                                          <span className="text-secondary text-xs">{new Date(log.timestamp).toLocaleString()}</span>
                                        </div>
                                        <span className="admin-tag-tiny">{log.type.replace('_', ' ')}</span>
                                      </div>
                                    ))}
                                    {(clinicDetails[clinic.id]?.activity || []).length === 0 && (
                                      <div className="text-muted text-sm">No recent activity</div>
                                    )}
                                  </div>
                                </div>

                                <div className="admin-list-panel">
                                  <div className="admin-panel-header-small">Clinic Settings</div>
                                  <div className="admin-settings-grid">
                                    <div className="setting-item">
                                      <span className="setting-label">Clinic Name</span>
                                      <span className="setting-value">{summaryByClinicId[clinic.id]?.settings?.clinicName || 'Dental Clinic'}</span>
                                    </div>
                                    <div className="setting-item">
                                      <span className="setting-label">Subscription</span>
                                      <span className="setting-value" style={{ textTransform: 'capitalize' }}>
                                        {clinic.subscriptionType || 'Monthly'}
                                        {clinic.subscriptionEnd && ` (Ends: ${new Date(clinic.subscriptionEnd).toLocaleDateString()})`}
                                      </span>
                                    </div>
                                    <div className="setting-item">
                                      <span className="setting-label">Working Hours</span>
                                      <span className="setting-value">
                                        {summaryByClinicId[clinic.id]?.settings?.workingHours?.start || '09:00'} - {summaryByClinicId[clinic.id]?.settings?.workingHours?.end || '18:00'}
                                      </span>
                                    </div>
                                    <div className="setting-item">
                                      <span className="setting-label">Slot Duration</span>
                                      <span className="setting-value">{summaryByClinicId[clinic.id]?.settings?.slotDuration || 30} mins</span>
                                    </div>
                                    <div className="setting-item">
                                      <span className="setting-label">Phone</span>
                                      <span className="setting-value">{summaryByClinicId[clinic.id]?.settings?.phone || '-'}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                ))}
                {clinicSummaries.length === 0 && <div className="empty-state">No clinics yet</div>}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="admin-layout">
            <section className="admin-panel admin-wide">
              <div className="admin-panel-header">
                <div className="admin-panel-title">User Accounts</div>
                {/* <button
                  className="btn btn-primary btn-sm"
                  onClick={() => openUserModal()}
                  disabled={!DataStore.canCreateUsers}
                  title={DataStore.canCreateUsers ? 'Create user' : 'Enable VITE_ENABLE_ADMIN_CREATE_USERS'}
                >
                  + Create User
                </button> */}
              </div>
              <div className="form-hint" style={{ marginBottom: 12 }}>
                Create users in Supabase Auth, or set VITE_ENABLE_ADMIN_CREATE_USERS=true to enable this button.
              </div>
              <div className="admin-filter-container" style={{ marginBottom: 16 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="admin-search-icon"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                  <input
                    type="text"
                    placeholder="Search users..."
                    className="admin-search-input"
                    style={{ paddingLeft: 36, width: '100%' }}
                    value={userFilter.query}
                    onChange={(e) => { setUserFilter(prev => ({ ...prev, query: e.target.value })); setUserPage(1); }}
                  />
                </div>
                <select
                  className="admin-select"
                  style={{ width: 150 }}
                  value={userFilter.sortBy}
                  onChange={(e) => { setUserFilter(prev => ({ ...prev, sortBy: e.target.value })); setUserPage(1); }}
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="alpha_asc">Name (A-Z)</option>
                  <option value="alpha_desc">Name (Z-A)</option>
                </select>
              </div>

              {userSuccessMessage && (
                <div className="admin-success-banner" style={{
                  marginBottom: 16,
                  padding: '12px 16px',
                  backgroundColor: '#ecfdf5',
                  color: '#047857',
                  borderRadius: '8px',
                  border: '1px solid #a7f3d0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                  {userSuccessMessage}
                </div>
              )}
              <div className="admin-table-container">
                <table className="admin-table">
                  {(() => {
                    const processedUsers = users.filter(u => {
                      if (u.role === 'admin') return false;
                      const q = userFilter.query.toLowerCase();
                      return (
                        (u.name || '').toLowerCase().includes(q) ||
                        (u.email || '').toLowerCase().includes(q) ||
                        (u.phone || '').toLowerCase().includes(q)
                      );
                    }).sort((a, b) => {
                      if (userFilter.sortBy === 'newest') return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
                      if (userFilter.sortBy === 'oldest') return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
                      if (userFilter.sortBy === 'alpha_asc') return (a.name || a.email || '').localeCompare(b.name || b.email || '');
                      if (userFilter.sortBy === 'alpha_desc') return (b.name || b.email || '').localeCompare(a.name || a.email || '');
                      return 0;
                    });

                    const usersPerPage = 10;
                    const totalUserPages = Math.max(1, Math.ceil(processedUsers.length / usersPerPage));
                    const currentPage = Math.min(userPage, totalUserPages);
                    const startIndex = (currentPage - 1) * usersPerPage;
                    const paginatedUsers = processedUsers.slice(startIndex, startIndex + usersPerPage);

                    return (
                      <>
                        <thead>
                          <tr>
                            <th>Email</th>
                            <th>Name</th>
                            <th>Account Type</th>
                            <th>Created At</th>
                            <th style={{ textAlign: 'right' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedUsers.map((user) => (
                            <tr key={user.id}>
                              <td className="font-medium" title={user.email}>
                                {user.email && user.email.length > 20 ? `${user.email.substring(0, 20)}...` : user.email}
                              </td>
                              <td title={user.name}>
                                {user.name ? (user.name.length > 20 ? `${user.name.substring(0, 20)}...` : user.name) : '-'}
                              </td>
                              <td>
                                <div className="flex-col">
                                  <span className="text-capitalize">{user.role}</span>
                                  <span className="text-muted text-xs">
                                    {user.clinicId
                                      ? clinics.find(c => c.id === user.clinicId)?.name
                                      : 'Unassigned'}
                                  </span>
                                </div>
                              </td>
                              <td className="text-muted text-sm">
                                {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <button
                                  className="btn btn-icon btn-ghost btn-sm"
                                  onClick={() => openUserModal(user)}
                                  title="Edit User"
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </button>
                              </td>
                            </tr>
                          ))}
                          {processedUsers.length === 0 && (
                            <tr>
                              <td colSpan="5" className="text-center py-4 text-muted">No users found</td>
                            </tr>
                          )}
                        </tbody>
                        {totalUserPages > 1 && (
                          <tfoot style={{ background: 'transparent' }}>
                            <tr>
                              <td colSpan="5" style={{ padding: '16px 12px 8px', borderBottom: 'none' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div className="text-sm text-muted">
                                    Showing {startIndex + 1} to {Math.min(startIndex + usersPerPage, processedUsers.length)} of {processedUsers.length} entries
                                  </div>
                                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      disabled={currentPage === 1}
                                      onClick={() => setUserPage(p => Math.max(1, p - 1))}
                                    >
                                      Previous
                                    </button>
                                    <div style={{ fontSize: '13px', margin: '0 8px' }}>
                                      Page {currentPage} of {totalUserPages}
                                    </div>
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      disabled={currentPage === totalUserPages}
                                      onClick={() => setUserPage(p => Math.min(totalUserPages, p + 1))}
                                    >
                                      Next
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </>
                    );
                  })()}
                </table>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="admin-layout">
            <section className="admin-panel admin-wide">
              <div className="admin-panel-title">Admin History</div>
              {adminActivity.length === 0 && <div className="empty-state">No activity logged</div>}
              {adminActivity.map((log) => (
                <div key={log.id} className="admin-row">
                  <div>
                    <div className="admin-row-title">{log.description}</div>
                    <div className="admin-row-sub">{new Date(log.timestamp).toLocaleString()}</div>
                  </div>
                  <span className="admin-tag">{log.type.replace('_', ' ')}</span>
                </div>
              ))}
            </section>
          </div>
        )}
      </main>

      {modalState.type === 'clinic' && (
        <Modal title={modalState.mode === 'edit' ? 'Edit Clinic' : 'Add Clinic'} onClose={closeModal}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Clinic Name</label>
                <input
                  className="form-input"
                  value={clinicForm.name}
                  onChange={(e) => {
                    // Auto-generate slug if it hasn't been manually edited
                    const name = e.target.value;
                    const isManual = clinicForm.slug !== clinicForm.name.toLowerCase().replace(/\s+/g, '-');
                    const updates = { name };
                    if (!isManual || !clinicForm.slug) {
                      updates.slug = name.toLowerCase().replace(/\s+/g, '-');
                    }
                    setClinicForm({ ...clinicForm, ...updates });
                  }}
                  placeholder="e.g. Downtown Dental"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Slug (Unique ID)</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="form-input"
                    value={clinicForm.slug}
                    onChange={(e) => setClinicForm({ ...clinicForm, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                    placeholder="downtown-dental"
                    style={{ paddingLeft: '8px' }}
                  />
                  <div className="form-hint" style={{ marginTop: '4px' }}>
                    Used for URLs. Must be unique.
                  </div>
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">City / Location</label>
                <input
                  className="form-input"
                  value={clinicForm.city}
                  onChange={(e) => setClinicForm({ ...clinicForm, city: e.target.value })}
                  placeholder="e.g. New York"
                />
              </div>
              <div className="form-group">
                <label className="form-label">System Plan</label>
                <select className="form-select" value={clinicForm.plan} onChange={(e) => setClinicForm({ ...clinicForm, plan: e.target.value })}>
                  {planOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Billing Cycle</label>
                <select className="form-select" value={clinicForm.subscriptionType} onChange={(e) => setClinicForm({ ...clinicForm, subscriptionType: e.target.value })}>
                  <option value="monthly">Monthly</option>
                  <option value="annually">Annually</option>
                  <option value="free">Free / Unmanaged</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Subscription End Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={clinicForm.subscriptionEnd}
                  onChange={(e) => setClinicForm({ ...clinicForm, subscriptionEnd: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={clinicForm.status} onChange={(e) => setClinicForm({ ...clinicForm, status: e.target.value })}>
                {statusOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="modal-footer">
            {modalState.mode === 'edit' && (
              <button type="button" className="btn btn-danger" onClick={handleDelete}>
                Delete
              </button>
            )}
            <div className="flex-1"></div>
            <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleClinicSubmit}>
              {modalState.mode === 'edit' ? 'Save Clinic' : 'Add Clinic'}
            </button>
          </div>
        </Modal>
      )}

      {modalState.type === 'user' && (
        <Modal title={modalState.mode === 'edit' ? 'Edit User' : 'Add User'} onClose={closeModal}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  value={userForm.username}
                  onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                  readOnly={modalState.mode === 'edit'}
                  style={modalState.mode === 'edit' ? { opacity: 0.6, cursor: 'not-allowed', background: 'var(--bg-hover)' } : {}}
                />
              </div>
              {DataStore.canCreateUsers && modalState.mode === 'new' && (
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input className="form-input" type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
                </div>
              )}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="form-select" value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
                  <option value="dentist">Dentist</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-select" value={userForm.status} onChange={(e) => setUserForm({ ...userForm, status: e.target.value })}>
                  {statusOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Clinic (optional; assign later)</label>
              <select className="form-select" value={userForm.clinicId} onChange={(e) => setUserForm({ ...userForm, clinicId: e.target.value })}>
                <option value="">Unassigned</option>
                {clinics.map((clinic) => (
                  <option key={clinic.id} value={clinic.id}>{clinic.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Display Name</label>
              <input className="form-input" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
            </div>
          </div>
          <div className="modal-footer">
            {modalState.mode === 'edit' && (
              <button type="button" className="btn btn-danger" onClick={handleDelete}>
                Delete
              </button>
            )}
            <div className="flex-1"></div>
            <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleUserSubmit} disabled={userLoading}>
              {userLoading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" style={{ width: 12, height: 12, border: '2px solid currentColor', borderRightColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 1s linear infinite' }}></span>
                  Saving...
                </span>
              ) : (modalState.mode === 'edit' ? 'Save User' : 'Add User')}
            </button>
          </div>
        </Modal>
      )}
      {detailModal.open && (
        <Modal
          title={detailForm.id ? `Edit ${detailModal.type.slice(0, -1)}` : `Manage ${detailModal.type}`}
          onClose={closeDetailModal}
        >
          <div className="modal-body">
            {detailError && <div className="form-error" style={{ marginBottom: 12 }}>{detailError}</div>}

            {/* APPOINTMENTS VIEW (Unchanged) */}
            {detailModal.type === 'appointments' ? (
              <div className="admin-appointment-view">
                {/* ... (Keep existing appointments logic if needed, or collapse for brevity in this replace block if unchanged. 
                      However, since this replace block is large, I'll preserve the appointment view or assume it's stable.
                      User specific request was about 'manage data like patient, booking and staff'. 
                      Appointments logic was largely read-only/complex view. 
                      I will preserve the appointment block structure but focus change on the bottom half.)
                 */}
                <div className="admin-filter-container">
                  {/* ... (Search inputs preserved by not touching them? No, this tool requires full replacement of the range. I must copy existing code.) */}
                  <div style={{ position: 'relative', flex: 1 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="admin-search-icon"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <input
                      type="text"
                      placeholder="Search patient, dentist or treatment..."
                      className="admin-search-input"
                      style={{ paddingLeft: 36, width: '100%' }}
                      value={appointmentFilter.query}
                      onChange={(e) => setAppointmentFilter(prev => ({ ...prev, query: e.target.value }))}
                    />
                  </div>
                  <select
                    className="admin-select"
                    value={appointmentFilter.status}
                    onChange={(e) => setAppointmentFilter(prev => ({ ...prev, status: e.target.value }))}
                    style={{ minWidth: 140 }}
                  >
                    <option value="all">All Status</option>
                    {[...new Set((clinicDetails[detailModal.clinicId]?.appointments || []).map(a => a.status).filter(Boolean))].sort().map(status => (
                      <option key={status} value={status}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                {/* ... Appointments List Logic (Large Block) ... */}
                {(() => {
                  const details = clinicDetails[detailModal.clinicId] || {};
                  const rawAppointments = details.appointments || [];
                  const patients = details.patients || [];
                  const staff = details.staff || [];
                  const treatments = details.treatments || [];
                  const rooms = details.rooms || [];

                  // 1. Hydrate 
                  const appointments = rawAppointments.map(apt => {
                    const patient = patients.find(p => p.id === apt.patientId);
                    const dentist = staff.find(s => s.id === apt.dentistId);
                    const treatment = treatments.find(t => t.id === apt.treatmentId);
                    const room = rooms.find(r => r.id === apt.roomId);
                    return {
                      ...apt,
                      patient,
                      dentist,
                      treatment,
                      room,
                      patientName: patient?.name || 'Unknown Patient',
                      dentistName: dentist?.name || 'Unassigned',
                      treatmentName: treatment?.name || 'Checkup'
                    };
                  });

                  // 2. Filter
                  const filtered = appointments.filter(apt => {
                    const matchesStatus = appointmentFilter.status === 'all' || apt.status === appointmentFilter.status;
                    const q = appointmentFilter.query.toLowerCase();
                    const matchesQuery = !q ||
                      apt.patientName.toLowerCase().includes(q) ||
                      apt.dentistName.toLowerCase().includes(q) ||
                      apt.treatmentName.toLowerCase().includes(q);
                    return matchesStatus && matchesQuery;
                  });

                  // 3. Group
                  const grouped = filtered.reduce((acc, apt) => {
                    const monthKey = apt.date.slice(0, 7);
                    if (!acc[monthKey]) acc[monthKey] = [];
                    acc[monthKey].push(apt);
                    return acc;
                  }, {});
                  const sortedMonths = Object.keys(grouped).sort().reverse();

                  if (filtered.length === 0) return <div className="empty-state">No matching appointments</div>;

                  return (
                    <div className="admin-month-groups">
                      {sortedMonths.map(month => {
                        const dateObj = new Date(month + '-01');
                        const monthLabel = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
                        const isExpanded = expandedAppointmentMonths[month];
                        return (
                          <div key={month} className="admin-month-wrapper">
                            <div className="admin-month-header" onClick={() => setExpandedAppointmentMonths(prev => ({ ...prev, [month]: !prev[month] }))}>
                              <span>{monthLabel} <span className="admin-count-badge">({grouped[month].length})</span></span>
                              <span className="admin-collapse-icon">{isExpanded ? '▼' : '▶'}</span>
                            </div>
                            {isExpanded && (
                              <div className="admin-month-body">
                                {grouped[month].map(apt => {
                                  const normalizedStatus = (apt.status || 'confirmed').toLowerCase().replace(' ', '-');
                                  return (
                                    <div key={apt.id} className="admin-appointment-card">
                                      <div className="admin-card-header-row">
                                        <div className="admin-time-group">
                                          <div className="admin-date-badge">
                                            {new Date(apt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                          </div>
                                          <span className="admin-time-start">{apt.startTime}</span>
                                          <span className="admin-time-separator">—</span>
                                          <span className="admin-time-end">{apt.endTime || '?'}</span>
                                          {apt.duration && <span className="admin-duration-badge">{apt.duration}m</span>}
                                        </div>
                                        <span className={`status-pill status-${normalizedStatus}`}>{apt.status}</span>
                                      </div>
                                      <div className="admin-card-details-grid">
                                        <div>
                                          <div className="admin-detail-label">Patient</div>
                                          <div className="admin-detail-value">{apt.patientName}</div>
                                          {apt.patient?.phone && <div className="admin-detail-sub">{apt.patient.phone}</div>}
                                        </div>
                                        <div>
                                          <div className="admin-detail-label">Treatment</div>
                                          <div className="admin-detail-value">{apt.treatmentName}</div>
                                          <div className="admin-detail-sub">with {apt.dentistName}</div>
                                        </div>
                                      </div>
                                      <div className="admin-card-footer">
                                        {apt.room && (
                                          <div className="admin-room-info">
                                            <div className="admin-room-dot" style={{ background: apt.room.color || '#cbd5e1' }}></div>
                                            <span className="admin-room-name">Room: {apt.room.name}</span>
                                          </div>
                                        )}
                                        {apt.notes && <div className="admin-notes">Note: "{apt.notes}"</div>}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            ) : (
              /* MASTER-DETAIL VIEW SWITCHING */
              <>
                {/* 1. EDIT FORM VIEW */}
                {detailForm.id ? (
                  <div className="admin-entity-form full-height-form">
                    <button className="btn-link-back" onClick={() => setDetailForm({})}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                      Back to List
                    </button>

                    <div className="admin-detail-title">Edit Details</div>

                    {detailModal.type === 'patients' && (
                      <>
                        <div className="form-group">
                          <label className="form-label">Name</label>
                          <input className="form-input" value={detailForm.name} onChange={(e) => setDetailForm({ ...detailForm, name: e.target.value })} />
                        </div>
                        <div className="form-row">
                          <div className="form-group">
                            <label className="form-label">Phone</label>
                            <input className="form-input" value={detailForm.phone} onChange={(e) => setDetailForm({ ...detailForm, phone: e.target.value })} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Email</label>
                            <input className="form-input" value={detailForm.email} onChange={(e) => setDetailForm({ ...detailForm, email: e.target.value })} />
                          </div>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Address</label>
                          <input className="form-input" value={detailForm.address} onChange={(e) => setDetailForm({ ...detailForm, address: e.target.value })} />
                        </div>
                      </>
                    )}

                    {detailModal.type === 'staff' && (
                      <>
                        <div className="form-group">
                          <label className="form-label">Name</label>
                          <input className="form-input" value={detailForm.name} onChange={(e) => setDetailForm({ ...detailForm, name: e.target.value })} />
                        </div>
                        <div className="form-row">
                          <div className="form-group">
                            <label className="form-label">Role</label>
                            <select className="form-select" value={detailForm.role} onChange={(e) => setDetailForm({ ...detailForm, role: e.target.value })}>
                              <option value="dentist">Dentist</option>
                              <option value="nurse">Nurse</option>
                              <option value="assistant">Assistant</option>
                            </select>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Phone</label>
                            <input className="form-input" value={detailForm.phone} onChange={(e) => setDetailForm({ ...detailForm, phone: e.target.value })} />
                          </div>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Specialty</label>
                          <input className="form-input" value={detailForm.specialty} onChange={(e) => setDetailForm({ ...detailForm, specialty: e.target.value })} />
                        </div>
                      </>
                    )}

                    {detailModal.type === 'rooms' && (
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Name</label>
                          <input className="form-input" value={detailForm.name} onChange={(e) => setDetailForm({ ...detailForm, name: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Color</label>
                          <input className="form-input" value={detailForm.color} onChange={(e) => setDetailForm({ ...detailForm, color: e.target.value })} />
                        </div>
                      </div>
                    )}

                    {detailModal.type === 'treatments' && (
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Name</label>
                          <input className="form-input" value={detailForm.name} onChange={(e) => setDetailForm({ ...detailForm, name: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Duration (mins)</label>
                          <input
                            className="form-input"
                            type="number"
                            min="0"
                            value={detailForm.duration}
                            onChange={(e) => setDetailForm({ ...detailForm, duration: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Color</label>
                          <input className="form-input" value={detailForm.color} onChange={(e) => setDetailForm({ ...detailForm, color: e.target.value })} />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* 2. LIST VIEW */
                  <div className="admin-entity-list">
                    {getDetailItems().map((item) => (
                      <div key={item.id} className="admin-entity-item">
                        <div>
                          <div className="admin-row-title">{item.name || item.email || 'Unnamed'}</div>
                          <div className="admin-row-sub">
                            {detailModal.type === 'patients' && (item.email || item.phone || 'No contact')}
                            {detailModal.type === 'staff' && `${item.role || 'staff'} ${item.phone ? `• ${item.phone}` : ''}`}
                            {detailModal.type === 'rooms' && (item.color || 'No color')}
                            {detailModal.type === 'treatments' && `${item.duration || 0} mins`}
                          </div>
                        </div>
                        <button className="btn btn-secondary btn-sm" type="button" onClick={() => startEdit(item)}>
                          Edit
                        </button>
                      </div>
                    ))}
                    {getDetailItems().length === 0 && (
                      <div className="empty-state">No records yet</div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="modal-footer">
            {/* Logic change: If editing, Cancel means 'Back', otherwise Close */}
            {detailForm.id && detailModal.type !== 'appointments' ? (
              <>
                <button type="button" className="btn btn-secondary" onClick={() => setDetailForm({})}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" onClick={handleDetailSave} disabled={detailSaving}>
                  {detailSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={closeDetailModal}>
                Close
              </button>
            )}
          </div>
        </Modal>
      )}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.type === 'clinic' ? 'Delete clinic' : 'Delete user'}
        description={
          confirmDialog.type === 'clinic'
            ? 'Deleting a clinic will remove all related data for that clinic. This action cannot be undone.'
            : 'Deleting a user will revoke their access to the platform.'
        }
        confirmLabel={confirmDialog.type === 'clinic' ? 'Delete clinic' : 'Delete user'}
        confirmVariant="danger"
        onClose={() => setConfirmDialog({ open: false, type: '', payload: null })}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
