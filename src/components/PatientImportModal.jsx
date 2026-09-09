import { useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, FileSpreadsheet, Plus, Upload, Users, X } from 'lucide-react';
import Modal from './Modal';
import { mapPatientRows, PATIENT_IMPORT_FIELDS, PATIENT_IMPORT_NAME_FIELDS, readPatientFile, suggestNameOrder, suggestPatientMapping } from '../utils/patientImport';

const hasMapping = (value) => Array.isArray(value) ? value.some(Boolean) : Boolean(value);

function MultiColumnMapping({ field, headers, value, onChange }) {
  const selections = Array.isArray(value) && value.length ? value : value ? [value] : [''];
  const update = (index, nextValue) => onChange(selections.map((selection, selectionIndex) => selectionIndex === index ? nextValue : selection));
  const remove = (index) => onChange(selections.filter((_, selectionIndex) => selectionIndex !== index));
  return <div className="patient-import-multi-field">
    <div className="patient-import-field-label"><span>{field.label}</span>{field.required && <b>Required</b>}</div>
    {selections.map((selection, index) => <div className="patient-import-column-row" key={`${field.key}-${index}`}>
      <select className="form-select" aria-label={`${field.label} source ${index + 1}`} value={selection} onChange={(event) => update(index, event.target.value)}>
        <option value="">{index === 0 ? 'Do not import' : 'Choose another column'}</option>
        {headers.map((header) => <option key={header} value={header} disabled={selections.includes(header) && selection !== header}>{header}</option>)}
      </select>
      {index > 0 && <button type="button" className="patient-import-remove-column" aria-label={`Remove ${field.label} source ${index + 1}`} onClick={() => remove(index)}><X size={15} /></button>}
    </div>)}
    {selections.some(Boolean) && selections.length < headers.length && <button type="button" className="patient-import-add-column" onClick={() => onChange([...selections, ''])}><Plus size={14} />Add another column</button>}
  </div>;
}

export default function PatientImportModal({ dentists, onImport, onClose }) {
  const inputRef = useRef(null); const [step, setStep] = useState('upload'); const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]); const [rows, setRows] = useState([]); const [mapping, setMapping] = useState({});
  const [nameOrder, setNameOrder] = useState('given-family');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [result, setResult] = useState(null);
  const mappedRows = useMemo(() => mapPatientRows(rows, mapping, dentists, nameOrder), [rows, mapping, dentists, nameOrder]);
  const warningRows =
    mappedRows.filter(
      (row) =>
        row.warnings.length > 0
    );

  const readyRows =
    mappedRows.length -
    warningRows.length;

  const chooseFile = async (file) => {
    if (!file) return; setError(''); setBusy(true);
    try {
      const parsed = await readPatientFile(file); setFileName(file.name); setHeaders(parsed.headers); setRows(parsed.rows);
      setMapping(suggestPatientMapping(parsed.headers)); setNameOrder(suggestNameOrder(parsed.headers)); setStep('map');
    } catch (caught) { setError(caught.message || 'Could not read this file.'); }
    finally { setBusy(false); }
  };

  const startImport = async () => {
    setBusy(true); setError('');
    try {
      const imported =
        await onImport(
          mappedRows.map(
            (row) => row.patient
          )
        );

      setResult(imported);
      setStep('done');
    }
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
          <small>Old .xls files should be saved as .xlsx or CSV first.</small>
        </div>}
        {step === 'map' && <>
          <div className="patient-import-heading"><div><h4>Match your columns</h4><p>{fileName} · {rows.length} data rows</p></div><button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep('upload')}>Change file</button></div>
          <section className="patient-import-name-builder">
            <div className="patient-import-section-heading">
              <div>
                <h5>Patient name</h5>
                <p>
                  Use one full-name column,
                  or combine separate name columns.
                </p>
              </div>
            </div>
            <div className="patient-import-mapping patient-import-name-grid">
              {PATIENT_IMPORT_NAME_FIELDS.map((field) => <label key={field.key}><span>{field.label}</span><select className="form-select" value={mapping[field.key] || ''} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value }))}><option value="">Not provided</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}
              <label><span>Name order</span><select className="form-select" value={nameOrder} onChange={(event) => setNameOrder(event.target.value)}><option value="given-family">Given → Middle → Family</option><option value="family-given">Family → Given → Middle</option></select></label>
            </div>
            <p className="patient-import-name-note">A full-name value takes priority. Preferred names and nicknames are preserved in Notes instead of replacing the legal name.</p>
          </section>
          <div className="patient-import-mapping patient-import-other-fields">
            {PATIENT_IMPORT_FIELDS.map((field) => <MultiColumnMapping key={field.key} field={field} headers={headers} value={mapping[field.key]} onChange={(value) => setMapping((current) => ({ ...current, [field.key]: value }))} />)}
          </div>
        </>}
        {step === 'review' && <>
          <div className="patient-import-heading"><div><h4>Review before importing</h4><p>
            All rows can be imported. Invalid or
            unrecognized values are imported as
            blank and shown as warnings below.
            Existing matching patients are
            skipped safely.
          </p></div></div>
          <div className="patient-import-summary">
            <span>
              <Users size={19} />
              <strong>{mappedRows.length}</strong>
              Total rows
            </span>

            <span className="success">
              <CheckCircle2 size={19} />
              <strong>{readyRows}</strong>
              Ready
            </span>

            <span
              className={
                warningRows.length
                  ? 'warning'
                  : ''
              }
            >
              <AlertCircle size={19} />
              <strong>
                {warningRows.length}
              </strong>
              Warnings
            </span>
          </div>
          <div className="patient-import-table-wrap"><table className="patient-import-table"><thead><tr><th>Row</th><th>Name</th><th>Phone</th><th>IC / ID</th><th>Status</th></tr></thead><tbody>{mappedRows.slice(0, 200).map((item) => <tr
            key={item.sourceRow}
            className={
              item.warnings.length
                ? 'warning'
                : ''
            }
          ><td>{item.sourceRow}</td><td>{item.patient.name || '—'}</td><td>{item.patient.phone || '—'}</td><td>{item.patient.idNumber || '—'}</td><td>{item.warnings.length ? item.warnings.join('; ') : 'Ready'}</td></tr>)}</tbody></table></div>
          {mappedRows.length > 200 && <p className="text-muted patient-import-note">Showing the first 200 rows. All rows will still be imported.</p>}
        </>}
        {step === 'done' && <div className="patient-import-upload"><div className="patient-import-icon success"><CheckCircle2 size={32} /></div><h4>Import complete</h4><p>{result?.created?.length || 0} patients added. {result?.skipped?.length || 0} duplicates skipped.</p></div>}
      </div>
      <div className="modal-footer">
        {step === 'map' && <button type="button" className="btn btn-secondary" onClick={() => setStep('upload')}><ArrowLeft size={16} />Back</button>}
        {step === 'review' && <button type="button" className="btn btn-secondary" onClick={() => setStep('map')}><ArrowLeft size={16} />Back</button>}
        <div className="flex-1" />
        {step !== 'done' && <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>Cancel</button>}
        {step === 'map' && <button type="button" className="btn btn-primary" disabled={!Object.values(mapping).some(hasMapping)} onClick={() => setStep('review')}>Review patients</button>}
        {step === 'review' && <button type="button" className="btn btn-primary" disabled={busy || mappedRows.length === 0} onClick={startImport}>{busy ? 'Importing…' : `Import ${mappedRows.length} patients`}</button>}
        {step === 'done' && <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>}
      </div>
    </Modal>
  );
}
