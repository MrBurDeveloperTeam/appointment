import { it } from 'vitest';
import fs from 'node:fs';
import { Blob as NodeBlob } from 'node:buffer';
import { mapPatientRows, readPatientFile, suggestPatientMapping } from './patientImport';

it('prints generated xlsx parsing', async () => {
  globalThis.Blob = NodeBlob;
  for (const name of ['03-edge-and-invalid-cases.xlsx', '02-valid-alternate-headers.xlsx']) {
    const bytes = fs.readFileSync(`C:/Users/user/Desktop/intern/appointment/outputs/patient-import-comprehensive-tests/${name}`);
    const file = { name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    const parsed = await readPatientFile(file);
    const mapping = suggestPatientMapping(parsed.headers);
    console.log(name, parsed.headers, parsed.rows.slice(0, 3), mapping, mapPatientRows(parsed.rows.slice(0, 3), mapping));
  }
});
