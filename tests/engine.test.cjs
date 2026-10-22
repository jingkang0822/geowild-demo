const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../site/js/engine.js');

const square = (code, minX, minY, maxX, maxY, holes = []) => ({
  type: 'Feature', properties: { code, name: code },
  geometry: { type: 'Polygon', coordinates: [
    [[minX,minY],[maxX,minY],[maxX,maxY],[minX,maxY],[minX,minY]], ...holes
  ] }
});
const world = { type: 'FeatureCollection', features: [
  square('AAA', 10, 10, 20, 20), square('BBB', -20, -10, -10, 0),
  square('HOLE', 30, 10, 40, 20, [[[33,13],[37,13],[37,17],[33,17],[33,13]]]),
  { type:'Feature', properties:{code:'DATE',name:'Date line'}, geometry:{type:'Polygon',coordinates:[[[175,-10],[-175,-10],[-175,10],[175,10],[175,-10]]]}}
] };
const animals = Array.from({length: 20}, (_, index) => ({id:`animal-${index}`,name:`Animal ${index}`,nativeCountries:['AAA']}));

test('a shared UTC date produces five stable, distinct species', () => {
  assert.equal(engine.dayKey(new Date('2026-10-22T23:59:59Z')), '2026-10-22');
  const a = engine.dailyAnimals(animals, '2026-10-22');
  assert.equal(a.length, 5);
  assert.equal(new Set(a.map(x => x.id)).size, 5);
  assert.deepEqual(engine.dailyAnimals(animals, '2026-10-22'), a);
  assert.notDeepEqual(engine.dailyAnimals(animals, '2026-10-23'), a);
});
test('familiar animals open every round and discovery appears occasionally later', () => {
  const bank = animals.map((animal, i) => ({...animal, tier: i < 12 ? 'familiar' : 'discovery'}));
  let discoveries = 0;
  for (let day = 0; day < 1000; day++) {
    const selected = engine.dailyAnimals(bank, `sample-${day}`);
    assert.equal(selected.length, 5);
    assert.equal(new Set(selected.map(animal => animal.id)).size, 5);
    assert.ok(selected.slice(0, 2).every(animal => animal.tier === 'familiar'));
    discoveries += selected.slice(2).filter(animal => animal.tier === 'discovery').length;
    assert.deepEqual(engine.dailyAnimals(bank, `sample-${day}`), selected);
  }
  assert.ok(discoveries > 350 && discoveries < 550, `Expected about 15% of 3000 later slots, got ${discoveries}`);
  const allFamiliar = bank.filter(animal => animal.tier === 'familiar');
  assert.ok(engine.practiceAnimals(allFamiliar, 'no-discovery').every(animal => animal.tier === 'familiar'));
});
test('the whole accepted country counts, including distant points within it', () => {
  for (const point of [[11,11],[19,19],[10,15],[20,20]]) {
    assert.equal(engine.distanceToCountries(point,['AAA'],world).distanceKm,0);
    assert.equal(engine.scoreGuess(point,animals[0],0,world).baseScore,100);
  }
});
test('multiple native countries are accepted and nearer misses score higher', () => {
  const animal={...animals[0],nativeCountries:['AAA','BBB']};
  assert.equal(engine.scoreGuess([-15,-5],animal,0,world).points,100);
  const near=engine.scoreGuess([21,15],animal,0,world);
  const far=engine.scoreGuess([70,40],animal,0,world);
  assert.ok(near.distanceKm>0 && near.distanceKm<far.distanceKm);
  assert.ok(near.points>far.points);
  assert.ok(near.nearest[0]>=10 && near.nearest[0]<=20);
});
test('holes and date-line polygons are interpreted as areas rather than bounding boxes', () => {
  assert.ok(engine.distanceToCountries([35,15],['HOLE'],world).distanceKm>0);
  assert.equal(engine.distanceToCountries([31,11],['HOLE'],world).distanceKm,0);
  assert.equal(engine.distanceToCountries([179,0],['DATE'],world).distanceKm,0);
  assert.equal(engine.distanceToCountries([-179,0],['DATE'],world).distanceKm,0);
  assert.ok(engine.distanceToCountries([0,0],['DATE'],world).distanceKm>10000);
});
test('invalid guesses, missing countries, and missing question data fail fast', () => {
  assert.throws(()=>engine.scoreGuess([NaN,10],animals[0],0,world));
  assert.throws(()=>engine.scoreGuess([0,91],animals[0],0,world));
  assert.throws(()=>engine.distanceToCountries([0,0],['MISSING'],world));
  assert.throws(()=>engine.dailyAnimals(animals.slice(0,4),'2026-10-22'));
  assert.throws(()=>engine.scoreGuess([15,15],animals[0],5,world));
});
test('five weighted perfect answers total 1000 and repeated submission cannot score twice', () => {
  const selected=engine.dailyAnimals(animals,'2026-10-22');
  let state=engine.createGame({day:'2026-10-22',animals:selected});
  for(let index=0;index<5;index++){
    const submitted=engine.submitGuess(state,[15,15],selected[index],world);
    assert.equal(submitted.stage,'reveal');
    assert.equal(submitted.results.length,index+1);
    assert.equal(submitted.results[index].points,[100,100,200,300,300][index]);
    assert.deepEqual(engine.submitGuess(submitted,[80,10],selected[index],world),submitted);
    state=engine.nextQuestion(submitted);
    if(index<4)assert.deepEqual(engine.nextQuestion(state),state);
  }
  assert.equal(state.stage,'complete');
  assert.equal(engine.totalScore(state),1000);
  assert.match(engine.shareText(state,'https://example.test/'),/1,?000/);
  assert.match(engine.shareText(state,'https://example.test/'),/https:\/\/example.test\//);
  assert.match(engine.shareText(state),/Find their native homes/);
});
test('a persisted reveal restores without advancing or awarding duplicate points', () => {
  const selected=engine.dailyAnimals(animals,'2026-10-22');
  const state=engine.submitGuess(engine.createGame({day:'2026-10-22',animals:selected}),[15,15],selected[0],world);
  const restored=engine.validateSavedGame(JSON.parse(JSON.stringify(state)),animals,world);
  assert.deepEqual(restored,state);
  assert.deepEqual(engine.submitGuess(restored,[15,15],selected[0],world),state);
  const corrupt=JSON.parse(JSON.stringify(state)); corrupt.results[0].points=9999;
  assert.equal(engine.validateSavedGame(corrupt,animals,world),null);
  const nonfinite=JSON.parse(JSON.stringify(state)); nonfinite.results[0].distanceKm=NaN;
  assert.equal(engine.validateSavedGame(nonfinite,animals,world),null);
  assert.equal(engine.validateSavedGame({version:2},animals,world),null);
});
