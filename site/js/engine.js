(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GeoWildEngine = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const EARTH_RADIUS = 6371.0088;
  const MAX_DISTANCE = Math.PI * EARTH_RADIUS;
  const WEIGHTS = Object.freeze([1, 1, 2, 3, 3]);
  const ROUND_COUNT = 5;
  const RAD = Math.PI / 180;
  const DEG = 180 / Math.PI;

  function coordinate(point) {
    if (!Array.isArray(point) || point.length !== 2 ||
        !point.every(v => typeof v === 'number' && Number.isFinite(v)) ||
        Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) {
      throw new RangeError('Expected a finite [longitude, latitude] on Earth.');
    }
    return point;
  }
  const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const norm = a => Math.hypot(...a);
  const unit = a => { const n = norm(a); return a.map(v => v/n); };
  function vector(point) {
    const lng = point[0]*RAD, lat = point[1]*RAD, cosLat = Math.cos(lat);
    return [cosLat*Math.cos(lng), cosLat*Math.sin(lng), Math.sin(lat)];
  }
  const angle = (a, b) => Math.atan2(norm(cross(a,b)), dot(a,b));
  function pointFromVector(v) {
    return [Math.atan2(v[1],v[0])*DEG, Math.atan2(v[2],Math.hypot(v[0],v[1]))*DEG];
  }
  function closestOnArc(p, aPoint, bPoint) {
    const a = vector(aPoint), b = vector(bPoint), n = cross(a,b);
    let nearest = a, radians = angle(p,a);
    const bAngle = angle(p,b);
    if (bAngle < radians) { nearest = b; radians = bAngle; }
    const nLength = norm(n);
    if (nLength > 1e-12) {
      const normal = n.map(v => v/nLength), projection = p.map((v,i) => v-dot(p,normal)*normal[i]);
      if (norm(projection) > 1e-12) {
        const projected = unit(projection), arcLength = angle(a,b);
        for (const candidate of [projected, projected.map(v => -v)]) {
          if (angle(a,candidate)+angle(candidate,b) <= arcLength+1e-9) {
            const distance = angle(p,candidate);
            if (distance < radians) { nearest = candidate; radians = distance; }
          }
        }
      }
    }
    return {distanceKm:radians*EARTH_RADIUS, nearest:pointFromVector(nearest)};
  }
  function unwrapRing(ring) {
    if (!Array.isArray(ring) || ring.length < 4) throw new TypeError('Invalid country ring.');
    const result = [[ring[0][0],ring[0][1]]];
    for (let i=1;i<ring.length;i++) {
      let longitude=ring[i][0], previous=result[i-1][0];
      longitude += Math.round((previous-longitude)/360)*360;
      result.push([longitude,ring[i][1]]);
    }
    return result;
  }
  // Ray casting uses continuous longitudes, including rings crossing the date line.
  function inRing(point, ring) {
    const continuous = unwrapRing(ring);
    const xs = continuous.map(p => p[0]);
    const center = (Math.min(...xs)+Math.max(...xs))/2;
    const x = point[0]+Math.round((center-point[0])/360)*360, y=point[1];
    let inside=false;
    for(let i=0,j=continuous.length-1;i<continuous.length;j=i++) {
      const [xi,yi]=continuous[i], [xj,yj]=continuous[j];
      const area=(x-xi)*(yj-yi)-(y-yi)*(xj-xi);
      if (Math.abs(area)<1e-9 && x>=Math.min(xi,xj)-1e-9 && x<=Math.max(xi,xj)+1e-9 && y>=Math.min(yi,yj)-1e-9 && y<=Math.max(yi,yj)+1e-9) return 2;
      if ((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
    }
    return inside ? 1 : 0;
  }
  function inPolygon(point, polygon) {
    const exterior = inRing(point,polygon[0]);
    if (!exterior) return false;
    if (exterior === 2) return true;
    for (const hole of polygon.slice(1)) {
      const contains=inRing(point,hole);
      if (contains === 1) return false;
      if (contains === 2) return true;
    }
    return true;
  }
  function polygonsFor(feature) {
    if (feature.geometry?.type === 'Polygon') return [feature.geometry.coordinates];
    if (feature.geometry?.type === 'MultiPolygon') return feature.geometry.coordinates;
    throw new TypeError('Country data must contain Polygon or MultiPolygon geometry.');
  }
  function distanceToCountries(point, countryCodes, world) {
    coordinate(point);
    if (!countryCodes?.length || !world?.features?.length) throw new TypeError('Native-country geometry is required.');
    const countries=countryCodes.map(code => {
      const feature=world.features.find(item => item.properties.code===code);
      if (!feature) throw new RangeError(`Missing native-country geometry: ${code}`);
      return feature;
    });
    const polygons=countries.flatMap(polygonsFor);
    if (polygons.some(polygon => inPolygon(point,polygon))) return {distanceKm:0,nearest:point.slice()};
    const p=vector(point);
    let best={distanceKm:Infinity,nearest:null};
    for(const polygon of polygons) for(const ring of polygon) {
      for(let i=0;i<ring.length-1;i++) {
        const candidate=closestOnArc(p,ring[i],ring[i+1]);
        if(candidate.distanceKm<best.distanceKm) best=candidate;
      }
    }
    if(!Number.isFinite(best.distanceKm)) throw new RangeError('Native-country geometry has no usable boundaries.');
    if(best.distanceKm<1e-7) return {distanceKm:0,nearest:point.slice()};
    return best;
  }
  function scoreGuess(guess, animal, questionIndex, world) {
    if(!Number.isInteger(questionIndex) || questionIndex<0 || questionIndex>=ROUND_COUNT) throw new RangeError('Invalid question index.');
    const {distanceKm,nearest}=distanceToCountries(guess,animal.nativeCountries,world);
    const baseScore=Math.round(100*Math.max(0,1-Math.sqrt(Math.min(distanceKm,MAX_DISTANCE)/MAX_DISTANCE)));
    const multiplier=WEIGHTS[questionIndex];
    return {distanceKm,nearest,baseScore,multiplier,points:baseScore*multiplier,maxPoints:100*multiplier};
  }
  function dayKey(date=new Date()) {
    if(!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new TypeError('Invalid date.');
    return date.toISOString().slice(0,10);
  }
  function random(seed) {
    let value=2166136261;
    for(const character of String(seed)) { value ^= character.charCodeAt(0); value=Math.imul(value,16777619); }
    return function () {
      value += 0x6D2B79F5;
      let next=value; next=Math.imul(next^(next>>>15),next|1); next^=next+Math.imul(next^(next>>>7),next|61);
      return ((next^(next>>>14))>>>0)/4294967296;
    };
  }
  function selectAnimals(animals, seed) {
    if(!Array.isArray(animals) || animals.length<ROUND_COUNT || new Set(animals.map(a=>a.id)).size!==animals.length) throw new RangeError('At least five distinct animal records are required.');
    const pool=animals.slice().sort((a,b)=>a.id.localeCompare(b.id)), next=random(seed);
    const selected=[];
    for(let index=0;index<ROUND_COUNT;index++) {
      const remaining=pool.filter(animal=>!selected.includes(animal));
      const discovery=index>=2 && next()<0.15;
      const preferred=remaining.filter(animal=>discovery ? animal.tier==='discovery' : animal.tier!=='discovery');
      const available=preferred.length ? preferred : remaining;
      selected.push(available[Math.floor(next()*available.length)]);
    }
    return selected;
  }
  const dailyAnimals=(animals,day)=>selectAnimals(animals,`geowild-v1:${day}`);
  const practiceAnimals=(animals,seed)=>selectAnimals(animals,`geowild-practice:${seed}`);
  function createGame({day,animals,mode='daily'}) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day) || !['daily','practice'].includes(mode) || animals?.length!==ROUND_COUNT || new Set(animals.map(a=>a.id)).size!==ROUND_COUNT) throw new TypeError('Invalid new game configuration.');
    return {version:1,day,mode,animalIds:animals.map(a=>a.id),index:0,results:[],stage:'guess',guess:null};
  }
  function submitGuess(game, guess, animal, world) {
    if(game.stage!=='guess') return game;
    if(game.animalIds[game.index]!==animal.id || game.results.length!==game.index) throw new RangeError('Question does not match the active game.');
    const result={animalId:animal.id,guess:coordinate(guess).slice(),...scoreGuess(guess,animal,game.index,world)};
    return {...game,guess:guess.slice(),results:[...game.results,result],stage:'reveal'};
  }
  function nextQuestion(game) {
    if(game.stage!=='reveal') return game;
    if(game.index===ROUND_COUNT-1) return {...game,stage:'complete'};
    return {...game,index:game.index+1,guess:null,stage:'guess'};
  }
  const totalScore=game=>game.results.reduce((sum,result)=>sum+result.points,0);
  function shareText(game, origin) {
    const grid=game.results.map(r=>r.baseScore===100?'🟩':r.baseScore>=70?'🟨':r.baseScore>=40?'🟧':'🟥').join('');
    const lines=[`GeoWild · ${game.day}${game.mode==='practice'?' · Practice':''}`,`${totalScore(game).toLocaleString('en-US')} / 1,000`,grid,'Find their native homes.'];
    if(typeof origin==='string' && /^https?:\/\//.test(origin)) lines.push(origin);
    return lines.join('\n');
  }
  function validateSavedGame(value, animals, world) {
    if(!value || value.version!==1 || !/^\d{4}-\d{2}-\d{2}$/.test(value.day) || !['daily','practice'].includes(value.mode) || !['guess','reveal','complete'].includes(value.stage) || !Number.isInteger(value.index) || value.index<0 || value.index>=ROUND_COUNT) return null;
    if(!Array.isArray(value.animalIds) || value.animalIds.length!==ROUND_COUNT || new Set(value.animalIds).size!==ROUND_COUNT || !Array.isArray(value.results)) return null;
    const selected=value.animalIds.map(id=>animals.find(animal=>animal.id===id));
    if(selected.some(animal=>!animal)) return null;
    const expectedLength=value.stage==='guess'?value.index:value.stage==='reveal'?value.index+1:ROUND_COUNT;
    if(value.results.length!==expectedLength || (value.stage==='complete' && value.index!==ROUND_COUNT-1)) return null;
    const results=[];
    for(let index=0;index<value.results.length;index++) {
      const result=value.results[index];
      if(!result || result.animalId!==selected[index].id) return null;
      let computed;
      try { computed=scoreGuess(result.guess,selected[index],index,world); }
      catch(error) { if(error instanceof RangeError || error instanceof TypeError) return null; throw error; }
      for(const key of ['baseScore','multiplier','points','maxPoints']) if(result[key]!==computed[key]) return null;
      if(!Number.isFinite(result.distanceKm) || Math.abs(result.distanceKm-computed.distanceKm)>1e-7) return null;
      if(!Array.isArray(result.nearest) || result.nearest.length!==2 || result.nearest.some((n,i)=>typeof n!=='number' || !Number.isFinite(n) || Math.abs(n-computed.nearest[i])>1e-7)) return null;
      results.push({animalId:selected[index].id,guess:result.guess.slice(),...computed});
    }
    let guess=value.guess;
    if(guess!==null) {
      try { coordinate(guess); } catch(error) { if(error instanceof RangeError) return null; throw error; }
      if(value.stage!=='guess' && (!results.length || guess.some((v,i)=>v!==results.at(-1).guess[i]))) return null;
      guess=guess.slice();
    } else if(value.stage!=='guess') return null;
    return {version:1,day:value.day,mode:value.mode,animalIds:value.animalIds.slice(),index:value.index,results,stage:value.stage,guess};
  }
  return Object.freeze({WEIGHTS,ROUND_COUNT,dayKey,dailyAnimals,practiceAnimals,distanceToCountries,scoreGuess,createGame,submitGuess,nextQuestion,totalScore,shareText,validateSavedGame});
});
