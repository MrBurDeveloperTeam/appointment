import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { useToast } from '../context/ToastProvider';
import { validatePatient, normalizePatientIdNumber } from '../utils/patientValidation';

export default function PatientModal({ patient, dentists, onSave, onDelete, onClose }) {
  const { addToast } = useToast();
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const formRef = useRef(null);
  const [saveError, setSaveError] = useState('');
  const [rejectedIc, setRejectedIc] = useState(null);
  useEffect(() => {
    if (!saving && rejectedIc) formRef.current?.querySelector('#patient-idNumber')?.focus();
  }, [saving, rejectedIc]);
  const [form, setForm] = useState(() => ({
    name: patient ? patient.name || '' : '',
    idNumber: patient ? patient.idNumber || '' : '',
    dob: patient ? patient.dob || '' : '',
    gender: patient ? patient.gender || '' : '',
    taxNumber: patient ? patient.taxNumber || '' : '',
    phone: patient ? patient.phone || '' : '',
    email: patient ? patient.email || '' : '',
    emailIsGuardian: patient
      ? Boolean(patient.emailIsGuardian)
      : false,
    guardianName: patient
      ? patient.guardianName || ''
      : '',
    guardianRelationship: patient
      ? patient.guardianRelationship || ''
      : '',
    address: patient ? patient.address || '' : '',
    emergencyContactName: patient ? patient.emergencyContactName || '' : '',
    emergencyContactPhone: patient ? patient.emergencyContactPhone || '' : '',
    allergies: patient ? patient.allergies || '' : '',
    medicalConditions: patient ? patient.medicalConditions || '' : '',
    medications: patient ? patient.medications || '' : '',
    source: patient ? patient.source || '' : '',
    preferredDentist: patient ? patient.preferredDentist || '' : '',
    insurance: patient ? patient.insurance || '' : '',
    notes: patient ? patient.notes || '' : '',
  }));

  const errors = validatePatient(form);
  if (rejectedIc && rejectedIc === normalizePatientIdNumber(form.idNumber)) {
    errors.idNumber = 'A patient with this IC / ID already exists. Search for and select the existing patient instead.';
  }
  const handleChange = (key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setTouched((previous) => ({ ...previous, [key]: true }));
    setSaveError('');
  };
  const fieldProps = (key) => ({
    id: `patient-${key}`,
    'aria-invalid': Boolean((touched[key] || submitted) && errors[key]),
    'aria-describedby': (touched[key] || submitted) && errors[key] ? `patient-${key}-error` : undefined,
    onBlur: () => setTouched((previous) => ({ ...previous, [key]: true })),
  });
  const fieldError = (key) => (touched[key] || submitted) && errors[key]
    ? <div id={`patient-${key}-error`} className="form-error" aria-live="polite">{errors[key]}</div>
    : null;
  const focusError = (key) => formRef.current?.querySelector(`#patient-${key}`)?.focus();
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (savingRef.current) return;
    setSubmitted(true);
    if (Object.keys(errors).length) {
      focusError(Object.keys(errors)[0]);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError('');
    try {
      await onSave({
        ...form,
        name: form.name.trim(),
        idNumber: form.idNumber.trim(),
        phone: form.phone.trim(),
        email: form.email.trim().toLowerCase(),
        guardianName: form.emailIsGuardian ? form.guardianName.trim() : '',
        guardianRelationship: form.emailIsGuardian ? form.guardianRelationship : '',
      });
      addToast(patient ? 'Patient updated successfully.' : 'Patient added successfully.', 'success');
    } catch (error) {
      if (error?.code === '23505' && [error.message, error.details, error.hint].some(value => String(value || '').includes('apt_patients_clinic_normalized_ic_key'))) {
        setRejectedIc(normalizePatientIdNumber(form.idNumber));
        focusError('idNumber');
      } else {
        setSaveError(error?.message || 'Unable to save patient. Please try again.');
      }
      addToast(error?.message || 'Unable to save patient. Please try again.', 'error');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Modal title={patient ? 'Edit Patient' : 'New Patient'} onClose={onClose} disableClose={saving}>
      <form ref={formRef} className="patient-form" noValidate onSubmit={handleSubmit}>
        <fieldset disabled={saving} className="patient-form-fields">
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label" htmlFor="patient-name">Name *</label>
            <input {...fieldProps('name')} className="form-input" value={form.name} onChange={(e) => handleChange('name', e.target.value)} required />
              {fieldError('name')}
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="patient-idNumber">IC/ID *</label>
              <input {...fieldProps('idNumber')} required className="form-input" value={form.idNumber} onChange={(e) => handleChange('idNumber', e.target.value)} />
              {fieldError('idNumber')}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="patient-dob">DOB *</label>
              <input {...fieldProps('dob')} className="form-input" type="date" required value={form.dob} onChange={(e) => handleChange('dob', e.target.value)} />
              {fieldError('dob')}
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="patient-gender">Gender *</label>
              <select {...fieldProps('gender')} className="form-select" required value={form.gender} onChange={(e) => handleChange('gender', e.target.value)}>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
              {fieldError('gender')}
            </div>
            <div className="form-group">
              <label className="form-label">Tax Number</label>
              <input className="form-input" value={form.taxNumber} onChange={(e) => handleChange('taxNumber', e.target.value)} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="patient-phone">Phone *</label>
              <input {...fieldProps('phone')}
                className="form-input"
                value={form.phone}
                onChange={(e) =>
                  handleChange('phone', e.target.value)
                }
                required
              />
              {fieldError('phone')}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="patient-email">Email *</label>
              <input {...fieldProps('email')}
                className="form-input"
                type="email"
                value={form.email}
                onChange={(e) =>
                  handleChange('email', e.target.value)
                }
                required
              />
              {fieldError('email')}

              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  marginTop: '10px',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-sm)',
                  lineHeight: 1.4,
                }}
              >
                <input
                  type="checkbox"
                  checked={form.emailIsGuardian}
                  onChange={(e) => {
                    const checked = e.target.checked;

                    setForm((previous) => ({
                      ...previous,
                      emailIsGuardian: checked,
                      guardianName: checked
                        ? previous.guardianName
                        : '',
                      guardianRelationship: checked
                        ? previous.guardianRelationship
                        : '',
                    }));
                  }}
                  style={{
                    width: '18px',
                    height: '18px',
                    marginTop: '1px',
                    flexShrink: 0,
                  }}
                />

                <span>
                  This email belongs to the patient's parent or
                  legal guardian.
                </span>
              </label>
            </div>
          </div>

          {form.emailIsGuardian && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="patient-guardianName">
                  Parent / Guardian Name *
                </label>

                <input {...fieldProps('guardianName')}
                  className="form-input"
                  value={form.guardianName}
                  onChange={(e) =>
                    handleChange(
                      'guardianName',
                      e.target.value
                    )
                  }
                  placeholder="Enter full name"
                  required
                />
              {fieldError('guardianName')}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="patient-guardianRelationship">
                  Relationship to Patient *
                </label>

                <select {...fieldProps('guardianRelationship')}
                  className="form-select"
                  value={form.guardianRelationship}
                  onChange={(e) =>
                    handleChange(
                      'guardianRelationship',
                      e.target.value
                    )
                  }
                  required
                >
                  <option value="">Select</option>
                  <option value="parent">Parent</option>
                  <option value="legal-guardian">
                    Legal guardian
                  </option>
                  <option value="other-responsible-adult">
                    Other responsible adult
                  </option>
                </select>
              {fieldError('guardianRelationship')}
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Address</label>
            <input className="form-input" value={form.address} onChange={(e) => handleChange('address', e.target.value)} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Emergency Contact Name</label>
              <input
                className="form-input"
                value={form.emergencyContactName}
                onChange={(e) => handleChange('emergencyContactName', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Emergency Contact Phone</label>
              <input
                className="form-input"
                value={form.emergencyContactPhone}
                onChange={(e) => handleChange('emergencyContactPhone', e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Allergies</label>
            <textarea className="form-textarea" value={form.allergies} onChange={(e) => handleChange('allergies', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Medical Conditions</label>
            <textarea
              className="form-textarea"
              value={form.medicalConditions}
              onChange={(e) => handleChange('medicalConditions', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Medications</label>
            <textarea
              className="form-textarea"
              value={form.medications}
              onChange={(e) => handleChange('medications', e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Source</label>
              <select className="form-select" value={form.source} onChange={(e) => handleChange('source', e.target.value)}>
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
            </div>
            <div className="form-group">
              <label className="form-label">Preferred Dentist</label>
              <select
                className="form-select"
                value={form.preferredDentist}
                onChange={(e) => handleChange('preferredDentist', e.target.value)}
              >
                <option value="">No preference</option>
                {dentists.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Insurance</label>
              <input className="form-input" value={form.insurance} onChange={(e) => handleChange('insurance', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-textarea" value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} />
            </div>
          </div>
        </div>
        </fieldset>
        <div className="modal-footer">
          {saveError && <p className="form-error" role="alert">{saveError}</p>}
          {patient && (
            <button type="button" disabled={saving} className="btn btn-danger" onClick={onDelete}>
              Delete
            </button>
          )}
          <div className="flex-1"></div>
          <button type="button" disabled={saving} className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
