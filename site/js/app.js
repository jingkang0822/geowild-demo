(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const E = window.GeoWildEngine;
  const animals = window.ANIMALS;
  const world = window.WORLD_DATA;
  const STORAGE_KEY = 'geowild-demo:v1';
  const SHARE_ORIGIN = 'https://jingkang0822.github.io/geowild-demo/';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const safeUrl = value => { try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? escape(url.href) : '#'; } catch { return '#'; } };
  const external = (url, label) => `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`;
  const format = value => new Intl.NumberFormat('en-US').format(value);
  const distance = value => value < 1 ? '0 km · Native country found' : `${format(Math.round(value))} km`;
  const dialogs = ['menu', 'rules', 'stats', 'credits'];
  let store = { version: 1, settings: { confirm: false }, daily: {}, practice: null, active: null };
  let storageWritable = true;
  let current = null;
  let globe = null;
  let draft = null;
  let photoIdentity = '';
  let photoReady = false;
  let photoAttempt = 0;
  let renderedRound = '';
  let mapRevealKey = '';
  let baseRoute = 'home';
  let lastFocus = null;
  let route = 'home';

  function globalNotice(message, retry) {
    const node = $('global-notice');
    node.replaceChildren(document.createTextNode(message));
    if (retry) {
      const button = document.createElement('button');
      button.textContent = 'Retry saving';
      button.onclick = () => { storageWritable = true; if (persist()) node.hidden = true; };
      node.append(button);
    }
    node.hidden = false;
  }
  if (!E || !Array.isArray(animals) || animals.length < 5 || !world || !window.GeoWildGlobe) {
    globalNotice('Game data or local components did not load completely. Refresh this page or reopen the game link.');
    const reload = document.createElement('button');
    reload.textContent = 'Reload game';
    reload.onclick = () => location.reload();
    $('global-notice').append(reload);
    $('start-button').disabled = true;
    $('start-button').textContent = 'Game data unavailable';
    $('daily-note').textContent = 'The map, animal photos, and game components must all be available.';
    $('home-link').onclick = () => location.reload();
    for (const id of ['daily-button', 'menu-button', 'home-rules', 'home-credits', 'footer-rules']) $(id).disabled = true;
    return;
  }
  function loadStore() {
    let raw;
    try { raw = localStorage.getItem(STORAGE_KEY); }
    catch { storageWritable = false; globalNotice('Your browser cannot read local storage. You can still play, but refreshing may lose your progress.', true); return; }
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (saved.version !== 1 || !saved.daily || typeof saved.daily !== 'object' || Array.isArray(saved.daily)) throw new Error('Unsupported save');
      const daily = {};
      for (const [day, value] of Object.entries(saved.daily)) {
        const game = E.validateSavedGame(value, animals, world);
        if (!game || game.mode !== 'daily' || game.day !== day) throw new Error('Invalid daily game');
        daily[day] = game;
      }
      const practice = saved.practice ? E.validateSavedGame(saved.practice, animals, world) : null;
      if (saved.practice && (!practice || practice.mode !== 'practice')) throw new Error('Invalid practice game');
      const active = saved.active?.mode === 'practice' && practice ? { mode: 'practice', day: practice.day } : saved.active?.mode === 'daily' && daily[saved.active.day] ? { mode: 'daily', day: saved.active.day } : null;
      store = { version: 1, settings: { confirm: saved.settings?.confirm === true }, daily, practice, active };
    } catch {
      storageWritable = false;
      globalNotice('The saved game is damaged or incompatible. The original data is preserved. You can play this session, but it will not overwrite that save.');
    }
  }
  function persist() {
    if (!storageWritable) return false;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); return true; }
    catch { storageWritable = false; globalNotice('Your progress is still on this page, but the browser could not save it. Try saving again before closing this page.', true); return false; }
  }
  function saveCurrent() {
    if (current.mode === 'daily') store.daily[current.day] = current;
    else store.practice = current;
    store.active = { mode: current.mode, day: current.day };
    persist();
  }
  function animalAt(index = current.index) { return animals.find(animal => animal.id === current.animalIds[index]); }
  function roundKey() { return `${current.mode}/${current.day}/${current.animalIds.join(',')}/${current.index}`; }
  function today() {
    const day = E.dayKey();
    if (!store.daily[day]) {
      store.daily[day] = E.createGame({ day, animals: E.dailyAnimals(animals, day) });
      persist();
    }
    current = store.daily[day];
    saveCurrent();
    navigate(current.stage === 'complete' ? 'results' : 'play');
  }
  function practice() {
    if (store.practice && store.practice.stage !== 'complete') current = store.practice;
    else {
      const seed = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      current = E.createGame({ day: E.dayKey(), animals: E.practiceAnimals(animals, seed), mode: 'practice' });
    }
    saveCurrent();
    navigate('play');
  }
  function navigate(next) {
    if (next === route && !dialogs.includes(next)) { render(); return; }
    const base = dialogs.includes(next) ? (dialogs.includes(route) ? baseRoute : route) : next;
    history.pushState({ geowild: true, modal: dialogs.includes(next), base }, '', `#${next}`);
    render();
    if (!dialogs.includes(next)) { $('main').focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
  }
  function closeDialog() {
    if (history.state?.geowild && history.state?.modal) history.back();
    else {
      history.replaceState({ geowild: true, base: baseRoute }, '', `#${baseRoute}`);
      render();
    }
  }
  function makeGlobe() {
    if (globe) return;
    $('map-status').hidden = true;
    $('retry-map').hidden = true;
    try {
      globe = new window.GeoWildGlobe($('globe'), {
        onGuess: selectGuess,
        onReady: () => updateGuessControls(),
        onError: error => {
          $('map-status').textContent = `${error.message} Your progress is retained. You can reload the globe.`;
          $('map-status').hidden = false;
          $('retry-map').hidden = false;
        }
      });
    } catch (error) {
      $('map-status').textContent = `Could not start the globe: ${error.message} Check that your browser supports WebGL, then reload the globe.`;
      $('map-status').hidden = false;
      $('retry-map').hidden = false;
    }
  }
  function loadPhoto(animal, identity) {
    const attempt = ++photoAttempt;
    photoIdentity = identity;
    photoReady = false;
    $('animal-photo').hidden = true;
    $('animal-photo').alt = current.stage === 'guess' ? 'Wild animal to identify' : `${animal.name} photo`;
    $('photo-state').hidden = false;
    $('photo-state').textContent = 'Loading animal photo…';
    $('retry-photo').hidden = true;
    const probe = new Image();
    const stillCurrent = () => photoIdentity === identity && photoAttempt === attempt;
    probe.onload = () => {
      if (!stillCurrent()) return;
      $('animal-photo').src = animal.image;
      $('animal-photo').hidden = false;
      $('photo-state').hidden = true;
      $('retry-photo').hidden = true;
      photoReady = true;
      updateGuessControls();
    };
    probe.onerror = () => {
      if (!stillCurrent()) return;
      $('photo-state').textContent = 'This photo could not load. Your progress is retained.';
      $('retry-photo').hidden = false;
      photoReady = false;
      updateGuessControls();
    };
    probe.src = animal.image;
    updateGuessControls();
  }
  function updateGuessControls() {
    const guessing = current?.stage === 'guess';
    const active = guessing && photoReady && Boolean(globe?.ready) && route === 'play';
    globe?.setGuessEnabled(active);
    $('center-guess').disabled = !active;
    $('lock-guess').hidden = !store.settings.confirm;
    $('lock-guess').disabled = !active || !draft;
    $('confirm-setting').checked = store.settings.confirm;
    $('guess-status').textContent = !photoReady ? 'Load the photo before making your guess.' : !globe ? 'The globe is unavailable. Use the retry button above.' : !globe.ready ? 'The globe is loading. You can guess when it is ready.' : store.settings.confirm ? (draft ? 'Pin placed. Move it if needed, then lock it in.' : 'Tap the globe or use the map center to place a pin, then lock it in.') : 'A tap submits immediately. Dragging only spins the globe.';
    $('center-guess').textContent = store.settings.confirm ? 'Place pin at map center' : 'Guess at map center';
  }
  function selectGuess(guess) {
    if (!current || current.stage !== 'guess' || !photoReady || route !== 'play' || !globe?.ready) return;
    if (store.settings.confirm) {
      draft = guess;
      globe.setDraft(draft);
      updateGuessControls();
    } else submit(guess);
  }
  function submit(guess) {
    if (!current || current.stage !== 'guess' || !photoReady || !guess) return;
    try {
      current = E.submitGuess(current, guess, animalAt(), world);
      draft = null;
      saveCurrent();
      renderGame();
    } catch (error) {
      $('map-status').textContent = `Could not score this guess: ${error.message}. Your location is retained. Please try again.`;
      $('map-status').hidden = false;
    }
  }
  function renderGame() {
    if (!current) current = store.daily[E.dayKey()] || null;
    if (!current) { today(); return; }
    if (current.stage === 'complete') { navigate('results'); return; }
    const animal = animalAt();
    const key = roundKey();
    $('score-value').textContent = format(E.totalScore(current));
    $('game-date').textContent = `${current.day} · UTC`;
    $('mode-label').textContent = current.mode === 'practice' ? 'PRACTICE' : 'DAILY CHALLENGE';
    $('question-title').textContent = `Question ${current.index + 1} of ${E.ROUND_COUNT}`;
    const weight = E.WEIGHTS[current.index];
    $('weight-label').textContent = `×${weight} · ${100 * weight} points`;
    // Before reveal, photo attribution deliberately omits species-bearing URLs and titles.
    $('photo-credit').textContent = `Photo: ${animal.photo.author} · ${animal.photo.license} · Full credits in menu`;
    makeGlobe();
    if (renderedRound !== key) {
      renderedRound = key;
      draft = null;
      mapRevealKey = '';
      globe?.reset();
      loadPhoto(animal, key);
    }
    const revealing = current.stage === 'reveal';
    $('question-copy').hidden = revealing;
    $('answer-panel').hidden = !revealing;
    $('guess-controls').hidden = revealing;
    $('next-button').hidden = !revealing;
    $('map-instruction').hidden = revealing;
    $('map-legend').hidden = !revealing;
    $('map-crosshair').hidden = revealing;
    $('animal-photo').alt = revealing ? `${animal.name} photo` : 'Wild animal to identify';
    if (revealing) {
      const result = current.results[current.index];
      $('answer-panel').innerHTML = `<h2>${escape(animal.name)}</h2><p class="scientific">${escape(animal.scientificName)}</p><p class="native-label">Native countries: ${escape(animal.nativeLabel)}</p><p class="distance-label">Distance: ${distance(result.distanceKm)}</p><div class="round-score"><span><small>${result.baseScore} points × ${result.multiplier}</small></span><span><strong>${result.points}</strong><small> / ${result.maxPoints}</small></span></div><p class="animal-fact">${escape(animal.fact)}</p><div class="source-links">${animal.sources.map(source => external(source.url, source.label)).join('')}${external(animal.photo.sourceUrl || animal.photo.url, 'Photo source')}</div>`;
      $('next-button').textContent = current.index === E.ROUND_COUNT - 1 ? 'See your results →' : 'Next question →';
      if (mapRevealKey !== key && globe) {
        mapRevealKey = key;
        globe.reveal({ guess: result.guess, nearest: result.nearest, countryCodes: animal.nativeCountries });
      }
    }
    updateGuessControls();
  }
  function renderResults() {
    if (!current || current.stage !== 'complete') current = store.daily[E.dayKey()]?.stage === 'complete' ? store.daily[E.dayKey()] : null;
    if (!current) {
      $('results-mode').textContent = 'YOUR EXPEDITION';
      $('results-title').textContent = 'Your results appear after five questions';
      $('results-date').textContent = 'Daily challenges and practice rounds are saved separately.';
      $('final-score').parentElement.hidden = true;
      $('result-message').textContent = 'Continue today’s challenge from the menu.';
      $('result-rows').replaceChildren();
      $('share-button').hidden = true;
      $('practice-button').textContent = 'Play a practice round';
      $('practice-button').onclick = practice;
      $('share-fallback').hidden = true;
      return;
    }
    $('results-mode').textContent = current.mode === 'practice' ? 'PRACTICE COMPLETE' : "TODAY'S EXPEDITION";
    $('results-title').textContent = current.mode === 'practice' ? 'Practice complete' : 'Today’s expedition';
    $('results-date').textContent = `${current.day} · UTC${current.mode === 'practice' ? ' · Excluded from daily stats' : ''}`;
    const total = E.totalScore(current);
    $('final-score').parentElement.hidden = false;
    $('final-score').textContent = format(total);
    $('result-message').textContent = total === 1000 ? 'Five native countries found. You know your wild world.' : total >= 700 ? 'Close to home. Meet five more wild neighbors tomorrow.' : 'It is a big world. Every question is a new place to begin.';
    $('result-rows').innerHTML = current.results.map((result, index) => {
      const animal = animalAt(index);
      return `<div class="result-row"><span>0${index + 1}</span><img src="${escape(animal.image)}" alt="${escape(animal.name)}"><div><h2>${escape(animal.name)}</h2><p>${distance(result.distanceKm)} · ×${result.multiplier}</p></div><strong>${result.points}<small> / ${result.maxPoints}</small></strong></div>`;
    }).join('');
    $('share-button').hidden = false;
    $('practice-button').textContent = store.practice && store.practice.stage !== 'complete' ? 'Resume practice' : 'Play again';
    $('practice-button').onclick = practice;
    $('share-fallback').hidden = true;
  }
  function statsHtml() {
    const completed = Object.values(store.daily).filter(game => game.stage === 'complete');
    const scores = completed.map(E.totalScore);
    const best = scores.length ? Math.max(...scores) : '—';
    const average = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : '—';
    return `<p>Only completed daily challenges on this browser count. Practice is excluded.</p><div class="stats-grid"><div><strong>${completed.length}</strong><span>Days completed</span></div><div><strong>${best}</strong><span>Best / 1000</span></div><div><strong>${average}</strong><span>Average / 1000</span></div></div><p class="muted">${storageWritable ? 'Progress is saved in this browser and does not sync across devices.' : 'Saving is unavailable. This session’s progress may be lost when you close the page.'}</p>`;
  }
  function rulesHtml() {
    return '<h3>See the photo. Find its home.</h3><ol><li>Play unlimited five-photo practice rounds with PLAY. Daily Challenge offers one shared set each UTC day. There is no timer.</li><li>Drag to spin the globe. Scroll or pinch to zoom. A tap submits immediately by default. Turn on “Confirm location before locking in” to move a pin before submitting.</li><li>Use arrow keys to pan the globe, then press “Guess at map center.” The crosshair marks the center.</li><li>After each reveal, press “Next question.” After the fifth question, view your results and copy your score.</li></ol><h3>Native countries, not precise habitats</h3><p>An animal may be native to several countries. A guess anywhere inside any listed native country counts as correct. Country boundaries define the answer regions; they do not mean the animal lives everywhere in that country. Overseas territories follow the map data’s country assignments.</p><h3>Distance and scoring</h3><p>A guess inside a native country is 0 km away and earns 100 base points. Other guesses use the shortest spherical distance to a native country boundary. Closer guesses earn more points.</p><p>Each question awards base points × its multiplier. The five multipliers are 1, 1, 2, 3, and 3, for a maximum total of 1,000.</p><p class="muted">Our distance curve: base points = round(100 × max(0, 1 − √(min(distance in km, 20015.114) ÷ 20015.114))). This is GeoWild’s public formula, not another game’s proprietary scoring formula.</p><h3>Daily progress</h3><p>Each guess is saved immediately in this browser. Leave and return to continue. Practice and daily scores stay separate. A new challenge starts at 00:00 UTC; an ongoing round keeps its original date.</p>';
  }
  function creditsHtml() {
    return `<p>Native ranges follow the sources below. The game uses country boundaries as answer regions. Photos are packaged with the game; their authors and licenses are listed below. Photos were resized and recompressed; no other edits were made.</p><p>Globe: ${external('https://maplibre.org/', 'MapLibre GL JS')} (BSD-3-Clause); boundaries: ${external('https://www.naturalearthdata.com/', 'Natural Earth')} (Public Domain). The map uses local data and does not require external map tiles.</p>${animals.map(animal => `<article class="credit-item"><h3>${escape(animal.name)} <span class="muted">${escape(animal.scientificName)}</span></h3><p>Native countries: ${escape(animal.nativeLabel)}</p><p>Photo: ${escape(animal.photo.author)} · ${external(animal.photo.licenseUrl, animal.photo.license)}</p><div class="credit-links">${external(animal.photo.sourceUrl || animal.photo.url, 'Original photo')}${animal.sources.map(source => external(source.url, source.label)).join('')}</div></article>`).join('')}`;
  }
  function renderDialog(name) {
    const title = { menu: 'Explore GeoWild', rules: 'Rules & scoring', stats: 'Local stats', credits: 'Photo & data credits' };
    $('dialog-title').textContent = title[name];
    if (name === 'menu') {
      $('dialog-content').innerHTML = '<nav class="menu-list" aria-label="Main menu"><button data-route="today">Today’s challenge <span>→</span></button><button data-route="results">View results <span>→</span></button><button data-route="stats">Local stats <span>→</span></button><button data-route="rules">Rules & scoring <span>→</span></button><button data-route="credits">Photo & data credits <span>→</span></button><button data-route="home">Back to home <span>→</span></button></nav>';
      $('dialog-content').querySelectorAll('[data-route]').forEach(button => { button.onclick = () => button.dataset.route === 'today' ? today() : navigate(button.dataset.route); });
    } else $('dialog-content').innerHTML = name === 'stats' ? statsHtml() : name === 'rules' ? rulesHtml() : creditsHtml();
    if (!$('info-dialog').open) {
      lastFocus = document.activeElement;
      $('info-dialog').showModal();
    }
    $('info-dialog').scrollTop = 0;
    $('close-dialog').focus();
  }
  function render() {
    route = location.hash.slice(1) || 'home';
    if (![...dialogs, 'home', 'play', 'results'].includes(route)) route = 'home';
    const modal = dialogs.includes(route);
    if (modal) baseRoute = history.state?.base || baseRoute;
    else baseRoute = route;
    if (!modal && $('info-dialog').open) {
      $('info-dialog').close();
      lastFocus?.focus({ preventScroll: true });
    }
    const visible = modal ? baseRoute : route;
    $('home-view').hidden = visible !== 'home';
    $('game-view').hidden = visible !== 'play';
    $('results-view').hidden = visible !== 'results';
    if (visible === 'home') {
      const game = store.daily[E.dayKey()];
      const unfinishedPractice = store.practice && store.practice.stage !== 'complete';
      $('start-button').textContent = 'PLAY';
      $('play-note').textContent = unfinishedPractice ? `Resume your practice · ${store.practice.results.length} of 5 completed.` : `${animals.length >= 200 ? '200+ animals · ' : ''}Unlimited practice. No daily limit.`;
      $('daily-button').textContent = game?.stage === 'complete' ? 'Daily results →' : game ? 'Continue Daily Challenge →' : 'Daily Challenge →';
      $('daily-note').textContent = `${E.dayKey()} · UTC${game && game.stage !== 'complete' ? ` · ${game.results.length} of 5 completed` : ' · One shared challenge each day'}`;
    }
    if (visible === 'play') renderGame();
    if (visible === 'results') renderResults();
    if (modal) renderDialog(route);
    updateGuessControls();
  }

  loadStore();
  if (store.active) current = store.active.mode === 'practice' ? store.practice : store.daily[store.active.day];
  $('home-link').onclick = () => navigate('home');
  $('menu-button').onclick = () => navigate('menu');
  $('start-button').onclick = practice;
  $('daily-button').onclick = today;
  $('home-rules').onclick = $('footer-rules').onclick = () => navigate('rules');
  $('home-credits').onclick = () => navigate('credits');
  $('results-home').onclick = () => navigate('home');
  $('close-dialog').onclick = closeDialog;
  $('info-dialog').addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  $('info-dialog').addEventListener('click', event => { if (event.target === $('info-dialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(); } });
  $('confirm-setting').onchange = event => {
    store.settings.confirm = event.target.checked;
    persist();
    draft = null;
    globe?.setDraft(null);
    updateGuessControls();
  };
  $('center-guess').onclick = () => { if (globe) selectGuess(globe.getCenter()); };
  $('lock-guess').onclick = () => submit(draft);
  $('zoom-in').onclick = () => globe?.zoomBy(0.6);
  $('zoom-out').onclick = () => globe?.zoomBy(-0.6);
  $('reset-map').onclick = () => {
    if (!globe) return;
    globe.reset();
    if (current?.stage === 'reveal') { mapRevealKey = ''; renderGame(); }
    else { draft = null; updateGuessControls(); }
  };
  $('retry-photo').onclick = () => { if (current) loadPhoto(animalAt(), roundKey()); };
  $('retry-map').onclick = () => {
    globe?.destroy();
    globe = null;
    $('globe').replaceChildren();
    renderedRound = '';
    renderGame();
  };
  $('next-button').onclick = () => {
    if (current?.stage !== 'reveal') return;
    current = E.nextQuestion(current);
    saveCurrent();
    if (current.stage === 'complete') navigate('results');
    else { renderGame(); window.scrollTo({ top: 0, behavior: 'instant' }); }
  };
  $('share-button').onclick = async () => {
    if (!current || current.stage !== 'complete') return;
    const text = E.shareText(current, SHARE_ORIGIN);
    $('share-text').value = text;
    $('share-fallback').hidden = false;
    $('share-status').textContent = 'Copying…';
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      $('share-status').textContent = 'Copied. Paste it wherever you would like to share.';
    } catch {
      $('share-status').textContent = 'Your browser did not allow automatic copying. Select the text below and copy it manually.';
      $('share-text').focus();
      $('share-text').select();
    }
  };
  window.addEventListener('popstate', render);
  window.addEventListener('hashchange', render);
  render();
}());
