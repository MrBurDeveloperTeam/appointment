import JSZip from 'jszip';
import fs from 'node:fs';
const zip = await JSZip.loadAsync(fs.readFileSync('outputs/patient-import-comprehensive-tests/03-edge-and-invalid-cases.xlsx'));
const xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
const rows = [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)];
console.log(rows[1]?.[0]);
