import { gzipSync, gunzipSync } from 'node:zlib';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const host = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wasmPath = join(host, 'dist', 'games', 'mole-game', 'index.wasm');
const compressedPath = `${wasmPath}.gz`;

if (!existsSync(wasmPath)) {
  throw new Error(`Missing Godot WebAssembly build output: ${wasmPath}`);
}

const wasm = readFileSync(wasmPath);
const compressed = gzipSync(wasm, { level: 9 });

if (!gunzipSync(compressed).equals(wasm)) {
  throw new Error('Compressed Godot WebAssembly failed its round-trip integrity check.');
}

writeFileSync(compressedPath, compressed);
rmSync(wasmPath);

const mib = (bytes) => (bytes / 1024 / 1024).toFixed(2);
console.log(`Compressed Godot WebAssembly: ${mib(wasm.length)} MiB -> ${mib(compressed.length)} MiB`);
