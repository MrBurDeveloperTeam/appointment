import { createClient } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import * as Clinics from "./datastore.supabase.clinics";
import * as Profiles from "./datastore.supabase.profiles";
import * as Patients from "./datastore.supabase.patients";
import * as Staff from "./datastore.supabase.staff";
import * as Rooms from "./datastore.supabase.rooms";
import * as Treatments from "./datastore.supabase.treatments";
import * as Settings from "./datastore.supabase.settings";
import * as Holidays from "./datastore.supabase.holidays";
import * as Appointments from "./datastore.supabase.appointments";
import * as Activity from "./datastore.supabase.activity";
import * as Requests from "./datastore.supabase.requests";

const ACTIVE_CLINIC_KEY = "appointmentApp_activeClinic";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getClinicId = (clinicId) => clinicId || DataStore.getActiveClinicId();
const requireActiveClinic = (clinicId) => {
  if (!clinicId) {
    throw new Error("No active clinic set. Assign profiles.clinic_id and refresh.");
  }
  return clinicId;
};

const DataStore = {
  useSupabase: true,
  canCreateUsers: import.meta.env.VITE_ENABLE_ADMIN_CREATE_USERS === "true",

  init() { },

  clearLegacyLocalData() {
    const prefix = "appointmentApp_";
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        localStorage.removeItem(key);
      }
    }
    localStorage.removeItem("auth");
    localStorage.removeItem("authRole");
  },

  getActiveClinicId() {
    const stored = localStorage.getItem(ACTIVE_CLINIC_KEY);
    if (!stored) return null;
    if (!uuidPattern.test(stored)) {
      localStorage.removeItem(ACTIVE_CLINIC_KEY);
      return null;
    }
    return stored;
  },

  setActiveClinicId(clinicId) {
    if (clinicId) {
      localStorage.setItem(ACTIVE_CLINIC_KEY, clinicId);
    } else {
      localStorage.removeItem(ACTIVE_CLINIC_KEY);
    }
  },

  // ============ CLINICS ============
  async getClinics() {
    return Clinics.getClinics();
  },

  async getClinicById(id) {
    return Clinics.getClinicById(id);
  },

  async addClinic(clinic) {
    const created = await Clinics.addClinic(clinic);
    await Activity.addAdminActivity({
      type: "clinic_added",
      description: `Added clinic: ${created.name}`,
    });
    return created;
  },

  async updateClinic(id, updates) {
    const updated = await Clinics.updateClinic(id, updates);
    await Activity.addAdminActivity({
      type: "clinic_updated",
      description: `Updated clinic: ${updated.name}`,
    });
    return updated;
  },

  async deleteClinic(id) {
    await Clinics.deleteClinic(id);
    await Activity.addAdminActivity({
      type: "clinic_deleted",
      description: `Deleted clinic: ${id}`,
    });
    return true;
  },

  async getClinicStats(clinicId) {
    const activeClinic = getClinicId(clinicId);
    if (!activeClinic) {
      return { patients: 0, appointments: 0, staff: 0, rooms: 0, treatments: 0 };
    }
    const [patients, appointments, staff, rooms, treatments] = await Promise.all([
      Patients.getPatients(activeClinic),
      Appointments.getAppointments(activeClinic),
      Staff.getStaff(activeClinic),
      Rooms.getRooms(activeClinic),
      Treatments.getTreatments(activeClinic),
    ]);
    return {
      patients: patients.length,
      appointments: appointments.length,
      staff: staff.length,
      rooms: rooms.length,
      treatments: treatments.length,
    };
  },

  // ============ USERS (PROFILES) ============
  async getUsers() {
    return Profiles.getProfiles();
  },

  async addUser(user) {
    if (!DataStore.canCreateUsers) {
      throw new Error("Enable VITE_ENABLE_ADMIN_CREATE_USERS to allow admin signups.");
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: "sb-admin-signup",
      },
    });

    const email = (user.username || user.email || "").trim().toLowerCase();
    const password = user.password;
    const fullName = user.name || "";
    if (!email) {
      throw new Error("Email is required.");
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error("Email address is invalid.");
    }

    const { data: signUpData, error: signUpError } = await authClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (signUpError) throw signUpError;
    if (!signUpData?.user?.id) {
      throw new Error("Signup succeeded but no user ID returned.");
    }

    return {
      id: signUpData.user.id,
      email,
      name: fullName,
      status: "pending",
    };
  },

  async updateUser(id, updates) {
    return Profiles.updateProfile(id, {
      email: updates.email || updates.username,
      fullName: updates.name,
      role: updates.role,
      clinicId: updates.clinicId || null,
      status: updates.status,
    });
  },

  async deleteUser(id) {
    return Profiles.deactivateProfile(id);
  },

  async getAdminActivity() {
    return Activity.getAdminActivity();
  },

  async getAdminDashboardSummary() {
    const { data, error } = await supabase.rpc("admin_dashboard_summary");
    if (error) throw error;
    const payload = data || {};
    const summaryByClinicId = {};
    (payload.clinics || []).forEach((c) => {
      const s = c.settings || {};
      summaryByClinicId[c.clinic_id] = {
        patients: c.counts?.patients ?? 0,
        appointments: c.counts?.appointments ?? 0,
        staff: c.counts?.staff ?? 0,
        rooms: c.counts?.rooms ?? 0,
        treatments: c.counts?.treatments ?? 0,
        settings: {
          clinicName: s.clinic_name || "Dental Clinic",
          workingHours: { start: s.working_hours_start || "09:00", end: s.working_hours_end || "18:00" },
          slotDuration: s.slot_duration || 30,
          phone: s.phone || "-",
        },
      };
    });
    const monthlyTrend = (payload.monthly_trend || []).map((m) => ({
      month: m.month,
      count: m.count,
    }));
    const sb = payload.status_breakdown || {};
    const statusBreakdown = {
      confirmed: sb.confirmed ?? 0,
      completed: sb.completed ?? 0,
      cancelled: sb.cancelled ?? 0,
    };
    return { summaryByClinicId, monthlyTrend, statusBreakdown };
  },

  async logAdminActivity(type, description) {
    return Activity.addAdminActivity({ type, description });
  },

  // ============ PATIENTS ============
  async getPatients(clinicId, limit = 50, offset = 0) {
    const activeClinic = getClinicId(clinicId);
    if (!activeClinic) return [];
    return Patients.getPatients(activeClinic, limit, offset);
  },

  async addPatient(patient) {
    const activeClinic = requireActiveClinic(getClinicId());
    const created = await Patients.addPatient(activeClinic, patient);
    await Activity.addActivityLog(activeClinic, {
      type: "patient_added",
      description: `Added patient: ${created.name}`,
    });
    return created;
  },

  async updatePatient(id, updates) {
    const activeClinic = requireActiveClinic(getClinicId());
    const updated = await Patients.updatePatient(id, updates);
    await Activity.addActivityLog(activeClinic, {
      type: "patient_updated",
      description: `Updated patient: ${updated.name}`,
    });
    return updated;
  },

  async deletePatient(id) {
    const activeClinic = requireActiveClinic(getClinicId());
    const patient = await Patients.getPatientById(id).catch(() => null);
    await Patients.deletePatient(id);
    if (patient) {
      await Activity.addActivityLog(activeClinic, {
        type: "patient_deleted",
        description: `Deleted patient: ${patient.name}`,
      });
    }
    return true;
  },

  async getPatientById(id) {
    return Patients.getPatientById(id);
  },

  async searchPatients(query) {
    const activeClinic = getClinicId();
    if (!activeClinic) return [];
    return Patients.searchPatients(activeClinic, query);
  },

  // ============ APPOINTMENTS ============
  async getAppointments(clinicId, startDate, endDate) {
    const activeClinic = getClinicId(clinicId);
    if (!activeClinic) return [];
    return Appointments.getAppointments(activeClinic, startDate, endDate);
  },

  async addAppointment(appointment) {
    const activeClinic = requireActiveClinic(getClinicId());
    const created = await Appointments.addAppointment(activeClinic, appointment);
    const patient = appointment.patientId ? await Patients.getPatientById(appointment.patientId).catch(() => null) : null;
    await Activity.addActivityLog(activeClinic, {
      type: "appointment_added",
      description: `New appointment: ${patient?.name || "Unknown"} on ${appointment.date} at ${appointment.startTime}`,
    });
    return created;
  },

  async updateAppointment(id, updates) {
    const activeClinic = requireActiveClinic(getClinicId());
    const updated = await Appointments.updateAppointment(id, updates);
    await Activity.addActivityLog(activeClinic, {
      type: "appointment_updated",
      description: `Updated appointment: ${updated.date} at ${updated.startTime}`,
    });
    return updated;
  },

  async deleteAppointment(id) {
    const activeClinic = requireActiveClinic(getClinicId());
    const apt = await Appointments.getAppointments(activeClinic).then((list) => list.find((a) => a.id === id)).catch(() => null);
    await Appointments.deleteAppointment(id);
    if (apt) {
      await Activity.addActivityLog(activeClinic, {
        type: "appointment_deleted",
        description: `Deleted appointment: ${apt.date} at ${apt.startTime}`,
      });
    }
    return true;
  },

  // ============ REQUESTS ============
  async getAppointmentRequests(clinicId) {
    const activeClinic = getClinicId(clinicId);
    if (!activeClinic) return [];
    return Requests.getAppointmentRequests(activeClinic);
  },

  async updateAppointmentRequest(id, updates) {
    const activeClinic = requireActiveClinic(getClinicId());
    const updated = await Requests.updateAppointmentRequest(id, {
      ...updates,
      reviewedAt: updates.reviewedAt || new Date().toISOString(),
    });
    await Activity.addActivityLog(activeClinic, {
      type: "request_updated",
      description: `Updated request: ${updated.patientName || updated.id} (${updated.status})`,
    });
    return updated;
  },

  // ============ ROOMS ============
  async getRooms(clinicId) {
    const activeClinic = getClinicId(clinicId);
    if (!activeClinic) return [];
    return Rooms.getRooms(activeClinic);
  },

  async addRoom(room) {
    const activeClinic = requireActiveClinic(getClinicId());
    const created = await Rooms.addRoom(activeClinic, room);
    await Activity.addActivityLog(activeClinic, {
      type: "room_added",
      description: `Added room: ${created.name}`,
    });
    return created;
  },

  async updateRoom(id, updates) {
    return Rooms.updateRoom(id, updates);
  },

  async deleteRoom(id) {
    return Rooms.deleteRoom(id);
  },

  // ============ TREATMENTS ============
  async getTreatments(clinicId) {
    const activeClinic = getClinicId(clinicId);
    if (!activeClinic) return [];
    return Treatments.getTreatments(activeClinic);
  },

  async addTreatment(treatment) {
    const activeClinic = requireActiveClinic(getClinicId());
    return Treatments.addTreatment(activeClinic, treatment);
  },

  async updateTreatment(id, updates) {
    return Treatments.updateTreatment(id, updates);
  },

  async deleteTreatment(id) {
    return Treatments.deleteTreatment(id);
  },

  // ============ STAFF ============
  async getStaff(clinicId) {
    const activeClinic = getClinicId(clinicId);
    if (!activeClinic) return [];
    return Staff.getStaff(activeClinic);
  },

  async addStaff(staffMember) {
    const activeClinic = requireActiveClinic(getClinicId());
    const created = await Staff.addStaff(activeClinic, staffMember);
    await Activity.addActivityLog(activeClinic, {
      type: "staff_added",
      description: `Added ${created.role}: ${created.name}`,
    });
    return created;
  },

  async updateStaff(id, updates) {
    const activeClinic = requireActiveClinic(getClinicId());
    const updated = await Staff.updateStaff(id, updates);
    await Activity.addActivityLog(activeClinic, {
      type: "staff_updated",
      description: `Updated staff: ${updated.name}`,
    });
    return updated;
  },

  async deleteStaff(id) {
    const activeClinic = requireActiveClinic(getClinicId());
    const member = await Staff.getStaff(activeClinic).then((list) => list.find((s) => s.id === id)).catch(() => null);
    await Staff.deleteStaff(id);
    await Activity.addActivityLog(activeClinic, {
      type: "staff_deleted",
      description: `Deleted staff: ${member?.name || id}`,
    });
    return true;
  },

  async getDentists() {
    const staff = await DataStore.getStaff();
    return staff.filter((s) => s.role === "dentist");
  },

  async getNurses() {
    const staff = await DataStore.getStaff();
    return staff.filter((s) => s.role === "nurse");
  },

  async getStaffByRole(role) {
    const staff = await DataStore.getStaff();
    return staff.filter((s) => s.role === role);
  },

  // ============ HOLIDAYS ============
  async getHolidays(clinicId) {
    const activeClinic = getClinicId(clinicId);
    if (!activeClinic) return [];
    return Holidays.getHolidays(activeClinic);
  },

  async addHoliday(holiday) {
    const activeClinic = requireActiveClinic(getClinicId());
    const created = await Holidays.addHoliday(activeClinic, holiday);
    await Activity.addActivityLog(activeClinic, {
      type: "holiday_added",
      description: `Added holiday: ${created.name}`,
    });
    return created;
  },

  async saveHolidays(list) {
    const activeClinic = requireActiveClinic(getClinicId());
    const payload = (list || []).map((holiday) => ({
      clinic_id: activeClinic,
      name: holiday.name,
      start_date: holiday.startDate,
      end_date: holiday.endDate || holiday.startDate,
      type: holiday.type || "public",
      is_public: holiday.isPublic || false,
    }));
    const { error: deleteError } = await supabase.from("holidays").delete().eq("clinic_id", activeClinic);
    if (deleteError) throw deleteError;
    if (payload.length) {
      const { error: insertError } = await supabase.from("holidays").insert(payload);
      if (insertError) throw insertError;
    }
    await Activity.addActivityLog(activeClinic, {
      type: "holiday_bulk_saved",
      description: `Saved ${payload.length} holidays`,
    });
    return true;
  },

  async updateHoliday(id, updates) {
    const activeClinic = requireActiveClinic(getClinicId());
    const updated = await Holidays.updateHoliday(id, updates);
    await Activity.addActivityLog(activeClinic, {
      type: "holiday_updated",
      description: `Updated holiday: ${updated.name}`,
    });
    return updated;
  },

  async deleteHoliday(id) {
    const activeClinic = requireActiveClinic(getClinicId());
    await Holidays.deleteHoliday(id);
    await Activity.addActivityLog(activeClinic, {
      type: "holiday_deleted",
      description: `Deleted holiday: ${id}`,
    });
    return true;
  },

  // ============ SETTINGS ============
  async getSettings(clinicId) {
    const activeClinic = getClinicId(clinicId);
    if (!activeClinic) return null;
    return Settings.getSettings(activeClinic);
  },

  async saveSettings(settings, clinicId) {
    const activeClinic = requireActiveClinic(getClinicId(clinicId));
    return Settings.saveSettings(activeClinic, settings);
  },

  // ============ ACTIVITY LOG ============
  async getActivityLog(clinicId) {
    const activeClinic = getClinicId(clinicId);
    if (!activeClinic) return [];
    return Activity.getActivityLog(activeClinic);
  },

  async logActivity(type, description) {
    const activeClinic = requireActiveClinic(getClinicId());
    return Activity.addActivityLog(activeClinic, { type, description });
  },

  // ============ UTIL ============
  async clearAllData() {
    const activeClinic = requireActiveClinic(getClinicId());
    const tables = [
      "appointments",
      "appointment_requests",
      "patients",
      "staff",
      "rooms",
      "treatments",
      "settings",
      "holidays",
      "activity_log",
    ];
    for (const table of tables) {
      const { error } = await supabase.from(table).delete().eq("clinic_id", activeClinic);
      if (error) throw error;
    }
    return true;
  },

  async exportData() {
    const activeClinic = getClinicId();
    if (!activeClinic) return null;
    const [
      patients,
      appointments,
      rooms,
      treatments,
      settings,
      staff,
      holidays,
      activityLog,
    ] = await Promise.all([
      Patients.getPatients(activeClinic),
      Appointments.getAppointments(activeClinic),
      Rooms.getRooms(activeClinic),
      Treatments.getTreatments(activeClinic),
      Settings.getSettings(activeClinic),
      Staff.getStaff(activeClinic),
      Holidays.getHolidays(activeClinic),
      Activity.getActivityLog(activeClinic),
    ]);
    return {
      patients,
      appointments,
      rooms,
      treatments,
      settings,
      staff,
      holidays,
      activityLog,
      exportedAt: new Date().toISOString(),
    };
  },

  async importData(data) {
    const activeClinic = getClinicId();
    if (!activeClinic) return null;

    const insert = async (table, rows) => {
      if (!rows || !rows.length) return;
      const { error } = await supabase.from(table).upsert(rows, { onConflict: "id" });
      if (error) throw error;
    };

    await insert(
      "rooms",
      (data.rooms || []).map((r) => ({
        id: r.id,
        clinic_id: activeClinic,
        name: r.name,
        color: r.color || null,
      }))
    );

    await insert(
      "treatments",
      (data.treatments || []).map((t) => ({
        id: t.id,
        clinic_id: activeClinic,
        name: t.name,
        duration: t.duration || null,
        color: t.color || null,
        supplies_needed: t.suppliesNeeded || [],
      }))
    );

    await insert(
      "staff",
      (data.staff || []).map((s) => ({
        id: s.id,
        clinic_id: activeClinic,
        role: s.role,
        name: s.name,
        phone: s.phone || null,
        color: s.color || null,
        specialty: s.specialty || null,
        working_days: s.workingDays || [],
        start_time: s.startTime || null,
        end_time: s.endTime || null,
        assigned_to: s.assignedTo || null,
      }))
    );

    await insert(
      "patients",
      (data.patients || []).map((p) => ({
        id: p.id,
        clinic_id: activeClinic,
        name: p.name,
        phone: p.phone || null,
        email: p.email || null,
        id_number: p.idNumber || null,
        address: p.address || null,
        legacy_id: p.legacy_id || p.legacyId || null,
      }))
    );

    await insert(
      "appointments",
      (data.appointments || []).map((a) => ({
        id: a.id,
        clinic_id: activeClinic,
        patient_id: a.patientId || null,
        dentist_id: a.dentistId || null,
        room_id: a.roomId || null,
        treatment_id: a.treatmentId || null,
        date: a.date,
        start_time: a.startTime,
        end_time: a.endTime || null,
        duration: a.duration || null,
        status: a.status || null,
        notes: a.notes || null,
      }))
    );

    if (data.settings) {
      const payload = {
        clinic_id: activeClinic,
        clinic_name: data.settings.clinicName || null,
        working_hours_start: data.settings.workingHours?.start || null,
        working_hours_end: data.settings.workingHours?.end || null,
        slot_duration: data.settings.slotDuration || null,
        rest_days: data.settings.restDays || [],
        updated_at: new Date().toISOString(),
      };
      if (data.settings.id) {
        payload.id = data.settings.id;
      }
      const { error } = await supabase
        .from("settings")
        .upsert(payload, { onConflict: "clinic_id" });
      if (error) throw error;
    }

    await insert(
      "holidays",
      (data.holidays || []).map((h) => ({
        id: h.id,
        clinic_id: activeClinic,
        name: h.name,
        start_date: h.startDate,
        end_date: h.endDate || h.startDate,
        type: h.type || null,
        is_public: h.isPublic || false,
      }))
    );

    return true;
  },
};

export default DataStore;
