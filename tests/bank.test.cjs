'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../site/js/engine.js');
const context = { window: {} };
for (const name of ['animals', 'world']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, `../site/js/${name}.js`), 'utf8'), context);
const animals = JSON.parse(JSON.stringify(context.window.ANIMALS));
const world = JSON.parse(JSON.stringify(context.window.WORLD_DATA));
test('the public bank has exactly 100 scientifically distinct species from its canonical source', () => {
  const canonical = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/animals.json'), 'utf8'));
  assert.equal(animals.length, 100);
  assert.equal(new Set(animals.map(a => a.id)).size, 100);
  assert.equal(new Set(animals.map(a => a.scientificName)).size, 100);
  assert.deepEqual(animals, canonical);
});
test('an actual persisted reveal from the 17-species release remains readable without migration', () => {
  const legacy = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/legacy-17-reveal.json'), 'utf8'));
  assert.deepEqual(E.validateSavedGame(legacy, animals, world), legacy);
});

test('the existing practice selector reaches all 100 species across deterministic seeds', () => {
  const seen = new Set();
  for (let index = 0; index < 1000; index++) {
    const selected = E.practiceAnimals(animals, `public-bank-${index}`);
    assert.equal(selected.length, 5);
    assert.equal(new Set(selected.map(animal => animal.id)).size, 5);
    assert.ok(selected.slice(0, 2).every(animal => animal.tier === 'familiar'));
    for (const animal of selected) seen.add(animal.id);
  }
  assert.deepEqual([...seen].sort(), animals.map(animal => animal.id).sort());
});

test('one shared question contract scores every animal at all five weights and restores its reveal', () => {
  const anchors = require('../data/country-anchors.json').countries;
  let transitions = 0;
  for (const animal of animals) {
    const point = anchors[animal.nativeCountries[0]].point;
    for (let index = 0; index < 5; index++) {
      const score = E.scoreGuess(point, animal, index, world);
      assert.equal(score.points, [100, 100, 200, 300, 300][index], `${animal.id}: question ${index + 1}`);
    }
    const selected = [animal, ...animals.filter(other => other.id !== animal.id).slice(0, 4)];
    const before = E.createGame({ mode: 'practice', day: '2026-10-23', animals: selected });
    const reveal = E.submitGuess(before, point, animal, world);
    assert.equal(reveal.stage, 'reveal', animal.id);
    assert.equal(reveal.results.length, 1, animal.id);
    assert.equal(reveal.results[0].animalId, animal.id);
    assert.equal(reveal.results[0].points, 100);
    assert.deepEqual(E.submitGuess(reveal, [-130, -40], animal, world), reveal, `${animal.id}: duplicate submission`);
    assert.deepEqual(E.validateSavedGame(JSON.parse(JSON.stringify(reveal)), animals, world), reveal, `${animal.id}: reload`);
    assert.equal(E.nextQuestion(reveal).index, 1, animal.id);
    transitions++;
  }
  assert.equal(transitions, 100);
});
