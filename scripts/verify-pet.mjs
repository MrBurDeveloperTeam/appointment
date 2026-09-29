import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
const host = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const root = dirname(require.resolve('@mrburdeveloperteam/pet-function/package.json'));
const manifest = JSON.parse(readFileSync(join(root, 'package.json')));
const declared = JSON.parse(readFileSync(join(host, 'package.json'))).dependencies['@mrburdeveloperteam/pet-function'];
assert.equal(manifest.version, declared.split('#v').at(-1));
assert.ok(!existsSync(join(host, 'public/games')), 'Host must not retain executable game copies.');
const canonical = join(root, 'public/games');
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const files = walk(canonical);
for (const file of files) {
  const relativePath = relative(canonical, file);
  const builtPath = join(host, 'dist/games', relativePath);
  if (relativePath === join('mole-game', 'index.wasm')) {
    assert.ok(!existsSync(builtPath), 'Cloudflare output must not contain the oversized raw Godot WASM.');
    const parts = [0, 1].map((part) => readFileSync(`${builtPath}.part${part}`));
    assert.deepEqual(Buffer.concat(parts), readFileSync(file));
    continue;
  }
  assert.deepEqual(readFileSync(builtPath), readFileSync(file));
}
assert.equal(walk(join(host, 'dist/games')).length, files.length + 1);
for (const game of ['flappy-cat', 'pac-cat', 'tetris', 'meowdoku', 'mole-game']) {
  assert.ok(existsSync(join(host, 'dist/games', game, 'index.html')));
}
console.log(`Verified pet-function ${manifest.version}: ${files.length} game files match exactly across five games.`);
