// Controller and adapter tests use the shipped scripts and domain/data modules.
// DOM/WebGL boundaries are substitutes; native Chrome must compensate them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function appFixture({ saved, hash = '', blockedStorage = false } = {}) {
  const listeners = {}, nodes = new Map(), photos = [], globes = [];
  const storage = new Map(saved ? [['geowild-demo:v1', saved]] : []);
  const location = { hash, reload() {} };
  let context;
  class Node {
    constructor(id = '') { this.id = id; this.hidden = false; this.disabled = false; this.children = []; this.handlers = {}; this.dataset = {}; this._html = ''; this.parentElement = { hidden: false }; }
    set innerHTML(value) { this._html = value; }
    get innerHTML() { return this._html; }
    replaceChildren(...children) { this.children = children; this.textContent = children.map(v => v.textContent || '').join(''); }
    append(node) { this.children.push(node); }
    addEventListener(name, handler) { this.handlers[name] = handler; }
    querySelectorAll() { return [...this._html.matchAll(/data-route="([^"]+)"/g)].map(match => { const node = new Node(); node.dataset.route = match[1]; return node; }); }
    focus() { document.activeElement = this; }
    select() { this.selected = true; }
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  for (const match of read('site/index.html').matchAll(/id="([^"]+)"/g)) nodes.set(match[1], new Node(match[1]));
  const document = { getElementById: id => nodes.get(id), createTextNode: textContent => ({ textContent }), createElement: () => new Node(), activeElement: null };
  const entries = [{ hash, state: null }];
  const history = {
    state: null,
    pushState(state, unused, next) { this.state = state; location.hash = next; entries.push({ hash: next, state }); },
    replaceState(state, unused, next) { this.state = state; location.hash = next; entries[entries.length - 1] = { hash: next, state }; },
    back() { if (entries.length > 1) entries.pop(); const prior = entries.at(-1); this.state = prior.state; location.hash = prior.hash; listeners.popstate?.(); }
  };
  class Globe {
    constructor(container, options) { this.options = options; this.ready = true; globes.push(this); }
    reset() { this.draft = null; }
    setGuessEnabled(value) { this.enabled = value; }
    setDraft(value) { this.draft = value; }
    reveal(value) { this.revealed = value; this.savedAtReveal = storage.get('geowild-demo:v1'); }
    getCenter() { return [15, 12]; }
    zoomBy() {}
    destroy() { this.destroyed = true; }
  }
  const sandbox = {
    document, location, history, URL, Intl, console,
    navigator: {},
    localStorage: {
      getItem: key => { if (blockedStorage) throw new Error('Unavailable'); return storage.get(key) || null; },
      setItem: (key, value) => { if (blockedStorage) throw new Error('Unavailable'); storage.set(key, value); }
    },
    Image: class { constructor() { photos.push(this); } },
    GeoWildGlobe: Globe,
    scrollTo() {},
    addEventListener: (name, handler) => { listeners[name] = handler; }
  };
  sandbox.window = sandbox;
  context = vm.createContext(sandbox);
  for (const file of ['world', 'animals', 'engine', 'app']) vm.runInContext(read(`site/js/${file}.js`), context, { filename: file });
  return { nodes, photos, globes, storage, context, location, history, click: id => nodes.get(id).onclick(), saved: () => JSON.parse(storage.get('geowild-demo:v1')), loadPhoto: () => photos.at(-1).onload() };
}

test('home PLAY launches practice independently of daily completion', () => {
  const f = appFixture();
  f.click('start-button');
  assert.equal(f.saved().practice?.mode, 'practice');
  assert.equal(Object.keys(f.saved().daily).length, 0);
  assert.equal(f.nodes.get('start-button').textContent, 'PLAY');
  f.loadPhoto();
  f.click('center-guess');
  f.click('next-button');
  const unfinished = JSON.stringify(f.saved().practice);
  f.click('home-link');
  assert.match(f.nodes.get('play-note').textContent, /Resume your practice/);
  f.click('start-button');
  assert.equal(JSON.stringify(f.saved().practice), unfinished);
  f.click('home-link');
  f.click('daily-button');
  for (let i = 0; i < 5; i += 1) { f.loadPhoto(); f.click('center-guess'); f.click('next-button'); }
  const completedDaily = JSON.stringify(f.saved().daily);
  assert.equal(Object.values(f.saved().daily)[0].stage, 'complete');
  f.click('results-home');
  assert.equal(f.nodes.get('start-button').textContent, 'PLAY');
  assert.equal(f.nodes.get('start-button').disabled, false);
  assert.match(f.nodes.get('daily-button').textContent, /Daily results/);
  f.click('start-button');
  assert.equal(JSON.stringify(f.saved().practice), unfinished);
  assert.equal(JSON.stringify(f.saved().daily), completedDaily);
  assert.equal(f.nodes.get('mode-label').textContent, 'PRACTICE');
});

test('shipped controller persists reveal before globe movement, rejects double tap, and reloads reveal', () => {
  const f = appFixture();
  f.click('daily-button');
  assert.equal(f.nodes.get('center-guess').disabled, true);
  f.loadPhoto();
  f.click('center-guess');
  const saved = f.saved();
  const game = Object.values(saved.daily)[0];
  assert.equal(game.stage, 'reveal');
  assert.equal(game.results.length, 1);
  assert.equal(JSON.parse(f.globes[0].savedAtReveal).daily[game.day].stage, 'reveal');
  f.globes[0].options.onGuess([15, 12]);
  assert.equal(Object.values(f.saved().daily)[0].results.length, 1);
  const resumed = appFixture({ saved: f.storage.get('geowild-demo:v1'), hash: '#play' });
  assert.equal(resumed.nodes.get('answer-panel').hidden, false);
  assert.equal(resumed.nodes.get('next-button').hidden, false);
  assert.equal(resumed.globes[0].revealed.guess.length, 2);
});

test('confirmation is movable and explicit; stale photo cannot unlock the next round', () => {
  const f = appFixture();
  f.click('daily-button');
  f.loadPhoto();
  const setting = f.nodes.get('confirm-setting');
  setting.onchange({ target: { checked: true } });
  f.globes[0].options.onGuess([20, 15]);
  f.globes[0].options.onGuess([30, 20]);
  assert.equal(Object.values(f.saved().daily)[0].results.length, 0);
  assert.deepEqual(f.globes[0].draft, [30, 20]);
  f.click('lock-guess');
  assert.deepEqual(Object.values(f.saved().daily)[0].results[0].guess, [30, 20]);
  const stale = f.photos[0];
  f.click('next-button');
  stale.onload();
  assert.equal(f.nodes.get('center-guess').disabled, true);
  f.photos.at(-1).onerror();
  assert.equal(f.nodes.get('retry-photo').hidden, false);
  f.click('retry-photo');
  f.loadPhoto();
  assert.equal(f.nodes.get('center-guess').disabled, false);
  assert.equal(f.nodes.get('retry-photo').hidden, true);
});

test('practice survives reload and never changes the completed daily; clipboard denial is selectable', async () => {
  const f = appFixture();
  f.click('daily-button');
  for (let i = 0; i < 5; i += 1) { f.loadPhoto(); f.click('center-guess'); f.click('next-button'); }
  assert.equal(f.location.hash, '#results');
  const originalDaily = JSON.stringify(f.saved().daily);
  await f.click('share-button');
  assert.equal(f.nodes.get('share-fallback').hidden, false);
  assert.equal(f.nodes.get('share-text').selected, true);
  assert.ok(f.nodes.get('share-text').value.includes('https://jingkang0822.github.io/geowild-demo/'));
  assert.doesNotMatch(f.nodes.get('share-text').value, /chatgpt\.site/);
  assert.match(f.nodes.get('share-status').textContent, /did not allow automatic copying/);
  f.click('practice-button');
  f.loadPhoto();
  f.click('center-guess');
  assert.equal(JSON.stringify(f.saved().daily), originalDaily);
  assert.equal(f.saved().practice.stage, 'reveal');
  const resumed = appFixture({ saved: f.storage.get('geowild-demo:v1'), hash: '#play' });
  assert.match(resumed.nodes.get('mode-label').textContent, /PRACTICE/);
  assert.equal(resumed.nodes.get('answer-panel').hidden, false);
});

test('corrupt save is retained, storage denial stays playable, and modal Back closes', () => {
  const f = appFixture({ saved: '{broken' });
  assert.equal(f.nodes.get('global-notice').hidden, false);
  f.click('daily-button');
  f.loadPhoto();
  f.click('center-guess');
  assert.equal(f.storage.get('geowild-demo:v1'), '{broken');
  assert.equal(f.nodes.get('answer-panel').hidden, false);
  f.click('menu-button');
  assert.equal(f.nodes.get('info-dialog').open, true);
  f.history.back();
  assert.equal(f.nodes.get('info-dialog').open, false);
  const denied = appFixture({ blockedStorage: true });
  denied.click('daily-button');
  denied.loadPhoto();
  denied.click('center-guess');
  assert.equal(denied.nodes.get('answer-panel').hidden, false);
  assert.match(denied.nodes.get('global-notice').textContent, /cannot read/);
});

test('shipped globe queues the latest pre-load state and does not turn drag into guess', () => {
  const listeners = {}, canvasEvents = {}, maps = [];
  let time = 1000;
  class Map {
    constructor() { this.sources = {}; this.layers = []; this.container = { clientWidth: 600 }; maps.push(this); }
    addControl() {}
    getCanvas() { return { setAttribute() {}, addEventListener: (name, fn) => { canvasEvents[name] = fn; } }; }
    on(name, fn) { listeners[name] = fn; }
    setProjection(value) { this.projection = value; }
    addSource(name, options) { this.sources[name] = { data: options.data, setData(data) { this.data = data; } }; }
    addLayer(value) { this.layers.push(value); }
    getSource(name) { return this.sources[name]; }
    setFilter(name, value) { this.filter = value; }
    getContainer() { return this.container; }
    fitBounds(bounds) { this.bounds = bounds; }
    jumpTo() {}
    resize() {}
    remove() { this.removed = true; }
  }
  const guesses = [], sandbox = { maplibregl: { Map, AttributionControl: class {} }, WORLD_DATA: { type: 'FeatureCollection', features: [] }, ResizeObserver: class { observe() {} disconnect() {} }, matchMedia: () => ({ matches: true }), performance: { now: () => time } };
  sandbox.window = sandbox;
  vm.runInNewContext(read('site/js/globe.js'), sandbox);
  const globe = new sandbox.GeoWildGlobe({}, { onGuess: value => guesses.push(value) });
  globe.reveal({ guess: [179, 10], nearest: [-179, 12], countryCodes: ['FJI'] });
  globe.reset();
  globe.setDraft([30, 20]);
  listeners.load();
  assert.equal(maps[0].projection.type, 'globe');
  assert.equal(maps[0].sources.selection.data.features.length, 1);
  assert.equal(maps[0].sources.connection.data.features.length, 0);
  globe.setGuessEnabled(true);
  canvasEvents.pointerdown({ clientX: 0, clientY: 0 });
  canvasEvents.pointermove({ clientX: 20, clientY: 0 });
  listeners.click({ lngLat: { lng: 10, lat: 10 } });
  assert.equal(guesses.length, 0);
  time += 500;
  listeners.click({ lngLat: { lng: 181, lat: 10 } });
  assert.equal(guesses.length, 1);
  assert.equal(guesses[0][0], -179);
  globe.reveal({ guess: [179, 10], nearest: [-179, 12], countryCodes: ['FJI'] });
  assert.equal(maps[0].sources.selection.data.features.length, 2);
  assert.ok(Math.abs(maps[0].bounds[1][0] - maps[0].bounds[0][0]) < 3);
  globe.destroy();
  assert.equal(maps[0].removed, true);
});
