import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const host = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wasmPath = join(host, 'dist', 'games', 'mole-game', 'index.wasm');
const partSize = 20 * 1024 * 1024;

if (!existsSync(wasmPath)) {
  throw new Error(`Missing Godot WebAssembly build output: ${wasmPath}`);
}

const wasm = readFileSync(wasmPath);
const parts = [];
for (let offset = 0; offset < wasm.length; offset += partSize) {
  const part = wasm.subarray(offset, Math.min(offset + partSize, wasm.length));
  const partPath = `${wasmPath}.part${parts.length}`;
  writeFileSync(partPath, part);
  parts.push(partPath);
}

const restored = Buffer.concat(parts.map((partPath) => readFileSync(partPath)));
if (!restored.equals(wasm)) {
  throw new Error('Split Godot WebAssembly failed its round-trip integrity check.');
}

rmSync(wasmPath);
console.log(`Split Godot WebAssembly into ${parts.length} Cloudflare-safe assets.`);
