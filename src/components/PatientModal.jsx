import { useState } from 'react';
import Modal from './Modal';
import { useToast } from '../context/ToastProvider';

export default function PatientModal({ patient, dentists, onSave, onDelete, onClose }) {
  const { addToast } = useToast();
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

  const handleChange = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      addToast('Please enter patient name', 'error');
      return;
    }

    if (!form.phone.trim()) {
      addToast('Please enter phone number', 'error');
      return;
    }

    if (form.emailIsGuardian && !form.email.trim()) {
      addToast(
        'Please enter the parent or guardian email',
        'error'
      );
      return;
    }

    if (form.emailIsGuardian && !form.guardianName.trim()) {
      addToast('Please enter parent or guardian name', 'error');
      return;
    }

    if (
      form.emailIsGuardian &&
      !form.guardianRelationship
    ) {
      addToast(
        'Please select the guardian relationship',
        'error'
      );
      return;
    }

    onSave({
      ...form,
      email: form.email.trim().toLowerCase(),
      guardianName: form.emailIsGuardian
        ? form.guardianName.trim()
        : '',
      guardianRelationship: form.emailIsGuardian
        ? form.guardianRelationship
        : '',
    });
  };

  return (
    <Modal title={patient ? 'Edit Patient' : 'New Patient'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Name</label>
            <input className="form-input" value={form.name} onChange={(e) => handleChange('name', e.target.value)} required />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">IC/ID</label>
              <input className="form-input" value={form.idNumber} onChange={(e) => handleChange('idNumber', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">DOB</label>
              <input className="form-input" type="date" value={form.dob} onChange={(e) => handleChange('dob', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Gender</label>
              <select className="form-select" value={form.gender} onChange={(e) => handleChange('gender', e.target.value)}>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Tax Number</label>
              <input className="form-input" value={form.taxNumber} onChange={(e) => handleChange('taxNumber', e.target.value)} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input
                className="form-input"
                value={form.phone}
                onChange={(e) =>
                  handleChange('phone', e.target.value)
                }
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                className="form-input"
                type="email"
                value={form.email}
                onChange={(e) =>
                  handleChange('email', e.target.value)
                }
                required={form.emailIsGuardian}
              />

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
                <label className="form-label">
                  Parent / Guardian Name
                </label>

                <input
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
              </div>

              <div className="form-group">
                <label className="form-label">
                  Relationship to Patient
                </label>

                <select
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
        <div className="modal-footer">
          {patient && (
            <button type="button" className="btn btn-danger" onClick={onDelete}>
              Delete
            </button>
          )}
          <div className="flex-1"></div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
