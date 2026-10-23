const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../site/js/engine.js');
const context = vm.createContext({ window: {} });
for (const file of ['world.js', 'animals.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../site/js', file), 'utf8'), context);
const world = JSON.parse(JSON.stringify(context.window.WORLD_DATA));
const animals = JSON.parse(JSON.stringify(context.window.ANIMALS));
test('packaged native countries accept geographically separated real points', () => {
  const panda = animals.find(animal => animal.id === 'giant-panda');
  for (const point of [[116.4, 39.9], [91.13, 29.65], [104.07, 30.67]]) assert.equal(E.scoreGuess(point, panda, 0, world).points, 100);
  const lynx = animals.find(animal => animal.id === 'iberian-lynx');
  for (const point of [[-3.7, 40.4], [-8, 39.5]]) assert.equal(E.scoreGuess(point, lynx, 2, world).points, 200);
  assert.ok(E.scoreGuess([139.7, 35.7], lynx, 2, world).distanceKm > 9000);
});
test('representative daily rounds complete with a consistent serialized score', () => {
  for (let day = 1; day <= 12; day++) {
    const date = `2026-10-${String(day).padStart(2, '0')}`;
    const selected = E.dailyAnimals(animals, date);
    let state = E.createGame({ day: date, animals: selected });
    for (let i = 0; i < 5; i++) {
      state = E.submitGuess(state, [15, 12], selected[i], world);
      assert.ok(Number.isFinite(state.results[i].distanceKm));
      assert.deepEqual(E.validateSavedGame(JSON.parse(JSON.stringify(state)), animals, world), state);
      state = E.nextQuestion(state);
    }
    assert.equal(state.stage, 'complete');
    assert.ok(E.totalScore(state) >= 0 && E.totalScore(state) <= 1000);
  }
});

const evidence = require('../data/range-evidence.json');
const anchors = require('../data/country-anchors.json').countries;
const normalize = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z]/g, '');
const countryCodes = new Map(world.features.map(feature => [normalize(feature.properties.name), feature.properties.code]));
for (const [name, code] of Object.entries(evidence.mapAliases)) countryCodes.set(normalize(name), code);

test('every species answer is traceable to primary country data and explicit reviewed corrections', () => {
  assert.equal(animals.length, 100);
  assert.deepEqual(Object.keys(evidence.records).sort(), animals.map(a => a.id).sort());
  for (const animal of animals) {
    const record = evidence.records[animal.id];
    assert.equal(record.scientificName, animal.scientificName, animal.id);
    assert.ok(record.source.startsWith('https:'), animal.id);
    let expected;
    if (record.authority === 'MDD v2.5') {
      assert.equal(record.mddScientificName, evidence.taxonomicAliases[animal.scientificName] ?? animal.scientificName, animal.id);
      const names = record.countryDistribution.split('|').filter(name => !name.includes('?'));
      expected = new Set(names.map(name => {
        const code = countryCodes.get(normalize(name));
        assert.ok(code, `Unmapped primary country ${name}`);
        return code;
      }));
      if (record.correction) {
        assert.ok(record.correction.source.startsWith('https:') && record.correction.reason, animal.id);
        for (const code of record.correction.remove) assert.ok(expected.delete(code), `${animal.id}: correction must remove an actual source country`);
        for (const code of record.correction.add) { assert.ok(!expected.has(code), animal.id); expected.add(code); }
      }
    } else {
      assert.ok(record.review, animal.id);
      expected = new Set(record.expectedCountries);
    }
    assert.deepEqual([...expected].sort(), [...animal.nativeCountries].sort(), animal.id);
    assert.deepEqual(record.expectedCountries, [...expected].sort(), animal.id);
  }
});

test('independent country label-coordinate fixtures fall inside all 157 accepted country geometries', () => {
  const accepted = [...new Set(animals.flatMap(animal => animal.nativeCountries))].sort();
  assert.equal(accepted.length, 157);
  assert.deepEqual(Object.keys(anchors).sort(), accepted);
  for (const code of accepted) {
    assert.equal(E.distanceToCountries(anchors[code].point, [code], world).distanceKm, 0, `${code}: ${anchors[code].name}`);
  }
});

test('every species accepts every sourced native country and rejects an open-Pacific guess', () => {
  let pairs = 0;
  for (const animal of animals) {
    for (const code of animal.nativeCountries) {
      const result = E.scoreGuess(anchors[code].point, animal, 0, world);
      assert.equal(result.distanceKm, 0, `${animal.id}: ${code}`);
      assert.equal(result.points, 100, `${animal.id}: ${code}`);
      pairs++;
    }
    const outside = E.scoreGuess([-130, -40], animal, 0, world);
    assert.ok(outside.distanceKm > 0 && outside.points < 100, `${animal.id}: an outside guess cannot be correct`);
  }
  assert.equal(pairs, 1214);
});

test('introduced, extinct and uncertain populations do not become accidental answers', () => {
  const exclusions = { tiger: ['LAO', 'KHM', 'VNM'], 'sloth-bear': ['BGD'], raccoon: ['DEU'], hippopotamus: ['COL'], 'eastern-gray-squirrel': ['GBR'], 'american-mink': ['GBR'], 'short-tailed-chinchilla': ['ARG', 'BOL'] };
  for (const [id, codes] of Object.entries(exclusions)) {
    const animal = animals.find(a => a.id === id);
    assert.ok(animal, id);
    for (const code of codes) assert.ok(!animal.nativeCountries.includes(code), `${id}: ${code}`);
  }
});
