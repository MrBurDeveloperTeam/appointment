import { useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, FileSpreadsheet, Upload, Users } from 'lucide-react';
import Modal from './Modal';
import { mapPatientRows, PATIENT_IMPORT_FIELDS, readPatientFile, suggestPatientMapping } from '../utils/patientImport';

export default function PatientImportModal({ dentists, onImport, onClose }) {
  const inputRef = useRef(null); const [step, setStep] = useState('upload'); const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]); const [rows, setRows] = useState([]); const [mapping, setMapping] = useState({});
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [result, setResult] = useState(null);
  const mappedRows = useMemo(() => mapPatientRows(rows, mapping, dentists), [rows, mapping, dentists]);
  const validRows = mappedRows.filter((row) => row.errors.length === 0); const invalidRows = mappedRows.length - validRows.length;

  const chooseFile = async (file) => {
    if (!file) return; setError(''); setBusy(true);
    try {
      const parsed = await readPatientFile(file); setFileName(file.name); setHeaders(parsed.headers); setRows(parsed.rows);
      setMapping(suggestPatientMapping(parsed.headers)); setStep('map');
    } catch (caught) { setError(caught.message || 'Could not read this file.'); }
    finally { setBusy(false); }
  };

  const startImport = async () => {
    setBusy(true); setError('');
    try { const imported = await onImport(validRows.map((row) => row.patient)); setResult(imported); setStep('done'); }
    catch (caught) { setError(caught.message || 'Patient import stopped. Please check the file and try again.'); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Import patients" onClose={onClose} disableClose={busy}>
      <div className="patient-import-steps" aria-label="Import progress">
        {['Upload', 'Map columns', 'Review'].map((label, index) => <span key={label} className={(step === 'done' || ['upload', 'map', 'review'].indexOf(step) >= index) ? 'active' : ''}>{index + 1}<em>{label}</em></span>)}
      </div>
      <div className="modal-body patient-import-body">
        {error && <div className="patient-import-alert error"><AlertCircle size={18} />{error}</div>}
        {step === 'upload' && <div className="patient-import-upload">
          <div className="patient-import-icon"><FileSpreadsheet size={30} /></div>
          <h4>Bring your patient list into Snabbb</h4>
          <p>Choose a .xlsx or .csv file. The file stays in this browser while you match and review its columns.</p>
          <input ref={inputRef} type="file" accept=".xlsx,.csv" hidden onChange={(event) => chooseFile(event.target.files?.[0])} />
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => inputRef.current?.click()}><Upload size={17} />{busy ? 'Reading file…' : 'Choose file'}</button>
          <small>Maximum 2,000 data rows. Old .xls files should be saved as .xlsx or CSV first.</small>
        </div>}
        {step === 'map' && <>
          <div className="patient-import-heading"><div><h4>Match your columns</h4><p>{fileName} · {rows.length} data rows</p></div><button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep('upload')}>Change file</button></div>
          {rows.length > 2000 && <div className="patient-import-alert error"><AlertCircle size={18} />This file has more than 2,000 rows. Please split it into smaller files.</div>}
          <div className="patient-import-mapping">
            {PATIENT_IMPORT_FIELDS.map((field) => <label key={field.key}><span>{field.label}{field.required && <b>Required</b>}</span><select className="form-select" value={mapping[field.key] || ''} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value }))}><option value="">Do not import</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}
          </div>
        </>}
        {step === 'review' && <>
          <div className="patient-import-heading"><div><h4>Review before importing</h4><p>Only valid rows will be imported. Existing matching patients are skipped safely.</p></div></div>
          <div className="patient-import-summary"><span><Users size={19} /><strong>{mappedRows.length}</strong>Total rows</span><span className="success"><CheckCircle2 size={19} /><strong>{validRows.length}</strong>Ready</span><span className={invalidRows ? 'danger' : ''}><AlertCircle size={19} /><strong>{invalidRows}</strong>Need attention</span></div>
          <div className="patient-import-table-wrap"><table className="patient-import-table"><thead><tr><th>Row</th><th>Name</th><th>Phone</th><th>IC / ID</th><th>Status</th></tr></thead><tbody>{mappedRows.slice(0, 200).map((item) => <tr key={item.sourceRow} className={item.errors.length ? 'invalid' : ''}><td>{item.sourceRow}</td><td>{item.patient.name || '—'}</td><td>{item.patient.phone || '—'}</td><td>{item.patient.idNumber || '—'}</td><td>{item.errors.length ? item.errors.join('; ') : 'Ready'}</td></tr>)}</tbody></table></div>
          {mappedRows.length > 200 && <p className="text-muted patient-import-note">Showing the first 200 rows. All valid rows will still be imported.</p>}
        </>}
        {step === 'done' && <div className="patient-import-upload"><div className="patient-import-icon success"><CheckCircle2 size={32} /></div><h4>Import complete</h4><p>{result?.created?.length || 0} patients added. {result?.skipped?.length || 0} duplicates skipped.</p></div>}
      </div>
      <div className="modal-footer">
        {step === 'map' && <button type="button" className="btn btn-secondary" onClick={() => setStep('upload')}><ArrowLeft size={16} />Back</button>}
        {step === 'review' && <button type="button" className="btn btn-secondary" onClick={() => setStep('map')}><ArrowLeft size={16} />Back</button>}
        <div className="flex-1" />
        {step !== 'done' && <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>Cancel</button>}
        {step === 'map' && <button type="button" className="btn btn-primary" disabled={!mapping.name || !mapping.phone || rows.length > 2000} onClick={() => setStep('review')}>Review patients</button>}
        {step === 'review' && <button type="button" className="btn btn-primary" disabled={busy || validRows.length === 0} onClick={startImport}>{busy ? 'Importing…' : `Import ${validRows.length} patients`}</button>}
        {step === 'done' && <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>}
      </div>
    </Modal>
  );
}
