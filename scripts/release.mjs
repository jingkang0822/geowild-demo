import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const site = path.join(root, 'site');
const url = 'https://jingkang0822.github.io/geowild-demo/';
const species = JSON.parse(await readFile(path.join(root, 'data/animals.json'), 'utf8')).length;
const html = await readFile(path.join(site, 'index.html'), 'utf8');
if (!html.includes(url) || !html.includes(`PORTFOLIO DEMO · ${species} ANIMALS`)) throw new Error('Missing public demo identity');
await writeFile(path.join(site, '404.html'), html);
await writeFile(path.join(site, '.nojekyll'), '');
await writeFile(path.join(site, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${url}sitemap.xml\n`);
await writeFile(path.join(site, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url}</loc></url></urlset>\n`);
const files = {};
async function inspect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) await inspect(absolute);
    else {
      if (!entry.isFile()) throw new Error('Links cannot enter the public artifact');
      const name = path.relative(site, absolute);
      if (name === 'release.json') continue;
      const bytes = await readFile(absolute);
      if (/(?:gh[pousr]_[A-Za-z0-9]{30,}|sk-(?:proj-|live_)[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/.test(bytes.toString())) throw new Error(`Credential pattern in ${name}`);
      files[name] = { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
    }
  }
}
await inspect(site);
const identity = createHash('sha256').update(JSON.stringify(Object.entries(files).sort())).digest('hex');
await writeFile(path.join(site, 'release.json'), JSON.stringify({ name: 'GeoWild — Portfolio Demo', site: url, species, questionsPerRound: 5, storage: 'geowild-demo:v1', identity, files }, null, 2) + '\n');
console.log(JSON.stringify({ identity, files: Object.keys(files).length, bytes: Object.values(files).reduce((n, f) => n + f.bytes, 0) }));
