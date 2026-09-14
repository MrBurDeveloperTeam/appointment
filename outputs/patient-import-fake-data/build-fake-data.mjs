import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const inputPath = 'public/templates/patient-import-template.xlsx';
const outputPath = 'outputs/patient-import-fake-data/patient-import-fake-data.xlsx';
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const sheet = workbook.worksheets.getItem('Patients');

const rows = [
  ['Ahmad Firdaus Ismail', '900101-00-0001', new Date('1990-01-01T00:00:00Z'), 'Male', 'TEST-TIN-001', '012-000-1001', 'ahmad.firdaus@example.com', '12 Jalan Contoh, Kuala Lumpur', 'Siti Hajar Ismail', '012-000-2001', 'Penicillin', 'Asthma', 'Salbutamol inhaler', 'Google Search', 'Dr. Aisha Rahman', 'TestCare Medical', 'Prefers morning appointments'],
  ['Nur Aisyah Rahman', '920215-00-0002', new Date('1992-02-15T00:00:00Z'), 'Female', 'TEST-TIN-002', '012-000-1002', 'nur.aisyah@example.com', '8 Persiaran Demo, Shah Alam', 'Rahman Abdullah', '012-000-2002', 'None', 'None', 'None', 'Patient referral', 'Dr. Daniel Lim', 'DemoHealth Insurance', 'Requires Malay-language reminders'],
  ['Daniel Tan Wei Ming', '850630-00-0003', new Date('1985-06-30T00:00:00Z'), 'Male', 'TEST-TIN-003', '012-000-1003', 'daniel.tan@example.com', '25 Jalan Ujian, Petaling Jaya', 'Tan Mei Ling', '012-000-2003', 'Latex', 'Hypertension', 'Amlodipine', 'Facebook', 'Dr. Aisha Rahman', 'TestCare Medical', 'Call before confirming'],
  ['Priya Nair', '951122-00-0004', new Date('1995-11-22T00:00:00Z'), 'Female', 'TEST-TIN-004', '012-000-1004', 'priya.nair@example.com', '3 Lorong Sampel, Subang Jaya', 'Arun Nair', '012-000-2004', 'Ibuprofen', 'Migraine', 'Sumatriptan', 'Clinic website', 'Dr. Mei Chen', 'DemoHealth Insurance', 'Prefers female dentist'],
  ['Lim Jia Hui', '010405-00-0005', new Date('2001-04-05T00:00:00Z'), 'Female', 'TEST-TIN-005', '012-000-1005', 'lim.jiahui@example.com', '17 Taman Percubaan, Klang', 'Lim Kok Wah', '012-000-2005', 'None', 'Diabetes', 'Metformin', 'Instagram', 'Dr. Daniel Lim', 'Sample Assurance', 'Evening appointments preferred'],
  ['Muhammad Hakim Zulkifli', '880918-00-0006', new Date('1988-09-18T00:00:00Z'), 'Male', 'TEST-TIN-006', '012-000-1006', 'hakim.zulkifli@example.com', '40 Jalan Mock, Ampang', 'Zulkifli Hassan', '012-000-2006', 'Sulfa drugs', 'None', 'None', 'Walk-in', 'Dr. Aisha Rahman', 'Self-pay', 'Sensitive teeth'],
  ['Samantha Lee', '980207-00-0007', new Date('1998-02-07T00:00:00Z'), 'Female', 'TEST-TIN-007', '012-000-1007', 'samantha.lee@example.com', '6 Jalan Example, Cheras', 'Marcus Lee', '012-000-2007', 'None', 'Eczema', 'Topical cream', 'Friend referral', 'Dr. Mei Chen', 'Sample Assurance', 'First dental visit in five years'],
  ['Arjun Kumar', '930814-00-0008', new Date('1993-08-14T00:00:00Z'), 'Male', 'TEST-TIN-008', '012-000-1008', 'arjun.kumar@example.com', '29 Persiaran Test, Puchong', 'Meena Kumar', '012-000-2008', 'Aspirin', 'None', 'None', 'Google Maps', 'Dr. Daniel Lim', 'Self-pay', 'Prefers WhatsApp contact'],
  ['Aina Sofea Mazlan', '000312-00-0009', new Date('2000-03-12T00:00:00Z'), 'Female', 'TEST-TIN-009', '012-000-1009', 'aina.sofea@example.com', '11 Jalan Simulasi, Putrajaya', 'Mazlan Omar', '012-000-2009', 'None', 'Anaemia', 'Iron supplement', 'TikTok', 'Dr. Aisha Rahman', 'TestCare Medical', 'Student'],
  ['Jordan Alex', '970726-00-0010', new Date('1997-07-26T00:00:00Z'), 'Other', 'TEST-TIN-010', '012-000-1010', 'jordan.alex@example.com', '5 Lorong Dummy, Cyberjaya', 'Taylor Alex', '012-000-2010', 'None', 'None', 'None', 'Email campaign', 'Dr. Mei Chen', 'DemoHealth Insurance', 'Use email as primary contact'],
];

sheet.getRange('A2:Q11').values = rows;
sheet.getRange('A2:Q11').format.wrapText = false;
sheet.getRange('A2:Q11').format.verticalAlignment = 'center';
sheet.getRange('B2:B11').setNumberFormat('@');
sheet.getRange('C2:C11').setNumberFormat('yyyy-mm-dd');
sheet.getRange('E2:F11').setNumberFormat('@');
sheet.getRange('J2:J11').setNumberFormat('@');

workbook.recalculate();
const check = await workbook.inspect({
  kind: 'table',
  range: 'Patients!A1:Q11',
  include: 'values,formulas',
  tableMaxRows: 11,
  tableMaxCols: 17,
});
console.log(check.ndjson);
const errors = await workbook.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',
  options: { useRegex: true, maxResults: 100 },
  summary: 'final formula error scan',
});
console.log(errors.ndjson);

const preview = await workbook.render({ sheetName: 'Patients', range: 'A1:Q11', scale: 1, format: 'png' });
await fs.writeFile('outputs/patient-import-fake-data/preview.png', new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
