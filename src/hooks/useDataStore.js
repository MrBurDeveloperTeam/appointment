import { useEffect, useState, useRef } from 'react';
import DataStore from '../data';

// Data hook wrapping DataStore (localStorage/Supabase)
export default function useDataStore(activeClinicId, enabled = true) {
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [treatments, setTreatments] = useState([]);
  const [settings, setSettings] = useState(null);
  const [activity, setActivity] = useState([]);
  const [staff, setStaff] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [appointmentRequests, setAppointmentRequests] = useState([]);
  const [activeClinicData, setActiveClinicData] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  // Phase-3 Data-Driven Chat readiness: the existing appointment fetch
  // below has no loading/error distinction today (a failed query only
  // `console.error`s and leaves `appointments` at its previous value) —
  // `[]` cannot tell "still loading"/"query failed" apart from
  // "successfully empty". `loadedAppointmentRange` is the range that was
  // ACTUALLY fetched successfully, set together with a successful
  // result — distinct from `dateRange` (the currently REQUESTED range,
  // which may already have moved on to a new value while a fetch for an
  // older range is still in flight or just failed).
  const [appointmentDataStatus, setAppointmentDataStatus] = useState('loading');
  const [loadedAppointmentRange, setLoadedAppointmentRange] = useState({ start: null, end: null });
  // Shared latest-request-wins generation counter for appointment data.
  // Both the dateRange-keyed fetch effect below AND `refreshAppointments`
  // (called imperatively after appointment mutations) write to
  // `appointments`/`appointmentDataStatus`/`loadedAppointmentRange` —
  // without a SINGLE shared counter, an older in-flight request from
  // either flow could resolve after a newer one and overwrite current
  // state with stale data (or a stale loading->error/ready flip). Every
  // fetch increments this ref when it STARTS; only the fetch whose
  // captured id still matches `appointmentRequestIdRef.current` when it
  // resolves is allowed to write state. Also bumped on clinic
  // change/clear (see the static-data effect below) so a late response
  // from a since-abandoned clinic can never repopulate state — a privacy
  // boundary, not just UI correctness.
  const appointmentRequestIdRef = useRef(0);
  // MOCK CREDIT SYSTEM
  const [credits, setCredits] = useState(5);
  const [creditHistory, setCreditHistory] = useState([
    { date: new Date().toISOString(), description: 'Initial Balance', amount: 5 }
  ]);

  const toPromise = (value) => (value && typeof value.then === 'function' ? value : Promise.resolve(value));

  const handleAsync = (maybePromise, onSuccess) =>
    toPromise(maybePromise)
      .then((result) => {
        onSuccess(result);
        return result;
      })
      .catch((error) => {
        console.error('DataStore error:', error);
        return null;
      });

  useEffect(() => {
    let cancelled = false;

    // Invalidate any appointment request (main fetch OR
    // refreshAppointments) still in flight for a clinic/enabled state
    // this effect is about to move away from — runs on every
    // activeClinicId/enabled change, including a clear-to-null
    // transition, regardless of which branch below actually executes.
    appointmentRequestIdRef.current += 1;

    // Load everything EXCEPT appointments on initial load or clinic change
    const loadStatic = async () => {
      if (!enabled) return;

      // If clinic changes, we need to reset everything
      if (activeClinicId) {
        DataStore.setActiveClinicId(activeClinicId);
      } else {
        setPatients([]);
        setAppointments([]);
        setRooms([]);
        setTreatments([]);
        setSettings(null);
        setActivity([]);
        setStaff([]);
        setHolidays([]);
        setAppointmentRequests([]);
        setActiveClinicData(null);
        // Clinic cleared/switched — a stale previous clinic's appointment
        // readiness must never authorize a Data Chat answer.
        setAppointmentDataStatus('loading');
        setLoadedAppointmentRange({ start: null, end: null });
        return;
      }

      // Fetch static data
      const results = await Promise.allSettled([
        toPromise(DataStore.getClinicById(activeClinicId)),
        toPromise(DataStore.getPatients()),
        toPromise(DataStore.getRooms()),
        toPromise(DataStore.getTreatments()),
        toPromise(DataStore.getSettings()),
        toPromise(DataStore.getActivityLog()),
        toPromise(DataStore.getStaff()),
        toPromise(DataStore.getHolidays()),
        toPromise(DataStore.getAppointmentRequests()),
      ]);

      if (cancelled) return;

      const getValue = (index, fallback) =>
        results[index].status === 'fulfilled' ? results[index].value ?? fallback : fallback;

      setActiveClinicData(getValue(0, null));
      setPatients(getValue(1, []));
      setRooms(getValue(2, []));
      setTreatments(getValue(3, []));
      setSettings(getValue(4, null));
      setActivity(getValue(5, []));
      setStaff(getValue(6, []));
      setHolidays(getValue(7, []));
      setAppointmentRequests(getValue(8, []));
      setIsReady(true);
    };

    loadStatic().catch(console.error);

    return () => { cancelled = true; };
  }, [activeClinicId, enabled]);

  // Separate effect for Appointments that depends on dateRange
  useEffect(() => {
    let cancelled = false;
    if (!enabled || !activeClinicId || !dateRange.start) return;

    // Captured now (not re-read after the await) so a successful result
    // records the range that was ACTUALLY requested for this fetch, even
    // if `dateRange` has already moved on by the time it resolves.
    const requestedRange = { start: dateRange.start, end: dateRange.end };
    // Latest-request-wins: this fetch owns generation `requestId` for as
    // long as it remains the most recently STARTED appointment request
    // (main fetch or refreshAppointments) — see the ref's own comment.
    const requestId = ++appointmentRequestIdRef.current;
    setAppointmentDataStatus('loading');

    const isStale = () => cancelled || requestId !== appointmentRequestIdRef.current;

    const loadAppointments = async () => {
      try {
        const data = await DataStore.getAppointments(activeClinicId, requestedRange.start, requestedRange.end);
        if (isStale()) return;
        setAppointments(data || []);
        setAppointmentDataStatus('ready');
        setLoadedAppointmentRange(requestedRange);
      } catch (err) {
        console.error("Failed to load appointments", err);
        if (!isStale()) setAppointmentDataStatus('error');
      }
    };

    loadAppointments();
    return () => { cancelled = true; };
  }, [activeClinicId, enabled, dateRange]);

  const refreshAppointments = () => {
    const requestedRange = { start: dateRange.start, end: dateRange.end };
    // Shares the SAME generation counter as the main dateRange fetch
    // effect above — one request domain, so whichever of the two flows
    // started most recently is the only one allowed to write state,
    // regardless of which resolves first.
    const requestId = ++appointmentRequestIdRef.current;
    toPromise(DataStore.getAppointments(activeClinicId, dateRange.start, dateRange.end))
      .then((data) => {
        if (requestId !== appointmentRequestIdRef.current) return;
        setAppointments(data || []);
        setAppointmentDataStatus('ready');
        setLoadedAppointmentRange(requestedRange);
      })
      .catch((error) => {
        console.error('DataStore error:', error);
        if (requestId !== appointmentRequestIdRef.current) return;
        setAppointmentDataStatus('error');
      });
  };
  const refreshPatients = () => handleAsync(DataStore.getPatients(), (data) => setPatients(data || []));
  const refreshRooms = () => handleAsync(DataStore.getRooms(), (data) => setRooms(data || []));
  const refreshTreatments = () => handleAsync(DataStore.getTreatments(), (data) => setTreatments(data || []));
  const refreshSettings = () => handleAsync(DataStore.getSettings(), (data) => setSettings(data || null));
  const refreshStaff = () => handleAsync(DataStore.getStaff(), (data) => setStaff(data || []));
  const refreshHolidays = () => handleAsync(DataStore.getHolidays(), (data) => setHolidays(data || []));
  const refreshActivity = () => handleAsync(DataStore.getActivityLog(), (data) => setActivity(data || []));
  const refreshRequests = () =>
    handleAsync(DataStore.getAppointmentRequests(), (data) => setAppointmentRequests(data || []));

  const addPatient = (patient) =>
    handleAsync(DataStore.addPatient(patient), () => {
      refreshPatients();
      refreshActivity();
    });

  const updatePatient = (id, updates) =>
    handleAsync(DataStore.updatePatient(id, updates), () => {
      refreshPatients();
      refreshActivity();
    });

  const deletePatient = (id) =>
    handleAsync(DataStore.deletePatient(id), () => {
      refreshPatients();
      refreshActivity();
    });

  const addAppointment = (appointment) =>
    handleAsync(DataStore.addAppointment(appointment), () => {
      refreshAppointments();
      refreshActivity();
    });

  const updateAppointment = (id, updates) =>
    handleAsync(DataStore.updateAppointment(id, updates), () => {
      refreshAppointments();
      refreshActivity();
    });

  const deleteAppointment = (id) =>
    handleAsync(DataStore.deleteAppointment(id), () => {
      refreshAppointments();
      refreshActivity();
    });

  const saveSettings = (data) =>
    handleAsync(DataStore.saveSettings(data), () => {
      refreshSettings();
      refreshActivity();
    });

  const addRoom = (room) =>
    handleAsync(DataStore.addRoom(room), () => {
      refreshRooms();
      refreshActivity();
    });

  const updateRoom = (id, updates) =>
    handleAsync(DataStore.updateRoom(id, updates), () => {
      refreshRooms();
      refreshActivity();
    });

  const deleteRoom = (id) =>
    handleAsync(DataStore.deleteRoom(id), () => {
      refreshRooms();
      refreshActivity();
    });

  const addTreatment = (treatment) =>
    handleAsync(DataStore.addTreatment(treatment), () => {
      refreshTreatments();
      refreshActivity();
    });

  const updateTreatment = (id, updates) =>
    handleAsync(DataStore.updateTreatment(id, updates), () => {
      refreshTreatments();
      refreshActivity();
    });

  const deleteTreatment = (id) =>
    handleAsync(DataStore.deleteTreatment(id), () => {
      refreshTreatments();
      refreshActivity();
    });

  const addStaff = (member) =>
    handleAsync(DataStore.addStaff(member), () => {
      refreshStaff();
      refreshActivity();
    });

  const updateStaff = (id, updates) =>
    handleAsync(DataStore.updateStaff(id, updates), () => {
      refreshStaff();
      refreshActivity();
    });

  const deleteStaff = (id) =>
    handleAsync(DataStore.deleteStaff(id), () => {
      refreshStaff();
      refreshActivity();
    });

  const saveHolidays = (list) =>
    handleAsync(DataStore.saveHolidays(list), () => {
      refreshHolidays();
      refreshActivity();
    });

  const addHoliday = (holiday) =>
    handleAsync(DataStore.addHoliday(holiday), () => {
      refreshHolidays();
      refreshActivity();
    });

  const updateHoliday = (id, updates) =>
    handleAsync(DataStore.updateHoliday(id, updates), () => {
      refreshHolidays();
      refreshActivity();
    });

  const deleteHoliday = (id) =>
    handleAsync(DataStore.deleteHoliday(id), () => {
      refreshHolidays();
      refreshActivity();
    });

  const clearAll = () =>
    handleAsync(DataStore.clearAllData(), () => {
      refreshPatients();
      refreshAppointments();
      refreshRooms();
      refreshTreatments();
      refreshSettings();
      refreshStaff();
      refreshHolidays();
      refreshActivity();
      refreshRequests();
    });

  // Encapsulated Appointment Creation
  const handleAddAppointment = (appointment) => {
    return handleAsync((async () => {
      // 1. Credit Check (Mock Logic)
      if (credits < 1) {
        throw new Error("Insufficient credits. Please top up.");
      }

      // 2. Decrement (Mock Logic)
      setCredits(c => c - 1);
      setCreditHistory(prev => [{
        date: new Date().toISOString(),
        description: 'Appointment Created',
        amount: -1
      }, ...prev]);

      // 3. Proceed with DataStore call
      return await DataStore.addAppointment(appointment);
    })(), () => {
      refreshAppointments();
      refreshActivity();
    });
  };

  // Async Credit Top-up
  const handleAddCredits = async (amount, description) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 600));
    setCredits(prev => prev + amount);
    setCreditHistory(prev => [{
      date: new Date().toISOString(),
      description,
      amount
    }, ...prev]);
  };

  return {
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
    dateRange,
    setDateRange,
    appointmentDataStatus,
    loadedAppointmentRange,
    addPatient,
    updatePatient,
    deletePatient,
    addAppointment: handleAddAppointment,
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
    refreshRequests,
    searchPatients: (query) => DataStore.searchPatients(query),
    // Mock Credits
    credits,
    creditHistory,
    addCredits: handleAddCredits,
    updateAppointmentRequest: (id, updates) =>
      handleAsync(DataStore.updateAppointmentRequest(id, updates), () => {
        refreshRequests();
        refreshActivity();
      }),
  };
}
