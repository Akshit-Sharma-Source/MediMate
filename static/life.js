// MediMate front end. No libraries needed.
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

let meds = [], taken = [], content = { tips: [], exercises: [] };
let alerted = new Set(), snoozed = {}, alertsOn = false, tipIndex = 0;

// ---------- Text size ----------
let size = parseInt(localStorage.getItem("mm_size") || "18", 10);
function applySize() { document.documentElement.style.setProperty("--base", size + "px"); localStorage.setItem("mm_size", size); }
$("bigger").onclick = () => { size = Math.min(28, size + 2); applySize(); };
$("smaller").onclick = () => { size = Math.max(14, size - 2); applySize(); };
applySize();

// ---------- Navigation ----------
function show() {
  const id = (location.hash || "#home").slice(1);
  document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== id));
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", show);

// ---------- Speech ----------
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

// ---------- Beep (Web Audio) ----------
function beep(times = 3) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.4; g.gain.setValueAtTime(0.3, t);
      o.start(t); o.stop(t + 0.25);
    }
  } catch (e) { /* sound not available */ }
}

// ---------- API ----------
async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
const post = (path, body) => api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function loadMeds() {
  const d = await api("/api/medicines?date=" + todayStr());
  meds = d.medicines; taken = d.taken;
  renderMeds(); renderNext();
}

// ---------- Medicines ----------
function fmt12(hm) { const [h, m] = hm.split(":").map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? "AM" : "PM"}`; }

function renderMeds() {
  const ul = $("medList"); ul.innerHTML = "";
  if (!meds.length) { ul.innerHTML = '<li class="card"><span class="meta">No medicines added yet. Add one below.</span></li>'; return; }
  meds.forEach((m) => {
    const done = taken.includes(m.id);
    const li = document.createElement("li"); li.className = "card" + (done ? " done" : "");
    li.innerHTML = `<div class="name"></div><div class="meta"></div><div class="actions"></div>`;
    li.querySelector(".name").textContent = m.name;
    li.querySelector(".meta").textContent = `${fmt12(m.time)}${m.dose ? " | " + m.dose : ""} | ${done ? "Taken today" : "Not taken yet"}`;
    const a = li.querySelector(".actions");
    
    const b1 = document.createElement("button"); 
    b1.textContent = done ? "Undo" : "Taken";
    b1.style.background = done ? "#ffffff" : "var(--cyan)";
    b1.style.color = "var(--ink)";
    b1.onclick = async () => { await post("/api/taken", { id: m.id, date: todayStr(), taken: !done }); loadMeds(); };
    
    const b2 = document.createElement("button"); 
    b2.textContent = "Delete"; 
    b2.style.background = "var(--pink)"; 
    b2.style.color = "#ffffff";
    b2.onclick = async () => { if (confirm(`Delete ${m.name}?`)) { await api("/api/medicines/" + m.id, { method: "DELETE" }); loadMeds(); } };
    
    a.append(b1, b2); ul.appendChild(li);
  });
}

function renderNext() {
  const el = $("nextDose"); const now = new Date();
  const mins = (hm) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
  const cur = now.getHours() * 60 + now.getMinutes();
  const pending = meds.filter((m) => !taken.includes(m.id));
  if (!meds.length) { el.textContent = "Add your first medicine to get reminders."; return; }
  if (!pending.length) { el.textContent = "✨ All of today's medicines are done. Great job!"; return; }
  const upcoming = pending.filter((m) => mins(m.time) >= cur);
  if (!upcoming.length) { const m = pending[0]; el.textContent = `⚠️ Missed: ${m.name} at ${fmt12(m.time)}. Tap Medicines to confirm.`; return; }
  const m = upcoming[0]; const diff = mins(m.time) - cur; const h = Math.floor(diff / 60), mm = diff % 60;
  el.textContent = `⏰ Next: ${m.name} at ${fmt12(m.time)} (in ${h ? h + " h " : ""}${mm} min)`;
}

$("medForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await post("/api/medicines", { name: $("medName").value, dose: $("medDose").value, time: $("medTime").value });
    $("medForm").reset(); $("medMsg").textContent = "✓ Medicine saved successfully!"; loadMeds();
    setTimeout(() => { $("medMsg").textContent = ""; }, 3000);
  } catch (err) { $("medMsg").textContent = err.message; }
});

// ---------- Alerts ----------
$("enableAlerts").onclick = async () => {
  alertsOn = true; beep(1);
  if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission();
  $("enableAlerts").textContent = "✓ Alerts and sound are active";
};

function ring(m) {
  $("alarmText").textContent = `Time to take ${m.name}${m.dose ? " (" + m.dose + ")" : ""}`;
  $("alarm").hidden = false; beep(3); speak($("alarmText").textContent);
  if ("Notification" in window && Notification.permission === "granted") new Notification("MediMate", { body: $("alarmText").textContent });
  $("alarmTaken").onclick = async () => { $("alarm").hidden = true; await post("/api/taken", { id: m.id, date: todayStr(), taken: true }); loadMeds(); };
  $("alarmSnooze").onclick = () => { $("alarm").hidden = true; snoozed[m.id] = Date.now() + 10 * 60000; alerted.delete(m.id + todayStr()); };
}

setInterval(() => {
  renderNext();
  if (!alertsOn) return;
  const hm = nowHM();
  meds.forEach((m) => {
    if (taken.includes(m.id)) return;
    const key = m.id + todayStr();
    const snoozeDue = snoozed[m.id] && Date.now() >= snoozed[m.id];
    if ((m.time === hm && !alerted.has(key)) || snoozeDue) { alerted.add(key); delete snoozed[m.id]; ring(m); }
  });
}, 10000);

// ---------- Exercise and yoga ----------
let tInt = null, tLeft = 0, current = null;
function showTime() { $("timerDisplay").textContent = `${pad(Math.floor(tLeft / 60))}:${pad(tLeft % 60)}`; }

function renderMoves() {
  const ul = $("moveList"); ul.innerHTML = "";
  if (!content.exercises || !content.exercises.length) {
    ul.innerHTML = '<li class="card"><span class="meta">No exercises available right now.</span></li>';
    return;
  }
  content.exercises.forEach((ex) => {
    const li = document.createElement("li"); li.className = "card";
    li.innerHTML = `<div class="name"></div><div class="meta"></div><div class="actions"><button class="cyan" style="background:var(--cyan); color:var(--ink)">Start Session</button></div>`;
    li.querySelector(".name").textContent = ex.title;
    li.querySelector(".meta").textContent = `${ex.type} • ${ex.level} • ${ex.minutes} minutes`;
    li.querySelector("button").onclick = () => openSession(ex);
    ul.appendChild(li);
  });
}

function openSession(ex) {
  current = ex; clearInterval(tInt); tLeft = ex.minutes * 60; showTime();
  $("sessionTitle").textContent = ex.title;
  $("sessionSteps").innerHTML = ""; 
  ex.steps.forEach((s) => { const li = document.createElement("li"); li.textContent = s; $("sessionSteps").appendChild(li); });
  $("session").hidden = false; 
  $("session").scrollIntoView({ behavior: "smooth" });
}

$("timerStart").onclick = () => {
  if (!current) return; 
  clearInterval(tInt);
  tInt = setInterval(() => { 
    if (tLeft > 0) {
      tLeft--; 
      showTime(); 
    }
    if (tLeft <= 0) { 
      clearInterval(tInt); 
      tLeft = 0;
      showTime();
      beep(3); 
      speak("Well done! Your session is finished."); 
    } 
  }, 1000);
};

$("timerStop").onclick = () => { 
  clearInterval(tInt); 
  if (current) { 
    tLeft = current.minutes * 60; 
    showTime(); 
  } 
};

// ---------- Tips ----------
function showTip() { 
  if (content.tips && content.tips.length) {
    $("tipText").textContent = content.tips[tipIndex % content.tips.length]; 
  }
}
$("tipNext").onclick = () => { tipIndex++; showTip(); };
$("tipSpeak").onclick = () => speak($("tipText").textContent);

// ---------- Scanner ----------
let photoData = null;
$("photo").onchange = (e) => {
  const file = e.target.files[0]; if (!file) return;
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    const max = 1024, scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = img.width * scale; c.height = img.height * scale;
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    photoData = c.toDataURL("image/jpeg", 0.8); URL.revokeObjectURL(url);
    $("preview").src = photoData; $("preview").hidden = false; $("scanBtn").hidden = false; $("scanOut").textContent = ""; $("speakBtn").hidden = true;
  };
  img.src = url;
};

$("scanBtn").onclick = async () => {
  $("scanOut").className = "result"; $("scanOut").textContent = "Reading the label with AI... please wait."; $("scanBtn").disabled = true;
  try { 
    const d = await post("/api/scan", { image: photoData }); 
    $("scanOut").textContent = d.result; 
    $("speakBtn").hidden = false; 
  } catch (err) { 
    $("scanOut").className = "result error"; 
    $("scanOut").textContent = err.message; 
  }
  $("scanBtn").disabled = false;
};
$("speakBtn").onclick = () => speak($("scanOut").textContent);

// ---------- Start ----------
(async function init() {
  const h = new Date().getHours();
  $("greeting").textContent = h < 12 ? "Good morning 👋" : h < 18 ? "Good afternoon ☀️" : "Good evening 🌙";
  show();
  try { 
    content = await api("/api/content"); 
    if (content.tips && content.tips.length) {
      tipIndex = Math.floor((Date.now() / 86400000)) % content.tips.length; 
    }
    showTip(); 
    renderMoves(); 
  } catch (e) {}
  
  try { 
    await loadMeds(); 
  } catch (e) { 
    $("nextDose").textContent = "Could not load medicines. Is the server running?"; 
  }
})();