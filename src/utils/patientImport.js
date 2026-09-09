export const PATIENT_IMPORT_FIELDS = [
  { key: 'name', label: 'Name', required: true, aliases: ['patient name', 'full name', 'fullname', 'name', 'patient'] },
  { key: 'idNumber', label: 'IC / ID', aliases: ['ic', 'ic no', 'ic number', 'id', 'id no', 'id number', 'identity number', 'nric', 'passport'] },
  { key: 'dob', label: 'Date of birth', aliases: ['dob', 'date of birth', 'birth date', 'birthday'] },
  { key: 'gender', label: 'Gender', aliases: ['gender', 'sex'] },
  { key: 'taxNumber', label: 'Tax number', aliases: ['tax', 'tax no', 'tax number', 'tin'] },
  { key: 'phone', label: 'Phone', required: true, aliases: ['phone', 'phone no', 'phone number', 'mobile', 'mobile no', 'contact', 'contact no', 'tel', 'telephone'] },
  { key: 'email', label: 'Email', aliases: ['email', 'email address', 'e-mail'] },
  { key: 'emailIsGuardian', label: 'Email belongs to guardian', aliases: ['guardian email', 'parent email', 'email is guardian'] },
  { key: 'guardianName', label: 'Parent / guardian name', aliases: ['guardian name', 'parent name', 'parent guardian name'] },
  { key: 'guardianRelationship', label: 'Guardian relationship', aliases: ['guardian relationship', 'relationship to patient', 'relationship'] },
  { key: 'address', label: 'Address', aliases: ['address', 'home address', 'residential address'] },
  { key: 'emergencyContactName', label: 'Emergency contact name', aliases: ['emergency contact', 'emergency contact name', 'emergency name'] },
  { key: 'emergencyContactPhone', label: 'Emergency contact phone', aliases: ['emergency phone', 'emergency contact phone', 'emergency contact no'] },
  { key: 'allergies', label: 'Allergies', aliases: ['allergy', 'allergies'] },
  { key: 'medicalConditions', label: 'Medical conditions', aliases: ['medical condition', 'medical conditions', 'conditions', 'medical history'] },
  { key: 'medications', label: 'Medications', aliases: ['medication', 'medications', 'medicine', 'current medication'] },
  { key: 'source', label: 'Source', aliases: ['source', 'patient source', 'referral source', 'how did you hear'] },
  { key: 'preferredDentist', label: 'Preferred dentist', aliases: ['preferred dentist', 'dentist', 'doctor', 'preferred doctor'] },
  { key: 'insurance', label: 'Insurance', aliases: ['insurance', 'insurance provider', 'insurer'] },
  { key: 'notes', label: 'Notes', aliases: ['note', 'notes', 'remarks', 'remark', 'comments'] },
];

export const normalizeHeader = (value) => String(value ?? '')
  .trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');

export function suggestPatientMapping(headers) {
  const normalized = headers.map((header) => ({ header, normalized: normalizeHeader(header) }));
  return Object.fromEntries(PATIENT_IMPORT_FIELDS.map((field) => {
    const exact = normalized.find((item) => field.aliases.some((alias) => item.normalized === normalizeHeader(alias)));
    const partial = exact || normalized.find((item) => field.aliases.some((alias) => {
      const normalizedAlias = normalizeHeader(alias);
      return normalizedAlias.length > 3 && (item.normalized.includes(normalizedAlias) || normalizedAlias.includes(item.normalized));
    }));
    return [field.key, partial?.header || ''];
  }));
}

function csvRows(text) {
  const rows = [];
  let row = []; let value = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted && character === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (!quoted && (character === ',' || character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value); value = '';
      if (character !== ',') { if (row.some((cell) => cell.trim() !== '')) rows.push(row); row = []; }
    } else value += character;
  }
  row.push(value);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  return rows;
}

const decodeXml = (value) => new DOMParser().parseFromString(`<x>${value}</x>`, 'application/xml').documentElement.textContent || '';

async function unzipXlsx(buffer) {
  const bytes = new Uint8Array(buffer); const view = new DataView(buffer); const files = new Map();
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const flags = view.getUint16(offset + 6, true); const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true); const nameLength = view.getUint16(offset + 26, true); const extraLength = view.getUint16(offset + 28, true);
    if (flags & 0x08) throw new Error('This Excel file uses an unsupported ZIP format. Please save it again as .xlsx or CSV.');
    const name = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLength));
    const start = offset + 30 + nameLength + extraLength; const compressed = bytes.slice(start, start + compressedSize);
    let content;
    if (method === 0) content = compressed;
    else if (method === 8 && typeof DecompressionStream !== 'undefined') {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      content = new Uint8Array(await new Response(stream).arrayBuffer());
    } else throw new Error('Your browser cannot read this Excel file. Please use CSV instead.');
    files.set(name, content); offset = start + compressedSize;
  }
  return files;
}

async function xlsxRows(file) {
  const files = await unzipXlsx(await file.arrayBuffer()); const decoder = new TextDecoder();
  const sharedXml = files.get('xl/sharedStrings.xml');
  const shared = sharedXml ? [...decoder.decode(sharedXml).matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((match) => decodeXml([...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join(''))) : [];
  const sheetName = [...files.keys()].filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort()[0];
  if (!sheetName) throw new Error('No worksheet was found in this Excel file.');
  const xml = decoder.decode(files.get(sheetName)); const rows = [];
  for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = []; let fallbackColumn = 0;
    for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = /\br="([A-Z]+)\d+"/.exec(cellMatch[1]);
      const column = ref ? [...ref[1]].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1 : fallbackColumn;
      const type = /\bt="([^"]+)"/.exec(cellMatch[1])?.[1]; const raw = /<v[^>]*>([\s\S]*?)<\/v>/.exec(cellMatch[2])?.[1] ?? '';
      const inline = /<t[^>]*>([\s\S]*?)<\/t>/.exec(cellMatch[2])?.[1];
      row[column] = type === 's' ? shared[Number(raw)] ?? '' : type === 'inlineStr' ? decodeXml(inline ?? '') : decodeXml(raw);
      fallbackColumn = column + 1;
    }
    if (row.some((cell) => String(cell ?? '').trim())) rows.push(row);
  }
  return rows;
}

export async function readPatientFile(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const rows = extension === 'csv' ? csvRows(await file.text()) : await xlsxRows(file);
  if (rows.length < 2) throw new Error('The file needs a header row and at least one patient row.');
  const headers = rows[0].map((header, index) => String(header || `Column ${index + 1}`).trim());
  return { headers, rows: rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))) };
}

const truthy = (value) => ['1', 'true', 'yes', 'y', '是'].includes(String(value ?? '').trim().toLowerCase());
const normalizeGender = (value) => ({ m: 'male', man: 'male', male: 'male', f: 'female', woman: 'female', female: 'female' }[String(value ?? '').trim().toLowerCase()] || String(value ?? '').trim().toLowerCase());
const normalizeRelationship = (value) => ({ parent: 'parent', mother: 'parent', father: 'parent', guardian: 'legal-guardian', 'legal guardian': 'legal-guardian' }[String(value ?? '').trim().toLowerCase()] || '');

export function normalizeDate(value) {
  if (value === '' || value == null) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())) return String(value).trim();
  if (/^\d+(\.\d+)?$/.test(String(value).trim())) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30)); excelEpoch.setUTCDate(excelEpoch.getUTCDate() + Number(value));
    return excelEpoch.toISOString().slice(0, 10);
  }
  const match = String(value).trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) { const year = match[3].length === 2 ? `19${match[3]}` : match[3]; return `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`; }
  const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

export function mapPatientRows(rows, mapping, dentists = []) {
  return rows.map((row, index) => {
    const get = (key) => String(mapping[key] ? row[mapping[key]] ?? '' : '').trim();
    const dentistText = get('preferredDentist').toLowerCase();
    const patient = Object.fromEntries(PATIENT_IMPORT_FIELDS.map((field) => [field.key, get(field.key)]));
    patient.dob = normalizeDate(patient.dob); patient.gender = normalizeGender(patient.gender);
    patient.email = patient.email.toLowerCase(); patient.emailIsGuardian = truthy(patient.emailIsGuardian);
    patient.guardianRelationship = normalizeRelationship(patient.guardianRelationship);
    patient.preferredDentist = dentists.find((dentist) => dentist.name?.trim().toLowerCase() === dentistText)?.id || '';
    const errors = [];
    if (!patient.name) errors.push('Name is required');
    if (!patient.phone) errors.push('Phone is required');
    if (get('dob') && !patient.dob) errors.push('Invalid date of birth');
    if (patient.gender && !['male', 'female', 'other'].includes(patient.gender)) errors.push('Gender must be male, female, or other');
    if (patient.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patient.email)) errors.push('Invalid email');
    if (patient.emailIsGuardian && (!patient.email || !patient.guardianName || !patient.guardianRelationship)) errors.push('Guardian email, name, and relationship are required');
    return { sourceRow: index + 2, patient, errors };
  });
}
