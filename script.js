/*************************************************
 * Signals Planner – local, free version
 * - Shows green (traffic signals) and red (stop signs)
 * - Suggests calmer streets from your personal list
 * - Opens turn-by-turn in your preferred app
 **************************************************/

// ---------- YOUR PERSONAL STREET NOTES ----------
const STREET_NOTES = [
  { name: "E Cottage St",    score: 9, notes: "Mostly signals; good flow" },
  { name: "Batchelder St",   score: 8, notes: "Residential but straightforward" },
  { name: "Harvest St",      score: 7, notes: "Okay during day; a few stops" },
  { name: "Clifton St",      score: 6, notes: "Can feel busy by the rail" },
  { name: "Leyland St",      score: 6, notes: "Parking pockets; be aware" },
  // add more as you learn…
];

// tweak weights if you want them stronger/weaker
const WEIGHTS = {
  preferLights: 1.0,   // reward roads known to have signals
  avoidLefts:   0.5    // slight bump for left-turn minimization
};

// ---------- UI ELEMENTS ----------
const elStart       = document.getElementById('start');
const elDest        = document.getElementById('destination');
const elPrefer      = document.getElementById('preferlights');
const elAvoidLefts  = document.getElementById('avoidlefts');
const elPlan        = document.getElementById('planBtn');
const elOpenNav     = document.getElementById('openNavBtn');
const elOut         = document.getElementById('output');
const elSaveFav     = document.getElementById('saveFavBtn');
const elFavsList    = document.getElementById('favsList');

// ---------- SIMPLE SUGGESTION LOGIC ----------
function rankRoutes(preferLights, avoidLefts) {
  // clone & score
  const routes = STREET_NOTES.map(r => ({ ...r }));
  routes.forEach(r => {
    let s = r.score;

    if (preferLights) {
      // naive boost for streets we marked as “signals/good flow”
      if (r.score >= 8) s += WEIGHTS.preferLights;
    }
    if (avoidLefts) {
      // low boost: you will still visually pick the calmer path on the map
      s += WEIGHTS.avoidLefts * 0.5;
    }
    r._s = s;
  });

  routes.sort((a,b) => b._s - a._s);
  return routes;
}

function renderSuggestion() {
  const prefer = elPrefer.checked;
  const lefts  = elAvoidLefts.checked;
  const ranked = rankRoutes(prefer, lefts);

  const best = ranked[0];
  const alt  = ranked[1];

  elOut.innerHTML = `
    <div><strong>Best pick:</strong> ${best.name} — <span class="badge good">score ${best.score}</span> <em>(${best.notes})</em></div>
    ${alt ? `<div class="mt4"><strong>Backup:</strong> ${alt.name} — <span class="badge warn">score ${alt.score}</span> <em>(${alt.notes})</em></div>` : ""}
    <div style="margin-top:8px;color:#6b7280;font-size:13px">
      Tip: This is a personal filter. Use the map below (green = traffic lights, red = stop signs) to confirm.
    </div>
  `;

  elSaveFav.disabled = false;
}

// ---------- FAVORITES (local only) ----------
const FKEY = 'signalsPlanner:favs';
function loadFavs(){ try { return JSON.parse(localStorage.getItem(FKEY) || "[]"); } catch { return []; } }
function saveFavs(v){ localStorage.setItem(FKEY, JSON.stringify(v)); }
function renderFavs(){
  const favs = loadFavs();
  elFavsList.innerHTML = favs.length
    ? favs.map(f => `<li>${f.start} → ${f.dest} <span class="badge">${f.choice}</span> <small>${new Date(f.t).toLocaleString()}</small></li>`).join("")
    : `<li>No favorites yet.</li>`;
}

// ---------- OPEN TURN-BY-TURN IN YOUR APP ----------
function openExternalNav() {
  const s = elStart.value.trim();
  const d = elDest.value.trim();
  if (!d) { alert('Enter a destination.'); return; }

  // Try Apple Maps on iOS, else Google Maps
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS) {
    const url = `http://maps.apple.com/?daddr=${encodeURIComponent(d)}${s ? `&saddr=${encodeURIComponent(s)}` : ''}&dirflg=d`;
    window.location.href = url;
  } else {
    const url = `https://www.google.com/maps/dir/${s ? encodeURIComponent(s) : ''}/${encodeURIComponent(d)}`;
    window.open(url, '_blank');
  }
}

// ---------- FREE MAP + LIVE SIGNAL/STOP OVERLAY ----------
let _leafletMap = null;
let _signalLayer = null;
let _stopLayer = null;
let _routeLayer = null;

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const blueIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

function ensureMap() {
  if (_leafletMap) return _leafletMap;
  _leafletMap = L.map('map');
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(_leafletMap);
  return _leafletMap;
}
function clearLayers() {
  [_signalLayer,_stopLayer,_routeLayer].forEach(Lyr => {
    if (Lyr && _leafletMap) _leafletMap.removeLayer(Lyr);
  });
  _signalLayer = _stopLayer = _routeLayer = null;
}

async function geocode(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { 'Accept': 'application/json' }});
  const data = await r.json();
  if (!data || !data[0]) return null;
  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    display: data[0].display_name
  };
}

async function fetchSignalsAndStops(bbox) {
  const query = `
    [out:json][timeout:25];
    (
      node["highway"="traffic_signals"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      node["highway"="stop"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
    );
    out body;
  `.trim();

  const r = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: query
  });
  const data = await r.json();
  const signals = [];
  const stops = [];
  if (data.elements) {
    for (const el of data.elements) {
      if (el.type === 'node' && el.tags) {
        if (el.tags.highway === 'traffic_signals') signals.push(el);
        if (el.tags.highway === 'stop') stops.push(el);
      }
    }
  }
  return { signals, stops };
}

async function drawMapForInputs() {
  const s = elStart.value.trim();
  const d = elDest.value.trim();
  if (!s || !d) {
    elOut.innerHTML = `<div class="badge stop">Enter both a Start and Destination.</div>`;
    return;
  }

  const map = ensureMap();
  clearLayers();

  // Geocode both
  const [gs, gd] = await Promise.all([geocode(s), geocode(d)]);
  if (!gs || !gd) {
    elOut.innerHTML = `<div class="badge stop">Could not find one of those locations. Try adding city/state.</div>`;
    return;
  }

  // Fit map and draw context line
  const bounds = L.latLngBounds([gs.lat, gs.lon], [gd.lat, gd.lon]).pad(0.25);
  map.fitBounds(bounds);

  _routeLayer = L.layerGroup().addTo(map);
  L.marker([gs.lat, gs.lon], { icon: blueIcon }).addTo(_routeLayer).bindPopup('Start');
  L.marker([gd.lat, gd.lon], { icon: blueIcon }).addTo(_routeLayer).bindPopup('Destination');
  L.polyline([[gs.lat, gs.lon],[gd.lat, gd.lon]], { weight: 3, opacity: 0.6 }).addTo(_routeLayer);

  // Overpass bbox from current map bounds
  const b = map.getBounds();
  const bbox = { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };

  // Fetch overlays
  const { signals, stops } = await fetchSignalsAndStops(bbox);

  _signalLayer = L.layerGroup().addTo(map);
  _stopLayer   = L.layerGroup().addTo(map);

  signals.forEach(n => L.marker([n.lat, n.lon], { icon: greenIcon }).addTo(_signalLayer).bindPopup('Traffic signal'));
  stops.forEach(n => L.marker([n.lat, n.lon], { icon: redIcon }).addTo(_stopLayer).bindPopup('Stop sign'));
}

// ---------- WIRE UP ----------
elPlan.addEventListener('click', () => {
  renderSuggestion();
  // delay a tick so UI feels snappy
  setTimeout(drawMapForInputs, 120);
});

elOpenNav.addEventListener('click', openExternalNav);

elSaveFav.addEventListener('click', () => {
  const s = elStart.value.trim(), d = elDest.value.trim();
  if (!s || !d) return;
  const ranked = rankRoutes(elPrefer.checked, elAvoidLefts.checked);
  const best = ranked[0];
  const favs = loadFavs();
  favs.unshift({ start:s, dest:d, choice:best.name, t:Date.now() });
  saveFavs(favs.slice(0,20));
  renderFavs();
  elSaveFav.disabled = true;
});

// initial
renderFavs();
