// --- tiny offline "street knowledge" you can edit ---
// rating: higher = better for signals / fewer 4-way stops
// turnsPenalty: higher = more awkward turns to avoid
const STREETS = [
  { name: "E Cottage St", rating: 9, turnsPenalty: 2, notes: "Mostly signals; good flow" },
  { name: "Batchelder St", rating: 8, turnsPenalty: 2, notes: "Residential but straightforward" },
  { name: "Robey St", rating: 3, turnsPenalty: 6, notes: "Dead end; avoid for through travel" },
  { name: "Clifton St", rating: 6, turnsPenalty: 3, notes: "OK; some parking lot traffic" },
  // add/edit as you learn more:
  // { name: "YOUR STREET", rating: 7, turnsPenalty: 3, notes: "your notes" },
];

function scoreRoute(preferLights, avoidTurns) {
  // very simple scoring: rank highest-rated streets, subtract turn penalties if asked
  return [...STREETS]
    .map(s => ({
      ...s,
      score: s.rating - (avoidTurns ? s.turnsPenalty : 0)
    }))
    .sort((a, b) => b.score - a.score);
}

// Local favorites
function loadFavs() {
  try { return JSON.parse(localStorage.getItem("signalsFavs") || "[]"); }
  catch { return []; }
}
function saveFavs(list) {
  localStorage.setItem("signalsFavs", JSON.stringify(list));
}
function renderFavs() {
  const ul = document.getElementById("favList");
  ul.innerHTML = "";
  const favs = loadFavs();
  if (favs.length === 0) {
    ul.innerHTML = "<li>No favorites yet.</li>";
    return;
  }
  favs.forEach((f, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `<span><strong>${f.start}</strong> → <strong>${f.dest}</strong> (${f.choice})</span>`;
    const del = document.createElement("button");
    del.textContent = "Remove";
    del.onclick = () => {
      const cur = loadFavs();
      cur.splice(idx, 1);
      saveFavs(cur);
      renderFavs();
    };
    li.appendChild(del);
    ul.appendChild(li);
  });
}

function plan() {
  const start = document.getElementById("start").value.trim();
  const dest = document.getElementById("destination").value.trim();
  const preferLights = document.getElementById("preferLights").checked;
  const avoidTurns = document.getElementById("avoidTurns").checked;

  const out = document.getElementById("output");
  const saveBtn = document.getElementById("saveFavBtn");

  if (!start || !dest) {
    out.textContent = "Please enter Start and Destination.";
    saveBtn.disabled = true;
    return;
  }

  const ranked = scoreRoute(preferLights, avoidTurns);
  const best = ranked[0];
  const alt = ranked[1];

  out.innerHTML = `
    <div><strong>Best pick:</strong> ${best.name} — score ${best.score} (${best.notes})</div>
    ${alt ? `<div><strong>Backup:</strong> ${alt.name} — score ${alt.score} (${alt.notes})</div>` : ""}
    <div style="margin-top:8px;font-size:0.95em;color:#666">
      *This is an offline filter — edit <code>script.js</code> to tune the street list and notes.
    </div>
  `;

  // enable saving
  saveBtn.disabled = false;
  saveBtn.onclick = () => {
    const favs = loadFavs();
    favs.unshift({ start, dest, choice: best.name, ts: Date.now() });
    saveFavs(favs.slice(0, 20)); // keep last 20
    renderFavs();
    saveBtn.disabled = true;
  };
}

function init() {
  document.getElementById("planBtn").addEventListener("click", plan);
  renderFavs();
}

document.addEventListener("DOMContentLoaded", init);
