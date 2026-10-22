'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../site');
const context = vm.createContext({ window: {} });
for (const file of ['js/world.js', 'js/animals.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
const { ANIMALS: animals, WORLD_DATA: world } = context.window;
const codes = new Set(world.features.map(feature => feature.properties.code));
assert.equal(animals.length, 17, 'The portfolio release has exactly 17 approved species');
assert.equal(new Set(animals.map(animal => animal.id)).size, animals.length);
let bytes = 0;
for (const animal of animals) {
  for (const field of ['id', 'name', 'scientificName', 'alt', 'nativeLabel', 'fact']) assert.ok(typeof animal[field] === 'string' && animal[field].trim(), `${animal.id}: ${field}`);
  assert.ok(animal.nativeCountries.length && animal.nativeCountries.every(code => codes.has(code)), `${animal.id}: missing country polygon`);
  assert.ok(animal.sources.length);
  for (const source of animal.sources) assert.ok(source.label && new URL(source.url).protocol === 'https:');
  for (const field of ['author', 'license', 'licenseUrl', 'url', 'sourceUrl']) assert.ok(animal.photo[field]);
  assert.equal(new URL(animal.photo.licenseUrl).hostname, 'creativecommons.org');
  assert.equal(new URL(animal.photo.sourceUrl).protocol, 'https:');
  assert.match(animal.image, /^assets\/animals\/[a-z0-9-]+\.jpg$/);
  const photo = fs.readFileSync(path.join(root, animal.image));
  assert.equal(photo.readUInt16BE(0), 0xffd8, `${animal.id}: JPEG start`);
  assert.equal(photo.readUInt16BE(photo.length - 2), 0xffd9, `${animal.id}: JPEG end`);
  assert.ok(photo.length > 1000 && photo.length < 400000, `${animal.id}: photo size`);
  bytes += photo.length;
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.match(html, /<html lang="en"/);
for (const [, url] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (!/^https?:/.test(url)) assert.ok(fs.statSync(path.join(root, url)).isFile(), `Missing entry dependency: ${url}`);
}
for (const file of ['index.html', 'js/app.js', 'js/globe.js', 'js/engine.js', 'js/animals.js']) {
  assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /\p{Script=Han}/u, `${file}: untranslated UI`);
}
assert.ok(fs.existsSync(path.join(root, 'vendor/MAPLIBRE-LICENSE.txt')));
assert.ok(fs.existsSync(path.join(root, 'vendor/NATURAL-EARTH-LICENSE.txt')));
console.log(`Package verified: ${animals.length} sourced animals, ${codes.size} country identities, ${bytes.toLocaleString('en-US')} photo bytes; all entry files local; English UI.`);
