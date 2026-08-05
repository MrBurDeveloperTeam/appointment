import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { todayISO } from '../utils/date';
import { addMinutes } from '../utils/time';
import {
  sanitizeIC,
  sanitizePhone,
  sanitizeName,
  validateNewPatient,
} from '../utils/bookingValidation';
import { filterAvailableSlots } from '../utils/availability';

const emptyPatient = {
  name: '',
  idNumber: '',
  dob: '',
  gender: '',
  taxNumber: '',
  phone: '',
  email: '',
  emailIsGuardian: false,
  guardianName: '',
  guardianRelationship: '',
  address: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  allergies: '',
  medicalConditions: '',
  medications: '',
  source: '',
  preferredDentist: '',
  insurance: '',
  notes: '',
};

const emptyAppointment = {
  date: todayISO(),
  startTime: '09:00',
  duration: 30,
  treatmentId: '',
  notes: '',
};

export default function PublicBookingView({ clinicSlug }) {
  const [clinic, setClinic] = useState(null);
  const [dentists, setDentists] = useState([]);
  const [treatments, setTreatments] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(0);

  const [patientType, setPatientType] = useState('');
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupPatients, setLookupPatients] = useState([]);
  const [lookupPatient, setLookupPatient] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [confirmMatch, setConfirmMatch] = useState(false);

  // -----------------------------
  // Booking OTP (DB + pg_net + Resend)
  // -----------------------------
  const [otpInput, setOtpInput] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpExpiresAt, setOtpExpiresAt] = useState(null);
  const [verificationToken, setVerificationToken] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!cooldownUntil) {
      if (timeLeft > 0) setTimeLeft(0);
      return;
    }

    const updateTimer = () => {
      const diff = new Date(cooldownUntil).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft(0);
        setCooldownUntil(null);
      } else {
        setTimeLeft(Math.ceil(diff / 1000));
      }
    };

    updateTimer(); // Initial update
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [cooldownUntil]);

  const [patient, setPatient] = useState({ ...emptyPatient });
  const [appointment, setAppointment] = useState({ ...emptyAppointment });
  const [fieldErrors, setFieldErrors] = useState({});

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const [busySlots, setBusySlots] = useState([]);
  const [clinicCapacity, setClinicCapacity] = useState(1);

  // -----------------------------
  // Load clinic
  // -----------------------------
  useEffect(() => {
    let isActive = true;
    const loadClinic = async () => {
      setLoading(true);
      setError('');
      const { data, error: loadError } = await supabase
        .from('apt_clinics')
        .select('id, name, slug')
        .eq('slug', clinicSlug)
        .maybeSingle();

      if (!isActive) return;

      if (loadError || !data) {
        setClinic(null);
        setError('Clinic not found. Please check the link.');
        setLoading(false);
        return;
      }

      setClinic(data);
      setLoading(false);
    };

    loadClinic();
    return () => {
      isActive = false;
    };
  }, [clinicSlug]);

  // -----------------------------
  // Load dentists, treatments, settings
  // -----------------------------
  useEffect(() => {
    if (!clinic?.id) return;
    let isActive = true;

    const loadClinicData = async () => {
      const [{ data: dentistData }, { data: treatmentData }, { data: settingsData }] = await Promise.all([
        supabase
          .from('apt_staff')
          .select('id, name, role')
          .eq('clinic_id', clinic.id)
          .eq('role', 'dentist')
          .order('name', { ascending: true }),
        supabase
          .from('apt_treatments')
          .select('id, name, duration')
          .eq('clinic_id', clinic.id)
          .order('name', { ascending: true }),
        supabase
          .from('apt_settings')
          .select('working_hours_start, working_hours_end, slot_duration, rest_days')
          .eq('clinic_id', clinic.id)
          .maybeSingle(),
      ]);

      if (!isActive) return;

      setDentists(dentistData || []);
      setTreatments(treatmentData || []);
      setSettings(settingsData || null);
    };

    loadClinicData();
    return () => {
      isActive = false;
    };
  }, [clinic]);

  // -----------------------------
  // Existing patient lookup
  // -----------------------------
  useEffect(() => {
    let cancelled = false;

    if (patientType !== 'existing') {
      setLookupPatients([]);
      setLookupPatient(null);
      setLookupError('');
      setConfirmMatch(false);
      return;
    }

    const email = lookupEmail.trim().toLowerCase();

    if (!clinic?.id || email.length < 5 || !email.includes('@')) {
      setLookupPatients([]);
      setLookupPatient(null);
      setLookupError('');
      setConfirmMatch(false);
      return;
    }

    setLookupLoading(true);
    setLookupError('');
    setLookupPatients([]);
    setLookupPatient(null);
    setConfirmMatch(false);

    const timer = setTimeout(async () => {
      const { data, error: lookupErr } = await supabase.rpc(
        'lookup_patients_by_email',
        {
          p_clinic_id: clinic.id,
          p_email: email,
        }
      );

      if (cancelled) return;

      if (lookupErr) {
        console.error('Existing patient lookup failed:', lookupErr);
        setLookupPatients([]);
        setLookupPatient(null);
        setLookupError('Unable to verify your email right now.');
        setConfirmMatch(false);
        setLookupLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        setLookupPatients([]);
        setLookupPatient(null);
        setLookupError('No patient record found for this email.');
        setConfirmMatch(false);
        setLookupLoading(false);
        return;
      }

      const patients = data.map((item) => ({
        id: item.id,
        name: item.name,
        phone: item.phone || '',
        email: item.email || '',
        idNumber: item.id_number || '',
        address: item.address || '',
      }));

      setLookupPatients(patients);
      setLookupPatient(null);
      setLookupError('');
      setConfirmMatch(false);
      setLookupLoading(false);
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [clinic, lookupEmail, patientType]);

  // -----------------------------
  // Booking OTP lifecycle:
  // - Leaving existing patient → clear OTP state
  // - Email changes → reset OTP state
  // -----------------------------
  const resetOtpState = () => {
    setOtpInput('');
    setOtpVerified(false);
    setOtpSent(false);
    setOtpError('');
    setOtpExpiresAt(null);
    setVerificationToken('');
    setCooldownUntil(null);
  };

  useEffect(() => {
    if (patientType !== 'existing') {
      resetOtpState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientType]);

  useEffect(() => {
    if (patientType === 'existing') {
      resetOtpState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupEmail]);

  // -----------------------------
  // Auto set duration from treatment
  // -----------------------------
  useEffect(() => {
    if (!appointment.treatmentId) return;
    const selected = treatments.find((t) => String(t.id) === String(appointment.treatmentId));
    if (selected && typeof selected.duration === 'number') {
      setAppointment((prev) => ({ ...prev, duration: selected.duration }));
    }
  }, [appointment.treatmentId, treatments]);

  // -----------------------------
  // Load busy slots for the selected date (capacity-aware availability)
  // -----------------------------
  useEffect(() => {
    if (!clinic?.id || !appointment.date) {
      setBusySlots([]);
      return;
    }
    let isActive = true;
    (async () => {
      const { data, error: rpcError } = await supabase.rpc('booking_busy_slots_text', {
        p_clinic_id: clinic.id,
        p_date: appointment.date,
      });
      if (!isActive) return;
      if (rpcError || !data) {
        // Fail open: show all working-hours slots on error.
        console.error('booking_busy_slots failed:', rpcError);
        setBusySlots([]);
        setClinicCapacity(1);
        return;
      }
      setBusySlots(Array.isArray(data.busy) ? data.busy : []);
      setClinicCapacity(Number(data.capacity) || 1);
    })();
    return () => { isActive = false; };
  }, [clinic, appointment.date]);

  // -----------------------------
  // Calendar month sync
  // -----------------------------
  useEffect(() => {
    if (!appointment.date) return;
    const [year, month] = appointment.date.split('-').map(Number);
    if (!year || !month) return;
    setCalendarMonth(new Date(year, month - 1, 1));
  }, [appointment.date]);

  const toMinutes = (time) => {
    if (!time || !time.includes(':')) return null;
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  const minutesToTime = (minutes) => {
    const h = String(Math.floor(minutes / 60)).padStart(2, '0');
    const m = String(minutes % 60).padStart(2, '0');
    return `${h}:${m}`;
  };

  const formatTimeLabel = (time) => {
    if (!time) return '';
    const [h, m] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m, 0, 0);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const toISODate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

  const calendarDays = useMemo(() => {
    const first = startOfMonth(calendarMonth);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    const days = [];
    for (let i = 0; i < 42; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push({
        date: d,
        inMonth: d.getMonth() === calendarMonth.getMonth(),
        iso: toISODate(d),
      });
    }
    return days;
  }, [calendarMonth]);

  const workingHoursStart = settings?.working_hours_start || '09:00';
  const workingHoursEnd = settings?.working_hours_end || '18:00';
  const slotDuration = settings?.slot_duration || 30;
  const restDays = settings?.rest_days || [];

  const selectedDuration = appointment.duration || slotDuration || 30;

  const isDateDisabled = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const compare = new Date(date);
    compare.setHours(0, 0, 0, 0);
    if (compare < today) return true;
    if (Array.isArray(restDays) && restDays.includes(compare.getDay())) return true;
    return false;
  };

  useEffect(() => {
    if (!settings) return;
    const currentDate = new Date(`${appointment.date}T00:00:00`);
    if (!Number.isNaN(currentDate.getTime()) && !isDateDisabled(currentDate)) return;

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    let found = null;
    for (let i = 0; i < 60; i += 1) {
      const candidate = new Date(start);
      candidate.setDate(start.getDate() + i);
      if (!isDateDisabled(candidate)) {
        found = candidate;
        break;
      }
    }

    if (found) {
      setAppointment((prev) => ({ ...prev, date: toISODate(found) }));
    }
  }, [settings, appointment.date]);

  const availableSlots = useMemo(() => {
    if (!appointment.date) return [];
    const startMinutes = toMinutes(workingHoursStart);
    const endMinutes = toMinutes(workingHoursEnd);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return [];

    const slots = [];
    const today = todayISO();
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const minMinutes = appointment.date === today ? currentMinutes : startMinutes;

    for (let t = startMinutes; t + selectedDuration <= endMinutes; t += slotDuration) {
      if (t < minMinutes) continue;
      slots.push(minutesToTime(t));
    }
    // Capacity 1: a single confirmed appointment disables that slot so patients
    // cannot book a time that is already taken (no public double-booking).
    return filterAvailableSlots(slots, selectedDuration, busySlots, 1);
  }, [appointment.date, selectedDuration, slotDuration, workingHoursStart, workingHoursEnd, busySlots]);

  useEffect(() => {
    if (!appointment.date) return;
    if (!availableSlots.length) return;
    if (!appointment.startTime || !availableSlots.includes(appointment.startTime)) {
      setAppointment((prev) => ({ ...prev, startTime: availableSlots[0] }));
    }
  }, [appointment.date, appointment.startTime, availableSlots]);

  const endTime = useMemo(() => addMinutes(appointment.startTime, appointment.duration), [
    appointment.startTime,
    appointment.duration,
  ]);

  const updatePatient = (field) => (event) => {
    setPatient((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const updatePatientSanitized = (field, sanitizer) => (event) => {
    const clean = sanitizer(event.target.value);
    setPatient((prev) => ({ ...prev, [field]: clean }));
  };

  const updateAppointment = (field) => (event) => {
    setAppointment((prev) => ({ ...prev, [field]: event.target.value }));
  };



  // Map backend error codes to nicer UX
  const mapOtpError = (rpcError, data) => {
    if (rpcError?.message) return rpcError.message;
    const code = data?.error;
    if (!code) return 'Failed to send code. Please try again.';

    if (code === 'cooldown') {
      if (data?.retry_after_seconds) return `Please wait ${data.retry_after_seconds}s before resending.`;
      return 'Please wait a moment before resending.';
    }
    if (code === 'too_many_attempts') return 'Too many attempts. Please request a new code later.';
    if (code === 'invalid_email') return 'Invalid email format.';
    if (code === 'missing_resend_key') return 'Server email key not configured.';
    if (code === 'resend_failed') return 'Email provider rejected the request. Please try again.';
    return `Failed: ${code}`;
  };

  const sendOtp = async () => {
    setError('');
    setOtpError('');

    if (!clinic?.id) {
      setOtpError('Clinic not found.');
      return;
    }

    const email = lookupEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setOtpError('Please enter a valid email first.');
      return;
    }
    if (!lookupPatient) {
      setOtpError('Please make sure your email matches an existing patient record first.');
      return;
    }
    if (!confirmMatch) {
      setOtpError('Please confirm your patient details first.');
      return;
    }

    const cooldownSec = timeLeft;
    if (cooldownSec > 0) {
      setOtpError(`Please wait ${cooldownSec}s before resending.`);
      return;
    }

    setOtpSending(true);
    setOtpSent(false);
    setOtpVerified(false);
    setVerificationToken('');

    // IMPORTANT: call the text wrapper to avoid PostgREST uuid casting issues
    const { data, error: rpcError } = await supabase.rpc('booking_request_otp_text', {
      p_clinic_id: clinic.id, // keep as string uuid
      p_email: email,
    });

    setOtpSending(false);

    if (rpcError || !data?.ok) {
      // server cooldown hint support
      if (data?.error === 'cooldown' && data?.retry_after_seconds) {
        const until = new Date(Date.now() + Number(data.retry_after_seconds) * 1000);
        setCooldownUntil(until.toISOString());
      }
      setOtpError(mapOtpError(rpcError, data));
      // Helpful: if your function returns provider details, you can inspect it:
      // console.log('provider:', data?.provider);
      return;
    }

    if (data?.expires_at) setOtpExpiresAt(data.expires_at);
    setCooldownUntil(new Date(Date.now() + 60 * 1000).toISOString());
    setOtpSent(true);
  };

  const verifyOtp = async () => {
    setError('');
    setOtpError('');

    if (!clinic?.id) {
      setOtpError('Clinic not found.');
      return;
    }

    const email = lookupEmail.trim().toLowerCase();
    const code = otpInput.trim();
    if (!email || !email.includes('@')) {
      setOtpError('Please enter a valid email.');
      return;
    }
    if (!code || code.length !== 6) {
      setOtpError('Please enter the 6-digit code.');
      return;
    }

    setOtpVerifying(true);

    // IMPORTANT: call the text wrapper to avoid PostgREST uuid casting issues
    const { data, error: rpcError } = await supabase.rpc('booking_verify_otp_text', {
      p_clinic_id: clinic.id, // keep as string uuid
      p_email: email,
      p_otp: code,
    });

    setOtpVerifying(false);

    if (rpcError || !data?.ok) {
      setOtpVerified(false);
      const codeErr = data?.error;
      if (codeErr === 'expired') setOtpError('Code expired. Please request a new code.');
      else if (codeErr === 'too_many_attempts') setOtpError('Too many attempts. Please request a new code.');
      else if (codeErr === 'invalid_code') setOtpError('Invalid code.');
      else if (codeErr) setOtpError(`Verification failed: ${codeErr}`);
      else setOtpError(rpcError?.message || 'Invalid code.');
      return;
    }

    setOtpVerified(true);
    setVerificationToken(data.token || '');
  };

  // -----------------------------
  // VALIDATION:
  // Existing patient requires:
  // - valid email
  // - patient found
  // - confirm match
  // - OTP verified (DB)
  // -----------------------------
  const isValidPatientStep = () => {
    if (patientType === 'existing') {
      const email = lookupEmail.trim();

      if (!email) {
        setError('Please enter your email.');
        return false;
      }
      if (!email.includes('@')) {
        setError('Please enter a valid email.');
        return false;
      }
      if (lookupLoading) {
        setError('Checking your email. Please wait.');
        return false;
      }
      if (!lookupPatient) {
        setError(lookupError || 'No patient record found.');
        return false;
      }
      if (!confirmMatch) {
        setError('Please confirm your patient details before continuing.');
        return false;
      }
      if (!otpVerified || !verificationToken) {
        setError('Please verify the code before continuing.');
        return false;
      }
      return true;
    }

    const {
      ok,
      fieldErrors: validationErrors,
    } = validateNewPatient(patient);

    const errs = {
      ...validationErrors,
    };

    let isValid = ok;

    if (patient.emailIsGuardian) {
      if (!patient.guardianName.trim()) {
        errs.guardianName =
          'Parent or guardian name is required.';
        isValid = false;
      }

      if (!patient.guardianRelationship) {
        errs.guardianRelationship =
          'Please select the relationship.';
        isValid = false;
      }
    }

    setFieldErrors(errs);

    if (!isValid) {
      setError(
        'Please complete all required fields correctly.'
      );
      return false;
    }

    return true;
  };

  const isValidAppointmentStep = () => {
    const now = new Date();
    const today = todayISO();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (!appointment.date || !appointment.startTime) {
      setError('Please choose a date and time.');
      return false;
    }

    if (isDateDisabled(new Date(`${appointment.date}T00:00:00`))) {
      setError('Selected date is not available.');
      return false;
    }

    if (appointment.date < today || (appointment.date === today && appointment.startTime <= currentTime)) {
      setError('Please choose a future date and time.');
      return false;
    }

    const startMinutes = toMinutes(workingHoursStart);
    const endMinutes = toMinutes(workingHoursEnd);
    const selectedStart = toMinutes(appointment.startTime);

    if (
      startMinutes === null ||
      endMinutes === null ||
      selectedStart === null ||
      selectedStart < startMinutes ||
      selectedStart + selectedDuration > endMinutes
    ) {
      setError('Selected time is outside clinic working hours.');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    setError('');
    if (step === 0 && !patientType) {
      setError('Please choose new or existing patient.');
      return;
    }
    if (step === 1 && !isValidPatientStep()) return;
    if (step === 2 && !isValidAppointmentStep()) return;
    setStep((prev) => Math.min(prev + 1, 3));
  };

  const handleBack = () => {
    setError('');
    setStep((prev) => Math.max(prev - 1, 0));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess(false);

    if (!clinic) {
      setError('Clinic not found. Please check the link.');
      return;
    }

    if (!patientType) {
      setError('Please choose new or existing patient.');
      return;
    }

    if (!isValidPatientStep() || !isValidAppointmentStep()) return;

    setSubmitting(true);

    const { error: insertError } = await supabase.from('appointment_requests').insert([
      {
        clinic_id: clinic.id,

        patient_id: patientType === 'existing' ? lookupPatient?.id || null : null,
        patient_name: patientType === 'new' ? patient.name.trim() : (lookupPatient?.name || '').trim(),
        phone: patientType === 'new' ? patient.phone.trim() || null : null,
        email: patientType === 'new' ? patient.email.trim().toLowerCase() || null : lookupEmail.trim().toLowerCase(),
        email_is_guardian: patientType === 'new' ? Boolean(patient.emailIsGuardian) : false,
        guardian_name: patientType === 'new' && patient.emailIsGuardian? patient.guardianName.trim() || null : null,
        guardian_relationship: patientType === 'new' && patient.emailIsGuardian ? patient.guardianRelationship || null : null,

        preferred_dates: appointment.date ? [appointment.date] : [],
        preferred_times: appointment.startTime ? [appointment.startTime] : [],
        notes: appointment.notes.trim() || null,

        is_new_patient: patientType === 'new',
        lookup_email: patientType === 'existing' ? lookupEmail.trim().toLowerCase() : null,

        patient_id_number: patientType === 'new' ? patient.idNumber.trim() || null : null,
        patient_dob: patientType === 'new' ? patient.dob || null : null,
        patient_gender: patientType === 'new' ? patient.gender || null : null,
        patient_tax_number: patientType === 'new' ? patient.taxNumber.trim() || null : null,
        patient_address: patientType === 'new' ? patient.address.trim() || null : null,
        emergency_contact_name: patientType === 'new' ? patient.emergencyContactName.trim() || null : null,
        emergency_contact_phone: patientType === 'new' ? patient.emergencyContactPhone.trim() || null : null,
        allergies: patientType === 'new' ? patient.allergies.trim() || null : null,
        medical_conditions: patientType === 'new' ? patient.medicalConditions.trim() || null : null,
        medications: patientType === 'new' ? patient.medications.trim() || null : null,
        source: patientType === 'new' ? patient.source || null : null,
        preferred_dentist_id: patientType === 'new' ? patient.preferredDentist || null : null,
        insurance: patientType === 'new' ? patient.insurance.trim() || null : null,
        patient_notes: patientType === 'new' ? patient.notes.trim() || null : null,

        appointment_date: appointment.date || null,
        appointment_start_time: appointment.startTime || null,
        appointment_duration: appointment.duration || null,
        appointment_treatment_id: appointment.treatmentId || null,
        appointment_notes: appointment.notes.trim() || null,
      },
    ]);

    if (insertError) {
      setError('Failed to submit. Please try again or contact the clinic.');
      setSubmitting(false);
      return;
    }

    setSuccess(true);
    setStep(0);
    setPatientType('');
    setLookupEmail('');
    setLookupPatients([]);
    setLookupPatient(null);
    setConfirmMatch(false);

    // Reset OTP
    resetOtpState();

    setPatient({ ...emptyPatient });
    setAppointment({ ...emptyAppointment });
    setSubmitting(false);
  };

  const selectedTreatment = treatments.find((t) => String(t.id) === String(appointment.treatmentId));
  const selectedDentist = dentists.find((d) => String(d.id) === String(patient.preferredDentist));

  const maskData = (str) => {
    if (!str) return '-';
    if (str.length <= 4) return '***' + str;
    return '***' + str.slice(-4);
  };

  return (
    <div className="booking-page">
      <div className="card booking-card">
        <div className="card-header booking-header">
          <div>
            <h1 className="booking-title">Request an appointment</h1>
            <p className="booking-subtitle">{clinic ? clinic.name : 'Loading clinic info...'}</p>
          </div>
          {clinic?.slug && <span className="booking-badge">{clinic.slug}</span>}
        </div>

        <div className="card-body">
          {loading && (
            <div className="booking-loading">
              <div className="skeleton skeleton-line" style={{ width: '55%' }}></div>
              <div className="skeleton skeleton-row"></div>
              <div className="skeleton skeleton-row"></div>
            </div>
          )}

          {!loading && !clinic && <p className="form-error">{error}</p>}

          {!loading && clinic && success && (
            <div className="booking-success-card">
              <h2>Thank you for the booking</h2>
              <p>We will process your request as soon as possible.</p>
              <button type="button" className="btn btn-primary" onClick={() => setSuccess(false)}>
                Back to booking page
              </button>
            </div>
          )}

          {!loading && clinic && !success && (
            <form className="booking-form" onSubmit={handleSubmit}>
              <div className="booking-steps">
                <div className={`booking-step ${step === 0 ? 'active' : step > 0 ? 'done' : ''}`}>
                  <span>1</span> Patient type
                </div>
                <div className={`booking-step ${step === 1 ? 'active' : step > 1 ? 'done' : ''}`}>
                  <span>2</span> Patient details
                </div>
                <div className={`booking-step ${step === 2 ? 'active' : step > 2 ? 'done' : ''}`}>
                  <span>3</span> Appointment
                </div>
                <div className={`booking-step ${step === 3 ? 'active' : ''}`}>
                  <span>4</span> Review
                </div>
              </div>

              {error && <p className="form-error">{error}</p>}

              {step === 0 && (
                <div className="booking-choice-grid">
                  <button
                    type="button"
                    className={`booking-choice ${patientType === 'new' ? 'active' : ''}`}
                    onClick={() => setPatientType('new')}
                  >
                    <div className="booking-choice-title">New patient</div>
                    <div className="booking-choice-sub">Fill in personal and medical details.</div>
                  </button>

                  <button
                    type="button"
                    className={`booking-choice ${patientType === 'existing' ? 'active' : ''}`}
                    onClick={() => setPatientType('existing')}
                  >
                    <div className="booking-choice-title">Existing patient</div>
                    <div className="booking-choice-sub">Use your email to find your record.</div>
                  </button>
                </div>
              )}

              {step === 1 && patientType === 'existing' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input
                      className="form-input"
                      type="email"
                      value={lookupEmail}
                      onChange={(event) => {
                        setLookupEmail(event.target.value);
                        setLookupPatients([]);
                        setLookupPatient(null);
                        setConfirmMatch(false);
                      }}
                      placeholder="you@example.com"
                      required
                    />
                    {lookupLoading && <div className="form-hint">Checking your record...</div>}
                    {!lookupLoading && lookupError && <div className="form-error">{lookupError}</div>}
                  </div>

                  {lookupPatients.length > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div className="booking-confirm-title">
                        Select patient
                      </div>

                      <p
                        className="booking-subtitle"
                        style={{
                          fontSize: '0.9rem',
                          marginBottom: '1rem',
                        }}
                      >
                        Select the patient who is making this appointment.
                      </p>

                      <div className="booking-choice-grid">
                        {lookupPatients.map((candidate) => (
                          <button
                            key={candidate.id}
                            type="button"
                            className={`booking-choice ${
                              lookupPatient?.id === candidate.id
                                ? 'active'
                                : ''
                            }`}
                            onClick={() => {
                              setLookupPatient(candidate);
                              setConfirmMatch(false);
                              resetOtpState();
                            }}
                          >
                            <div className="booking-choice-title">
                              {candidate.name}
                            </div>

                            <div className="booking-choice-sub">
                              Phone: {maskData(candidate.phone)}
                            </div>

                            <div className="booking-choice-sub">
                              IC/ID: {maskData(candidate.idNumber)}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {lookupPatient && (
                    <div className="booking-confirm-card">
                      <div className="booking-confirm-title">Is this you?</div>
                      <p className="booking-subtitle" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
                        Please verify these details match your records.
                      </p>

                      <div className="booking-confirm-grid">
                        <div className="booking-summary-group">
                          <div className="booking-summary-label">Name</div>
                          <div className="booking-summary-value">{lookupPatient.name}</div>
                        </div>
                        <div className="booking-summary-group">
                          <div className="booking-summary-label">Phone</div>
                          <div className="booking-summary-value">{maskData(lookupPatient.phone)}</div>
                        </div>
                        <div className="booking-summary-group">
                          <div className="booking-summary-label">Email</div>
                          <div className="booking-summary-value">{lookupPatient.email}</div>
                        </div>
                        <div className="booking-summary-group">
                          <div className="booking-summary-label">IC/ID</div>
                          <div className="booking-summary-value">{maskData(lookupPatient.idNumber)}</div>
                        </div>
                        <div className="booking-summary-group">
                          <div className="booking-summary-label">Address</div>
                          <div className="booking-summary-value">{lookupPatient.address || '-'}</div>
                        </div>
                      </div>

                      <label className="booking-confirm-check" style={{ marginTop: '1rem', padding: '0.5rem 0' }}>
                        <input
                          type="checkbox"
                          checked={confirmMatch}
                          onChange={(event) => setConfirmMatch(event.target.checked)}
                          style={{ width: '1.2rem', height: '1.2rem', marginRight: '0.5rem' }}
                        />
                        <span style={{ fontWeight: 500 }}>Yes, this is my record</span>
                      </label>

                      {/* -----------------------------
                          OTP Verification (DB + pg_net + Resend)
                        ------------------------------ */}
                      {confirmMatch && (
                        <div className="otp-verification-container">
                          <label className="form-label" style={{ marginBottom: 'var(--space-sm)' }}>
                            Verification Code
                          </label>
                          <div className="form-hint" style={{ marginBottom: 'var(--space-md)' }}>
                            To protect your data, we need to verify it's really you.
                          </div>

                          <div className="otp-actions">
                            <button
                              type="button"
                              className="otp-btn"
                              onClick={sendOtp}
                              disabled={otpSending || timeLeft > 0 || !confirmMatch}
                            >
                              {otpSending ? 'Sending...' : otpSent ? 'Resend Code' : 'Send Code'}
                            </button>

                            {timeLeft > 0 && <span className="status-pill warning">Wait {timeLeft}s</span>}

                            {otpSent && otpExpiresAt && (
                              <span className="status-pill info">
                                Expires: {new Date(otpExpiresAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                              </span>
                            )}
                          </div>

                          {otpError && (
                            <div className="form-error" style={{ marginBottom: 'var(--space-md)' }}>
                              {otpError}
                            </div>
                          )}

                          {otpSent && !otpVerified && (
                            <div className="otp-verify-group">
                              <input
                                className="form-input otp-input"
                                inputMode="numeric"
                                placeholder="000000"
                                value={otpInput}
                                onChange={(e) => {
                                  const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                                  setOtpInput(v);
                                  setOtpVerified(false);
                                  setVerificationToken('');
                                }}
                              />
                              <button
                                type="button"
                                className="otp-btn otp-verify-btn"
                                onClick={verifyOtp}
                                disabled={otpVerifying || !otpInput || otpInput.length < 6}
                              >
                                {otpVerifying ? '...' : 'Verify'}
                              </button>
                            </div>
                          )}

                          {otpVerified && (
                            <div className="form-hint" style={{
                              marginTop: 'var(--space-md)',
                              color: 'var(--success)',
                              fontWeight: 'var(--font-weight-semibold)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}>
                              <span style={{ fontSize: '1.2rem' }}>✓</span> Verified successfully.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {step === 1 && patientType === 'new' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Name *</label>
                    <input className="form-input" value={patient.name} onChange={updatePatientSanitized('name', sanitizeName)} required />
                    {fieldErrors.name && <div className="form-error">{fieldErrors.name}</div>}
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">IC/ID *</label>
                      <input className="form-input" inputMode="numeric" value={patient.idNumber} onChange={updatePatientSanitized('idNumber', sanitizeIC)} required />
                      {fieldErrors.idNumber && <div className="form-error">{fieldErrors.idNumber}</div>}
                    </div>
                    <div className="form-group">
                      <label className="form-label">DOB *</label>
                      <input className="form-input" type="date" max={todayISO()} value={patient.dob} onChange={updatePatient('dob')} required />
                      {fieldErrors.dob && <div className="form-error">{fieldErrors.dob}</div>}
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Gender *</label>
                      <select className="form-select" value={patient.gender} onChange={updatePatient('gender')} required>
                        <option value="">Select</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                      {fieldErrors.gender && <div className="form-error">{fieldErrors.gender}</div>}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Tax Number</label>
                      <input className="form-input" value={patient.taxNumber} onChange={updatePatient('taxNumber')} />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Phone *</label>
                      <input className="form-input" inputMode="tel" value={patient.phone} onChange={updatePatientSanitized('phone', sanitizePhone)} required />
                      {fieldErrors.phone && <div className="form-error">{fieldErrors.phone}</div>}
                    </div>
                    <div className="form-group">
                      <label className="form-label"> Email * </label>
                      <input className="form-input" type="email" value={patient.email} onChange={updatePatient('email')} required/>
                      {fieldErrors.email && ( <div className="form-error"> {fieldErrors.email} </div> )}

                      <label className="booking-confirm-check"
                        style={{ marginTop: '0.75rem', alignItems: 'flex-start', }}
                      >
                        <input type="checkbox" checked={patient.emailIsGuardian}
                          onChange={(event) => { const checked = event.target.checked;
                            setPatient((previous) => ({
                              ...previous, emailIsGuardian: checked, guardianName: checked
                                ? previous.guardianName
                                : '',
                              guardianRelationship: checked
                                ? previous.guardianRelationship
                                : '',
                            }));

                            setFieldErrors((previous) => ({
                              ...previous, guardianName: '', guardianRelationship: '',
                            }));
                          }}
                          style={{
                            width: '1.2rem',
                            height: '1.2rem',
                            marginRight: '0.5rem',
                            marginTop: '0.1rem',
                          }}
                        />

                        <span>
                          This email belongs to the patient's
                          parent or legal guardian.
                        </span>
                      </label>
                    </div>
                  </div>
                  
                  {patient.emailIsGuardian && (
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label"> Parent / Guardian Name *  </label>

                        <input className="form-input" value={patient.guardianName}
                          onChange={updatePatient( 'guardianName' )} placeholder="Enter full name" required
                        />

                        {fieldErrors.guardianName && (
                          <div className="form-error"> {fieldErrors.guardianName} </div>
                        )}
                      </div>

                      <div className="form-group">
                        <label className="form-label"> Relationship to Patient * </label>

                        <select
                          className="form-select" value={patient.guardianRelationship}
                          onChange={updatePatient( 'guardianRelationship' )} required
                        >
                          <option value="">
                            Select
                          </option>

                          <option value="parent">
                            Parent
                          </option>

                          <option value="legal-guardian">
                            Legal guardian
                          </option>

                          <option value="other-responsible-adult">
                            Other responsible adult
                          </option>
                        </select>

                        {fieldErrors.guardianRelationship && (
                          <div className="form-error">
                            {fieldErrors.guardianRelationship}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">Address *</label>
                    <input className="form-input" value={patient.address} onChange={updatePatient('address')} required />
                    {fieldErrors.address && <div className="form-error">{fieldErrors.address}</div>}
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Emergency Contact Name *</label>
                      <input
                        className="form-input"
                        value={patient.emergencyContactName}
                        onChange={updatePatient('emergencyContactName')}
                        required
                      />
                      {fieldErrors.emergencyContactName && <div className="form-error">{fieldErrors.emergencyContactName}</div>}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Emergency Contact Phone *</label>
                      <input
                        className="form-input"
                        inputMode="tel"
                        value={patient.emergencyContactPhone}
                        onChange={updatePatientSanitized('emergencyContactPhone', sanitizePhone)}
                        required
                      />
                      {fieldErrors.emergencyContactPhone && <div className="form-error">{fieldErrors.emergencyContactPhone}</div>}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Allergies</label>
                    <textarea className="form-textarea" value={patient.allergies} onChange={updatePatient('allergies')} />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Medical Conditions</label>
                    <textarea
                      className="form-textarea"
                      value={patient.medicalConditions}
                      onChange={updatePatient('medicalConditions')}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Medications</label>
                    <textarea
                      className="form-textarea"
                      value={patient.medications}
                      onChange={updatePatient('medications')}
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Source *</label>
                      <select className="form-select" value={patient.source} onChange={updatePatient('source')} required>
                        <option value="">Select</option>
                        <option value="walk-in">Walk-in</option>
                        <option value="call">Call</option>
                        <option value="social-media">Social Media</option>
                        <option value="referral">Referral</option>
                        <option value="phone">Phone</option>
                        <option value="google">Google</option>
                        <option value="website">Website</option>
                        <option value="other">Other</option>
                      </select>
                      {fieldErrors.source && <div className="form-error">{fieldErrors.source}</div>}
                    </div>

                    <div className="form-group">
                      <label className="form-label">Preferred Dentist *</label>
                      <select
                        className="form-select"
                        value={patient.preferredDentist}
                        onChange={updatePatient('preferredDentist')}
                        required
                      >
                        <option value="">Select</option>
                        {dentists.map((dentist) => (
                          <option key={dentist.id} value={dentist.id}>
                            {dentist.name}
                          </option>
                        ))}
                      </select>
                      {fieldErrors.preferredDentist && <div className="form-error">{fieldErrors.preferredDentist}</div>}
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Insurance</label>
                      <input className="form-input" value={patient.insurance} onChange={updatePatient('insurance')} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Notes</label>
                      <textarea className="form-textarea" value={patient.notes} onChange={updatePatient('notes')} />
                    </div>
                  </div>
                </>
              )}

              {/* Step 2 + Step 3 remain unchanged (your code) */}
              {step === 2 && (
                <>
                  <div className="booking-datetime">
                    <div className="booking-calendar">
                      <div className="booking-calendar-header">
                        <div className="booking-calendar-title">
                          {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </div>
                        <div className="booking-calendar-nav">
                          <button
                            type="button"
                            className="calendar-nav-btn"
                            onClick={() =>
                              setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))
                            }
                            aria-label="Previous month"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="15 18 9 12 15 6" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="calendar-nav-btn"
                            onClick={() =>
                              setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))
                            }
                            aria-label="Next month"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      <div className="booking-calendar-grid">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                          <div key={day} className="booking-calendar-weekday">
                            {day}
                          </div>
                        ))}

                        {calendarDays.map((day) => {
                          const disabled = isDateDisabled(day.date);
                          const isSelected = appointment.date === day.iso;
                          return (
                            <button
                              key={day.iso}
                              type="button"
                              className={`booking-calendar-day ${day.inMonth ? '' : 'muted'} ${isSelected ? 'selected' : ''}`}
                              onClick={() => {
                                if (disabled) return;
                                setAppointment((prev) => ({ ...prev, date: day.iso }));
                              }}
                              disabled={disabled}
                              aria-label={day.date.toDateString()}
                            >
                              {day.date.getDate()}
                            </button>
                          );
                        })}
                      </div>

                      <div className="booking-calendar-footnote">
                        Working hours: {workingHoursStart} - {workingHoursEnd}
                      </div>
                    </div>

                    <div className="booking-times">
                      <div className="booking-times-header">
                        <div className="booking-times-title">
                          {appointment.date
                            ? new Date(`${appointment.date}T00:00:00`).toLocaleDateString('en-US', {
                              weekday: 'long',
                              month: 'long',
                              day: 'numeric',
                            })
                            : 'Select a date'}
                        </div>
                        <div className="booking-times-subtitle">{selectedDuration} min appointment</div>
                      </div>

                      <div className="booking-times-list">
                        {availableSlots.length === 0 && (
                          <div className="booking-times-empty">No times available for this date.</div>
                        )}
                        {availableSlots.map((slot) => (
                          <button
                            key={slot}
                            type="button"
                            className={`booking-time-slot ${appointment.startTime === slot ? 'selected' : ''}`}
                            onClick={() => setAppointment((prev) => ({ ...prev, startTime: slot }))}
                          >
                            {formatTimeLabel(slot)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Treatment</label>
                      <select
                        className="form-select"
                        value={appointment.treatmentId}
                        onChange={updateAppointment('treatmentId')}
                      >
                        <option value="">None</option>
                        {treatments.map((treatment) => (
                          <option key={treatment.id} value={treatment.id}>
                            {treatment.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Duration (mins)</label>
                      <input
                        className="form-input"
                        type="number"
                        min="10"
                        step="5"
                        value={appointment.duration}
                        onChange={(event) =>
                          setAppointment((prev) => ({
                            ...prev,
                            duration: Number(event.target.value),
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Appointment Notes</label>
                    <textarea className="form-textarea" value={appointment.notes} onChange={updateAppointment('notes')} />
                  </div>
                </>
              )}

              {step === 3 && (
                <div className="booking-summary">
                  <div className="booking-summary-section">
                    <h3>Patient details</h3>
                    <div className="booking-summary-grid">
                      <div>
                        <div className="booking-summary-label">Name</div>
                        <div>
                          {patientType === 'new'
                            ? patient.name || '-'
                            : lookupPatient?.name || '-'}
                        </div>
                      </div>
                      {patientType === 'new' &&
                          patient.emailIsGuardian && (
                            <>
                              <div>
                                <div className="booking-summary-label"> Email Owner </div>
                                <div> Parent / Legal Guardian </div>
                              </div>

                              <div>
                                <div className="booking-summary-label"> Guardian Name </div>
                                <div> {patient.guardianName || '-'} </div>
                              </div>

                              <div>
                                <div className="booking-summary-label"> Relationship </div>
                                <div>
                                  {patient.guardianRelationship ===
                                  'parent'
                                    ? 'Parent'
                                    : patient.guardianRelationship ===
                                        'legal-guardian'
                                      ? 'Legal guardian'
                                      : patient.guardianRelationship ===
                                          'other-responsible-adult'
                                        ? 'Other responsible adult'
                                        : '-'}
                                </div>
                              </div>
                            </>
                          )}
                      <div>
                        <div className="booking-summary-label">Phone</div>
                        <div>
                          {patientType === 'new'
                            ? patient.phone || '-'
                            : maskData(lookupPatient?.phone)}
                        </div>
                      </div>
                      <div>
                        <div className="booking-summary-label">Email</div>
                        <div>{patientType === 'new' ? patient.email || '-' : lookupEmail || '-'}</div>
                      </div>
                      <div>
                        <div className="booking-summary-label">IC/ID</div>
                        <div>
                          {patientType === 'new'
                            ? patient.idNumber || '-'
                            : maskData(lookupPatient?.idNumber)}
                        </div>
                      </div>
                      <div>
                        <div className="booking-summary-label">DOB</div>
                        <div>{patientType === 'new' ? patient.dob || '-' : '-'}</div>
                      </div>
                      <div>
                        <div className="booking-summary-label">Gender</div>
                        <div>{patientType === 'new' ? patient.gender || '-' : '-'}</div>
                      </div>
                      <div>
                        <div className="booking-summary-label">Preferred Dentist</div>
                        <div>
                          {patientType === 'new' ? (selectedDentist ? selectedDentist.name : 'No preference') : '-'}
                        </div>
                      </div>
                      <div>
                        <div className="booking-summary-label">Source</div>
                        <div>{patientType === 'new' ? patient.source || '-' : '-'}</div>
                      </div>
                    </div>
                  </div>

                  <div className="booking-summary-section">
                    <h3>Appointment details</h3>
                    <div className="booking-summary-grid">
                      <div>
                        <div className="booking-summary-label">Date</div>
                        <div>{appointment.date || '-'}</div>
                      </div>
                      <div>
                        <div className="booking-summary-label">Time</div>
                        <div>{appointment.startTime ? `${appointment.startTime} - ${endTime}` : '-'}</div>
                      </div>
                      <div>
                        <div className="booking-summary-label">Treatment</div>
                        <div>{selectedTreatment ? selectedTreatment.name : 'None'}</div>
                      </div>
                      <div>
                        <div className="booking-summary-label">Duration</div>
                        <div>{appointment.duration ? `${appointment.duration} mins` : '-'}</div>
                      </div>
                      <div>
                        <div className="booking-summary-label">Notes</div>
                        <div>{appointment.notes || '-'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="booking-actions">
                {step > 0 && (
                  <button className="btn btn-secondary btn-lg" type="button" onClick={handleBack}>
                    Back
                  </button>
                )}
                {step < 3 && (
                  <button className="btn btn-primary btn-lg" type="button" onClick={handleNext}>
                    Next
                  </button>
                )}
                {step === 3 && (
                  <button className="btn btn-primary btn-lg" type="submit" disabled={submitting}>
                    {submitting ? 'Submitting...' : 'Submit request'}
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
