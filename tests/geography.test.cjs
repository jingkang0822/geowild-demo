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
test('every packaged species can score, reveal, and survive a serialized save', () => {
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
