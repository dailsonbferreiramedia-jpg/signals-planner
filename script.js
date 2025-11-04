// --- Platform helpers
function getSelectedApp() {
  const el = document.querySelector('input[name="navapp"]:checked');
  return el ? el.value : 'auto';
}
const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isAndroid = /Android/.test(navigator.userAgent);

// --- Build deep-link URLs
function googleUrl(originLatLng, destination) {
  const base = 'https://www.google.com/maps/dir/?api=1';
  const params = new URLSearchParams({
    destination,
    travelmode: 'driving',
    dir_action: 'navigate'
  });
  if (originLatLng) params.set('origin', originLatLng); // lat,lng
  return `${base}&${params.toString()}`;
}
function appleUrl(destination, useCurrent = true) {
  // saddr=Current%20Location lets Apple Maps read device GPS
  const saddr = useCurrent ? 'Current%20Location' : '';
  return `https://maps.apple.com/?saddr=${saddr}&daddr=${encodeURIComponent(destination)}&dirflg=d`;
}
function wazeUrl(destination) {
  // Waze can accept a query and navigate
  return `https://waze.com/ul?q=${encodeURIComponent(destination)}&navigate=yes`;
}

// --- Open the chosen app with best effort
function openNavAppWith(originLatLng, destination) {
  const choice = getSelectedApp();
  if (choice === 'google') {
    window.location.href = googleUrl(originLatLng, destination);
    return;
  }
  if (choice === 'apple') {
    window.location.href = appleUrl(destination, true);
    return;
  }
  if (choice === 'waze') {
    window.location.href = wazeUrl(destination);
    return;
  }
  // Auto: pick the best default for the device
  if (isiOS) {
    window.location.href = appleUrl(destination, true);
  } else {
    window.location.href = googleUrl(originLatLng, destination);
  }
}

// --- Geolocate then open
function goWithMyLocation() {
  const dest = document.getElementById('destination').value.trim();
  if (!dest) {
    alert('Enter a destination first.');
    return;
  }
  if (!('geolocation' in navigator)) {
    // No GPS in browser: let app figure it out
    openNavAppWith(null, dest);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      const ll = `${latitude},${longitude}`;
      openNavAppWith(ll, dest);
    },
    (_err) => {
      // Permission denied or error: still try without origin; apps use device GPS
      openNavAppWith(null, dest);
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
}

// --- Hook up buttons (keep your existing init() if you have one)
function initNavButtons() {
  const go = document.getElementById('goBtn');
  if (go) go.addEventListener('click', goWithMyLocation);
}

// If you already have an init() in this file, just call initNavButtons() inside it.
// If not, uncomment below:
// document.addEventListener('DOMContentLoaded', initNavButtons);
initNavButtons();


