'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../site');
const release = JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(release.site, 'https://jingkang0822.github.io/geowild-demo/');
assert.equal(release.species, JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/animals.json'), 'utf8')).length);
assert.equal(release.questionsPerRound, 5);
assert.equal(release.storage, 'geowild-demo:v1');
const actual = [];
function inspect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) inspect(absolute);
    else {
      assert.ok(entry.isFile(), 'Public artifact cannot contain links');
      actual.push(path.relative(root, absolute));
    }
  }
}
inspect(root);
assert.deepEqual(actual.filter(name => name !== 'release.json').sort(), Object.keys(release.files).sort());
for (const [name, expected] of Object.entries(release.files)) {
  assert.match(name, /^(?:index\.html|404\.html|\.nojekyll|robots\.txt|sitemap\.xml|(?:assets\/animals\/[a-z0-9-]+\.jpg)|(?:js\/[a-z-]+\.js)|styles\.css|vendor\/[a-zA-Z0-9_.-]+)$/);
  const bytes = fs.readFileSync(path.join(root, name));
  assert.equal(bytes.length, expected.bytes, name);
  assert.equal(hash(bytes), expected.sha256, name);
}
assert.equal(hash(JSON.stringify(Object.entries(release.files).sort())), release.identity);
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
assert.ok(app.includes(`const STORAGE_KEY = '${release.storage}';`));
assert.ok(app.includes(`const SHARE_ORIGIN = '${release.site}';`));
assert.ok(!app.includes('chatgpt.site'));
console.log(`Release verified: ${release.identity}`);
