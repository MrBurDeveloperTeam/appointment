import fs from 'node:fs/promises';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const headers = [
  'Name',
  'IC/ID',
  'DOB',
  'Gender',
  'Tax Number',
  'Phone',
  'Email',
  'Address',
  'Emergency Contact Name',
  'Emergency Contact Phone',
  'Allergies',
  'Medical Conditions',
  'Medications',
  'Source',
  'Preferred Dentist',
  'Insurance',
  'Notes',
];

const workbook = Workbook.create();
const sheet = workbook.worksheets.add('Patients');
sheet.showGridLines = false;
sheet.freezePanes.freezeRows(1);
sheet.getRange('A1:Q1').values = [headers];
sheet.getRange('A1:Q1').format = {
  fill: '#167F75',
  font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' },
  horizontalAlignment: 'center',
  verticalAlignment: 'center',
  wrapText: true,
  borders: { preset: 'all', style: 'thin', color: '#FFFFFF' },
  rowHeight: 32,
};
sheet.getRange('A2:Q101').format = {
  font: { name: 'Arial', size: 10, color: '#172B4D' },
  verticalAlignment: 'center',
  borders: { preset: 'all', style: 'thin', color: '#DDE5EA' },
  rowHeight: 22,
};
sheet.getRange('B2:B101').setNumberFormat('@');
sheet.getRange('C2:C101').setNumberFormat('yyyy-mm-dd');
sheet.getRange('E2:F101').setNumberFormat('@');
sheet.getRange('J2:J101').setNumberFormat('@');
sheet.getRange('D2:D101').dataValidation = {
  rule: { type: 'list', values: ['Male', 'Female', 'Other'] },
};

const widths = [22, 17, 13, 12, 16, 16, 24, 30, 24, 24, 22, 25, 22, 18, 22, 20, 30];
for (let index = 0; index < widths.length; index += 1) {
  sheet.getRangeByIndexes(0, index, 101, 1).format.columnWidth = widths[index];
}

workbook.recalculate();
const check = await workbook.inspect({
  kind: 'table',
  range: 'Patients!A1:Q3',
  include: 'values,formulas',
  tableMaxRows: 3,
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

const preview = await workbook.render({ sheetName: 'Patients', range: 'A1:Q8', scale: 1, format: 'png' });
await fs.writeFile('outputs/patient-import-template/preview.png', new Uint8Array(await preview.arrayBuffer()));

const outputPath = 'outputs/patient-import-template/patient-import-template.xlsx';
const publicPath = 'public/templates/patient-import-template.xlsx';
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
await fs.copyFile(outputPath, publicPath);

