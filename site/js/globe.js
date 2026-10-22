(function (root) {
  'use strict';
  const EMPTY = () => ({ type: 'FeatureCollection', features: [] });
  const point = (coordinates, kind) => ({ type: 'Feature', properties: { kind }, geometry: { type: 'Point', coordinates } });
  function connection(start, end) {
    const radians = Math.PI / 180;
    const vector = ([lng, lat]) => [Math.cos(lat * radians) * Math.cos(lng * radians), Math.cos(lat * radians) * Math.sin(lng * radians), Math.sin(lat * radians)];
    const a = vector(start), b = vector(end);
    const angle = Math.acos(Math.max(-1, Math.min(1, a.reduce((sum, value, i) => sum + value * b[i], 0))));
    const coordinates = [];
    for (let i = 0; i <= 64; i += 1) {
      const t = i / 64;
      let xyz;
      if (angle < 0.00001 || Math.abs(Math.sin(angle)) < 0.00001) {
        let delta = end[0] - start[0];
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        coordinates.push([start[0] + delta * t, start[1] + (end[1] - start[1]) * t]);
        continue;
      }
      xyz = a.map((v, j) => (v * Math.sin((1 - t) * angle) + b[j] * Math.sin(t * angle)) / Math.sin(angle));
      let lng = Math.atan2(xyz[1], xyz[0]) / radians;
      if (coordinates.length) {
        while (lng - coordinates[coordinates.length - 1][0] > 180) lng -= 360;
        while (lng - coordinates[coordinates.length - 1][0] < -180) lng += 360;
      }
      coordinates.push([lng, Math.atan2(xyz[2], Math.hypot(xyz[0], xyz[1])) / radians]);
    }
    return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } };
  }
  class GeoWildGlobe {
    constructor(container, options = {}) {
      if (!root.maplibregl || !root.WORLD_DATA) throw new Error('Local globe components did not load. Reload the globe.');
      this.options = options;
      this.ready = false;
      this.destroyed = false;
      this.enabled = false;
      this.generation = 0;
      this.state = { draft: null, reveal: null };
      this.map = new root.maplibregl.Map({ container, center: [15, 12], zoom: 0.9, minZoom: 0.2, maxZoom: 7, attributionControl: false, renderWorldCopies: false, doubleClickZoom: false, dragRotate: false, pitchWithRotate: false, style: { version: 8, projection: { type: 'globe' }, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#050a0c' } }] } });
      this.map.addControl(new root.maplibregl.AttributionControl({ compact: false, customAttribution: 'Country boundaries © Natural Earth' }), 'bottom-right');
      const canvas = this.map.getCanvas();
      canvas.setAttribute('aria-label', 'World globe. Pan with arrow keys, then use the Guess at map center button.');
      let pointer = null, draggedUntil = 0;
      canvas.addEventListener('pointerdown', event => { pointer = { x: event.clientX, y: event.clientY }; });
      canvas.addEventListener('pointermove', event => { if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 5) draggedUntil = performance.now() + 350; });
      canvas.addEventListener('pointerup', () => { pointer = null; });
      canvas.addEventListener('pointercancel', () => { pointer = null; draggedUntil = performance.now() + 350; });
      this.map.on('dragstart', () => { draggedUntil = performance.now() + 350; });
      this.map.on('dragend', () => { draggedUntil = performance.now() + 350; });
      this.map.on('click', event => {
        if (!this.ready || !this.enabled || performance.now() < draggedUntil) return;
        this.options.onGuess?.([((event.lngLat.lng + 540) % 360) - 180, event.lngLat.lat]);
      });
      this.map.on('error', event => {
        if (!this.destroyed) this.options.onError?.(new Error(`Globe rendering failed: ${event.error?.message || 'WebGL could not render the map'}`));
      });
      this.map.on('load', () => {
        if (this.destroyed) return;
        this.map.setProjection({ type: 'globe' });
        this.map.addSource('countries', { type: 'geojson', data: root.WORLD_DATA });
        this.map.addSource('selection', { type: 'geojson', data: EMPTY() });
        this.map.addSource('connection', { type: 'geojson', data: EMPTY() });
        this.map.addLayer({ id: 'land', type: 'fill', source: 'countries', paint: { 'fill-color': '#163d3b', 'fill-opacity': 1 } });
        this.map.addLayer({ id: 'native-range', type: 'fill', source: 'countries', filter: ['in', ['get', 'code'], ['literal', []]], paint: { 'fill-color': '#95e7b1', 'fill-opacity': 0.68 } });
        this.map.addLayer({ id: 'borders', type: 'line', source: 'countries', paint: { 'line-color': '#6ca6a0', 'line-width': 0.65, 'line-opacity': 0.85 } });
        this.map.addLayer({ id: 'guess-line', type: 'line', source: 'connection', paint: { 'line-color': '#ee8a7b', 'line-width': 2, 'line-dasharray': [2, 2] } });
        this.map.addLayer({ id: 'pins', type: 'circle', source: 'selection', paint: { 'circle-radius': 7, 'circle-color': ['match', ['get', 'kind'], 'answer', '#b3ffd1', '#68b8ff'], 'circle-stroke-color': '#08191b', 'circle-stroke-width': 2 } });
        this.ready = true;
        this.applyState(this.generation);
        this.options.onReady?.();
      });
      this.resizeObserver = new ResizeObserver(() => { if (!this.destroyed) this.map.resize(); });
      this.resizeObserver.observe(container);
    }
    applyState(generation) {
      if (!this.ready || this.destroyed || generation !== this.generation) return;
      const reveal = this.state.reveal;
      const features = reveal ? [point(reveal.guess, 'guess'), point(reveal.nearest, 'answer')] : this.state.draft ? [point(this.state.draft, 'guess')] : [];
      this.map.getSource('selection').setData({ type: 'FeatureCollection', features });
      this.map.getSource('connection').setData(reveal ? { type: 'FeatureCollection', features: [connection(reveal.guess, reveal.nearest)] } : EMPTY());
      this.map.setFilter('native-range', ['in', ['get', 'code'], ['literal', reveal?.countryCodes || []]]);
      if (reveal) {
        let endLng = reveal.nearest[0];
        while (endLng - reveal.guess[0] > 180) endLng -= 360;
        while (endLng - reveal.guess[0] < -180) endLng += 360;
        const bounds = [[Math.min(reveal.guess[0], endLng), Math.min(reveal.guess[1], reveal.nearest[1])], [Math.max(reveal.guess[0], endLng), Math.max(reveal.guess[1], reveal.nearest[1])]];
        const padding = Math.min(70, this.map.getContainer().clientWidth * 0.15);
        this.map.fitBounds(bounds, { padding, maxZoom: 3, duration: root.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650 });
      }
    }
    reset() {
      this.generation += 1;
      this.state = { draft: null, reveal: null };
      if (!this.destroyed) this.map.jumpTo({ center: [15, 12], zoom: 0.9, bearing: 0, pitch: 0 });
      this.applyState(this.generation);
    }
    setGuessEnabled(enabled) { this.enabled = Boolean(enabled); }
    setDraft(draft) { this.generation += 1; this.state = { draft, reveal: null }; this.applyState(this.generation); }
    reveal(value) { this.generation += 1; this.enabled = false; this.state = { draft: null, reveal: value }; this.applyState(this.generation); }
    zoomBy(delta) { if (!this.destroyed) this.map.zoomTo(this.map.getZoom() + delta, { duration: root.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180 }); }
    getCenter() { const center = this.map.getCenter(); return [((center.lng + 540) % 360) - 180, center.lat]; }
    destroy() { this.destroyed = true; this.enabled = false; this.generation += 1; this.resizeObserver.disconnect(); this.map.remove(); }
  }
  root.GeoWildGlobe = GeoWildGlobe;
}(window));
