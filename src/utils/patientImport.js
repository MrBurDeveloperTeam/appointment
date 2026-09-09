export const PATIENT_IMPORT_NAME_FIELDS = [
  { key: 'name', label: 'Full / display name', aliases: ['patient name', 'full name', 'fullname', 'display name', 'client name', 'client full name', 'member name', 'customer name', 'nama penuh', 'nama pesakit', '姓名', '全名', '患者姓名'] },
  { key: 'title', label: 'Title / prefix', aliases: ['title', 'prefix', 'honorific', 'salutation', 'name prefix', 'gelaran', '称谓', '头衔'] },
  { key: 'firstName', label: 'First / given name', aliases: ['first name', 'firstname', 'given name', 'givenname', 'forename', 'personal name', 'christian name', 'nama pertama', 'nama depan', '名'] },
  { key: 'middleName', label: 'Middle name', aliases: ['middle name', 'middlename', 'middle initial', 'second name', 'additional name', 'nama tengah', '中间名'] },
  { key: 'lastName', label: 'Last / family name', aliases: ['last name', 'lastname', 'family name', 'familyname', 'surname', 'sur name', 'maiden name', 'nama keluarga', 'nama belakang', '姓'] },
  { key: 'suffix', label: 'Suffix', aliases: ['suffix', 'name suffix', 'generation', 'post nominal', 'jr sr', '后缀'] },
  { key: 'nickname', label: 'Preferred name / nickname', aliases: ['nickname', 'nick name', 'preferred name', 'known as', 'goes by', 'alias', 'call name', 'nama panggilan', '昵称', '别名'] },
];

export const PATIENT_IMPORT_FIELDS = [
  { key: 'idNumber', label: 'IC / ID', aliases: ['ic', 'ic no', 'ic number', 'id', 'id no', 'id number', 'identity number', 'national id', 'national ref', 'national reference', 'nric', 'mykad', 'passport', 'passport no', 'passport number', 'patient id', 'medical record number', 'mrn', '身份证', '身份证号码'] },
  { key: 'dob', label: 'Date of birth', aliases: ['dob', 'date of birth', 'birth date', 'birthdate', 'birthday', 'birthday dd mm yyyy', 'tarikh lahir', '出生日期', '生日'] },
  { key: 'dobDay', label: 'Birth day', aliases: ['birth day', 'dob day', 'day of birth', 'birth dd'] },
  { key: 'dobMonth', label: 'Birth month', aliases: ['birth month', 'dob month', 'month of birth', 'birth mm'] },
  { key: 'dobYear', label: 'Birth year', aliases: ['birth year', 'dob year', 'year of birth', 'birth yyyy'] },
  { key: 'gender', label: 'Gender', aliases: ['gender', 'sex', 'sex code', 'jantina', '性别'] },
  { key: 'taxNumber', label: 'Tax number', aliases: ['tax', 'tax no', 'tax number', 'tax id', 'tax reference', 'revenue id', 'tin', '税号'] },
  { key: 'phone', label: 'Phone numbers', required: true, aliases: ['phone', 'phone no', 'phone number', 'primary phone', 'home phone', 'work phone', 'office phone', 'mobile', 'mobile no', 'mobile number', 'primary mobile', 'mobile 1', 'mobile 2', 'cell', 'cell phone', 'contact', 'contact no', 'contact number', 'tel', 'telephone', 'whatsapp', 'no telefon', 'telefon', '联系电话', '手机号码'] },
  { key: 'email', label: 'Email addresses', aliases: ['email', 'email address', 'e-mail', 'electronic mail', 'primary email', 'secondary email', 'personal email', 'work email', 'email 1', 'email 2', 'emel', '电子邮件', '邮箱'] },
  { key: 'emailIsGuardian', label: 'Email belongs to guardian', aliases: ['guardian email', 'parent email', 'email is guardian', 'email belongs to guardian', 'adult email owner', 'minor email', 'guardian email flag'] },
  { key: 'guardianName', label: 'Parent / guardian name', aliases: ['guardian name', 'parent name', 'parent guardian name', 'responsible person', 'responsible adult', 'legal guardian'] },
  { key: 'guardianRelationship', label: 'Guardian relationship', aliases: ['guardian relationship', 'relationship to patient', 'relationship', 'adult relation', 'parent relationship'] },
  { key: 'address', label: 'Address parts', aliases: ['address', 'address 1', 'address 2', 'address line 1', 'address line 2', 'home address', 'residential address', 'mailing address', 'postal address', 'street address', 'street', 'building', 'unit', 'city', 'town', 'district', 'state', 'province', 'postcode', 'postal code', 'zip', 'zip code', 'country', 'residence', 'alamat', 'bandar', 'negeri', 'poskod', '地址', '住址'] },
  { key: 'emergencyContactName', label: 'Emergency contact name', aliases: ['emergency contact', 'emergency contact name', 'emergency name', 'ice contact', 'ice person', 'next of kin', 'next of kin name'] },
  { key: 'emergencyContactPhone', label: 'Emergency contact phone', aliases: ['emergency phone', 'emergency contact phone', 'emergency contact no', 'ice telephone', 'ice phone', 'next of kin phone'] },
  { key: 'allergies', label: 'Allergies', aliases: ['allergy', 'allergies', 'known allergies', 'known sensitivities', 'drug allergies'] },
  { key: 'medicalConditions', label: 'Medical conditions', aliases: ['medical condition', 'medical conditions', 'conditions', 'medical history', 'clinical background', 'health history', 'diagnoses'] },
  { key: 'medications', label: 'Medications', aliases: ['medication', 'medications', 'medicine', 'current medication', 'prescribed drugs', 'current drugs'] },
  { key: 'source', label: 'Source', aliases: ['source', 'patient source', 'referral source', 'how did you hear', 'discovery route', 'acquisition channel'] },
  { key: 'preferredDentist', label: 'Preferred dentist', aliases: ['preferred dentist', 'dentist', 'doctor', 'preferred doctor', 'requested clinician', 'assigned doctor', 'provider'] },
  { key: 'insurance', label: 'Insurance', aliases: ['insurance', 'insurance provider', 'insurer', 'health plan', 'coverage provider', 'payer'] },
  { key: 'notes', label: 'Notes', aliases: ['note', 'notes', 'remarks', 'remark', 'comments', 'front desk memo', 'internal memo'] },
];

export const normalizeHeader = (value) => String(value ?? '')
  .trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ');

export function suggestPatientMapping(headers) {
  const normalized = headers.map((header) => ({ header, normalized: normalizeHeader(header) }));
  return Object.fromEntries([...PATIENT_IMPORT_NAME_FIELDS, ...PATIENT_IMPORT_FIELDS].map((field) => {
    const exact = normalized.filter((item) => field.aliases.some((alias) => item.normalized === normalizeHeader(alias))).map((item) => item.header);
    return [field.key, PATIENT_IMPORT_NAME_FIELDS.includes(field) ? exact[0] || '' : exact];
  }));
}

export function suggestNameOrder(headers) {
  const normalized = headers.map(normalizeHeader);
  const familyIndex = normalized.findIndex((header) => PATIENT_IMPORT_NAME_FIELDS.find((field) => field.key === 'lastName').aliases.some((alias) => normalizeHeader(alias) === header));
  const givenIndex = normalized.findIndex((header) => PATIENT_IMPORT_NAME_FIELDS.find((field) => field.key === 'firstName').aliases.some((alias) => normalizeHeader(alias) === header));
  return familyIndex >= 0 && givenIndex >= 0 && familyIndex < givenIndex ? 'family-given' : 'given-family';
}

function detectCsvDelimiter(text) {
  const candidates = text.replace(/^\uFEFF/, '').split(/\r?\n/).slice(0, 20);
  const counts = [',', ';', '\t'].map((delimiter) => ({
    delimiter,
    count: Math.max(...candidates.map((line) => line.split(delimiter).length - 1)),
  }));
  return counts.sort((left, right) => right.count - left.count)[0].delimiter;
}

function csvRows(text) {
  const delimiter = detectCsvDelimiter(text);
  const rows = [];
  let row = []; let value = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted && character === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (!quoted && (character === delimiter || character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value); value = '';
      if (character !== delimiter) { if (row.some((cell) => cell.trim() !== '')) rows.push(row); row = []; }
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
  const aliases = new Set([...PATIENT_IMPORT_NAME_FIELDS, ...PATIENT_IMPORT_FIELDS].flatMap((field) => field.aliases.map(normalizeHeader)));
  const headerIndex = rows.slice(0, 20).map((row, index) => ({
    index,
    score: row.reduce((score, cell) => score + (aliases.has(normalizeHeader(cell)) ? 10 : String(cell ?? '').trim() ? 1 : 0), 0),
  })).sort((left, right) => right.score - left.score || left.index - right.index)[0].index;
  const seen = new Map();
  const headers = rows[headerIndex].map((header, index) => {
    const base = String(header || `Column ${index + 1}`).trim(); const count = (seen.get(base) || 0) + 1; seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
  return { headers, rows: rows.slice(headerIndex + 1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))) };
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

export function mapPatientRows(rows, mapping, dentists = [], nameOrder = 'given-family') {
  return rows.map((row, index) => {
    const columns = (key) => (Array.isArray(mapping[key]) ? mapping[key] : [mapping[key]]).filter(Boolean);
    const values = (key) => columns(key).map((column) => String(row[column] ?? '').trim()).filter(Boolean);
    const get = (key) => values(key)[0] || '';
    const join = (key, separator = '; ') => [...new Set(values(key))].join(separator);
    const patient = Object.fromEntries(PATIENT_IMPORT_FIELDS.map((field) => [field.key, get(field.key)]));
    const legalParts = nameOrder === 'family-given'
      ? [get('title'), get('lastName'), get('firstName'), get('middleName'), get('suffix')]
      : [get('title'), get('firstName'), get('middleName'), get('lastName'), get('suffix')];
    patient.name = get('name') || legalParts.filter(Boolean).join(' ') || get('nickname');
    const noteParts = values('notes');
    const preserveAdditional = (label, entries) => {
      const uniqueEntries = [...new Set(entries)];
      if (uniqueEntries.length > 1) noteParts.push(`${label}: ${uniqueEntries.slice(1).join(' / ')}`);
    };
    preserveAdditional('Additional phone', values('phone'));
    preserveAdditional('Additional email', values('email'));
    preserveAdditional('Additional ID', values('idNumber'));
    preserveAdditional('Additional tax number', values('taxNumber'));
    patient.notes = [...new Set(noteParts)].join('\n');
    const nickname = get('nickname');
    if (nickname && normalizeHeader(nickname) !== normalizeHeader(patient.name)) {
      const nicknameNote = `Preferred name: ${nickname}`;
      patient.notes = patient.notes ? `${patient.notes}\n${nicknameNote}` : nicknameNote;
    }
    const dobParts = [get('dobDay'), get('dobMonth'), get('dobYear')];
    const combinedDob = dobParts.every(Boolean) ? `${dobParts[0]}/${dobParts[1]}/${dobParts[2]}` : '';
    patient.dob = normalizeDate(get('dob') || combinedDob); patient.gender = normalizeGender(patient.gender);
    patient.address = join('address', ', ');
    patient.emergencyContactName = join('emergencyContactName', ' / ');
    patient.emergencyContactPhone = join('emergencyContactPhone', ' / ');
    patient.allergies = join('allergies'); patient.medicalConditions = join('medicalConditions');
    patient.medications = join('medications'); patient.source = join('source'); patient.insurance = join('insurance');
    patient.guardianName = join('guardianName', ' / ');
    patient.email = patient.email.toLowerCase(); patient.emailIsGuardian = truthy(patient.emailIsGuardian);
    patient.guardianRelationship = normalizeRelationship(patient.guardianRelationship);
    const dentistValues = values('preferredDentist').map((value) => value.toLowerCase());
    patient.preferredDentist = dentists.find((dentist) => dentistValues.includes(dentist.name?.trim().toLowerCase()))?.id || '';
    const errors = [];
    if (!patient.name) errors.push('Name is required');
    if (!patient.phone) errors.push('Phone is required');
    if ((get('dob') || dobParts.some(Boolean)) && !patient.dob) errors.push('Invalid date of birth');
    if (patient.gender && !['male', 'female', 'other'].includes(patient.gender)) errors.push('Gender must be male, female, or other');
    if (patient.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patient.email)) errors.push('Invalid email');
    if (patient.emailIsGuardian && (!patient.email || !patient.guardianName || !patient.guardianRelationship)) errors.push('Guardian email, name, and relationship are required');
    return { sourceRow: index + 2, patient, errors };
  });
}
