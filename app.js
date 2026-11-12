"use strict";
/* Mi Coche - mantenimiento del coche, 100% local (localStorage), funciona sin conexión */

const KEY = "micoche.v1";
const TYPES = ["Aceite y filtro", "Neumáticos", "Frenos", "Batería", "Correa de distribución",
  "Filtros (aire/habitáculo)", "Líquido de frenos", "Refrigerante", "ITV", "Revisión general", "Reparación", "Otro"];

let state = load();
let tab = "historial";
let currentVid = state.vehicles[0] ? state.vehicles[0].id : null;

/* ---------- almacenamiento ---------- */
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.vehicles) && Array.isArray(s.records) && Array.isArray(s.reminders)) return s;
  } catch (e) {}
  return { vehicles: [], records: [], reminders: [] };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast("No se pudo guardar: almacenamiento lleno o bloqueado"); }
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => (Number(n) || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const num = n => (Number(n) || 0).toLocaleString("es-ES");
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = d => d ? new Date(d + "T00:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) : "";
function addMonths(iso, m) {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + m);
  return d.toISOString().slice(0, 10);
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2600);
}
const vehicle = () => state.vehicles.find(v => v.id === currentVid);
const vname = v => v.name + (v.plate ? " · " + v.plate : "");

/* ---------- cabecera ---------- */
function renderHeader() {
  const sel = $("#vehicleSelect");
  if (!state.vehicles.length) {
    sel.innerHTML = '<option value="">Sin vehículos</option>';
    return;
  }
  if (!vehicle()) currentVid = state.vehicles[0].id;
  sel.innerHTML = state.vehicles.map(v => `<option value="${v.id}" ${v.id === currentVid ? "selected" : ""}>${esc(vname(v))}</option>`).join("");
}

/* ---------- vistas ---------- */
function render() {
  renderHeader();
  document.querySelectorAll("nav button").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  $("#fab").classList.toggle("hidden", tab === "resumen" || tab === "ajustes");
  const v = $("#view");
  if (!state.vehicles.length && tab !== "ajustes") {
    v.innerHTML = `<div class="empty"><p>Aún no has añadido ningún vehículo.</p>
      <button class="primary" id="firstVehicle" type="button">Añadir mi coche</button></div>`;
    $("#fab").classList.add("hidden");
    $("#firstVehicle").onclick = () => vehicleForm();
    return;
  }
  if (tab === "historial") v.innerHTML = viewHistorial();
  else if (tab === "avisos") v.innerHTML = viewAvisos();
  else if (tab === "resumen") v.innerHTML = viewResumen();
  else v.innerHTML = viewAjustes();
  bindView();
}

function viewHistorial() {
  const car = vehicle();
  const recs = state.records.filter(r => r.vid === car.id)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.km || 0) - (a.km || 0));
  let html = `<div class="card"><div class="title">${esc(vname(car))}</div>
    <div class="muted">${car.year ? esc(car.year) + " · " : ""}${num(car.km)} km actuales</div></div>`;
  if (!recs.length) return html + `<div class="empty">Sin registros todavía.<br>Pulsa + para añadir el primero.</div>`;
  return html + recs.map(r => `<div class="card">
    <div class="row"><div><div class="title">${esc(r.type)}</div>
      <div class="muted">${fmtDate(r.date)}${r.km ? " · " + num(r.km) + " km" : ""}</div></div>
      <div class="cost">${r.cost ? money(r.cost) : ""}</div></div>
    ${r.notes ? `<div class="muted" style="margin-top:6px">${esc(r.notes)}</div>` : ""}
    <div class="actions"><button class="small" data-edit-rec="${r.id}" type="button">Editar</button>
      <button class="small danger" data-del-rec="${r.id}" type="button">Borrar</button></div></div>`).join("");
}

function reminderStatus(rem, car) {
  const last = state.records.filter(r => r.vid === rem.vid && r.type === rem.type)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.km || 0) - (a.km || 0))[0];
  if (!last) return { cls: "none", label: "Sin registros", detail: "Añade un registro de este tipo para empezar a contar." };
  let level = 0, parts = [];
  if (rem.everyKm && last.km) {
    const nextKm = Number(last.km) + Number(rem.everyKm), left = nextKm - Number(car.km || 0);
    parts.push(left >= 0 ? `faltan ${num(left)} km (a los ${num(nextKm)} km)` : `pasado por ${num(-left)} km`);
    level = Math.max(level, left < 0 ? 2 : left <= 1000 ? 1 : 0);
  }
  if (rem.everyMonths) {
    const nextDate = addMonths(last.date, Number(rem.everyMonths));
    const days = Math.round((new Date(nextDate + "T00:00:00") - new Date(today() + "T00:00:00")) / 86400000);
    parts.push(days >= 0 ? `faltan ${days} días (${fmtDate(nextDate)})` : `pasado por ${-days} días (${fmtDate(nextDate)})`);
    level = Math.max(level, days < 0 ? 2 : days <= 30 ? 1 : 0);
  }
  if (!parts.length) return { cls: "none", label: "Sin intervalo", detail: "" };
  const cls = ["ok", "soon", "over"][level];
  return { cls, label: ["Al día", "Próximo", "Vencido"][level], detail: parts.join(" · "), last };
}

function viewAvisos() {
  const car = vehicle();
  const rems = state.reminders.filter(r => r.vid === car.id);
  let html = `<p class="muted">Avisos según el último registro de cada tipo y los kilómetros actuales del vehículo.</p>`;
  if (!rems.length) return html + `<div class="empty">Sin avisos. Pulsa + para crear uno (por ejemplo, aceite cada 15.000 km o 12 meses).</div>`;
  const order = { over: 0, soon: 1, ok: 2, none: 3 };
  const items = rems.map(r => ({ r, s: reminderStatus(r, car) })).sort((a, b) => order[a.s.cls] - order[b.s.cls]);
  return html + items.map(({ r, s }) => `<div class="card">
    <div class="row"><div class="title">${esc(r.type)}</div><span class="badge ${s.cls}">${s.label}</span></div>
    <div class="muted">Cada ${[r.everyKm ? num(r.everyKm) + " km" : "", r.everyMonths ? r.everyMonths + " meses" : ""].filter(Boolean).join(" o ")}</div>
    <div class="muted">${esc(s.detail)}</div>
    <div class="actions"><button class="small" data-edit-rem="${r.id}" type="button">Editar</button>
      <button class="small danger" data-del-rem="${r.id}" type="button">Borrar</button></div></div>`).join("");
}

function viewResumen() {
  const car = vehicle();
  const recs = state.records.filter(r => r.vid === car.id);
  const total = recs.reduce((s, r) => s + (Number(r.cost) || 0), 0);
  const byYear = {}, byType = {};
  recs.forEach(r => {
    const y = r.date.slice(0, 4);
    byYear[y] = (byYear[y] || 0) + (Number(r.cost) || 0);
    byType[r.type] = (byType[r.type] || 0) + (Number(r.cost) || 0);
  });
  const bars = (obj, sortKey) => {
    const e = Object.entries(obj).sort(sortKey ? (a, b) => b[0].localeCompare(a[0]) : (a, b) => b[1] - a[1]);
    const max = Math.max(...e.map(x => x[1]), 1);
    return e.map(([k, v]) => `<div class="card"><div class="row"><span>${esc(k)}</span><b>${money(v)}</b></div>
      <div class="bar" style="width:${Math.max(2, (v / max) * 100)}%"></div></div>`).join("");
  };
  return `<div class="stats">
      <div class="stat"><span class="muted">Gasto total</span><b>${money(total)}</b></div>
      <div class="stat"><span class="muted">Registros</span><b>${recs.length}</b></div>
      <div class="stat"><span class="muted">Kilómetros</span><b>${num(car.km)}</b></div></div>
    ${recs.length ? `<h2>Gasto por año</h2>${bars(byYear, true)}<h2>Gasto por tipo</h2>${bars(byType, false)}` : `<div class="empty">Añade registros para ver el resumen.</div>`}`;
}

function viewAjustes() {
  return `<h2>Copia de seguridad</h2>
    <div class="card"><p class="muted">Tus datos solo están en este dispositivo. Si borras los datos del navegador o desinstalas la app, se pierden. Haz copias de vez en cuando.</p>
      <div class="actions"><button class="primary" id="btnExport" type="button">Exportar copia</button>
        <button id="btnImport" type="button">Importar copia</button>
        <input type="file" id="fileImport" accept="application/json,.json" hidden></div></div>
    <h2>Zona peligrosa</h2>
    <div class="card"><div class="actions"><button class="danger" id="btnWipe" type="button">Borrar todos los datos</button></div></div>
    <p class="muted">Mi Coche · funciona sin conexión · datos guardados en el dispositivo</p>`;
}

function bindView() {
  document.querySelectorAll("[data-edit-rec]").forEach(b => b.onclick = () => recordForm(b.dataset.editRec));
  document.querySelectorAll("[data-del-rec]").forEach(b => b.onclick = () => {
    if (confirm("¿Borrar este registro?")) { state.records = state.records.filter(r => r.id !== b.dataset.delRec); save(); render(); }
  });
  document.querySelectorAll("[data-edit-rem]").forEach(b => b.onclick = () => reminderForm(b.dataset.editRem));
  document.querySelectorAll("[data-del-rem]").forEach(b => b.onclick = () => {
    if (confirm("¿Borrar este aviso?")) { state.reminders = state.reminders.filter(r => r.id !== b.dataset.delRem); save(); render(); }
  });
  const ex = $("#btnExport");
  if (ex) {
    ex.onclick = exportData;
    $("#btnImport").onclick = () => $("#fileImport").click();
    $("#fileImport").onchange = importData;
    $("#btnWipe").onclick = () => {
      if (confirm("Se borrarán TODOS los vehículos, registros y avisos. ¿Seguro?") && confirm("Última confirmación: esto no se puede deshacer.")) {
        state = { vehicles: [], records: [], reminders: [] }; currentVid = null; save(); render(); toast("Datos borrados");
      }
    };
  }
}

/* ---------- diálogos ---------- */
const dlg = $("#dlg");
function openDialog(html) { dlg.innerHTML = html; if (!dlg.open) dlg.showModal(); }
function closeDialog() { if (dlg.open) dlg.close(); }
dlg.addEventListener("click", e => { if (e.target === dlg) closeDialog(); });
const typeOptions = sel => TYPES.map(t => `<option ${t === sel ? "selected" : ""}>${esc(t)}</option>`).join("");

function recordForm(id) {
  const car = vehicle();
  const r = id ? state.records.find(x => x.id === id) : { date: today(), type: TYPES[0], km: car.km || "", cost: "", notes: "" };
  openDialog(`<form method="dialog" id="f"><h3>${id ? "Editar" : "Nuevo"} registro</h3>
    <label>Tipo</label><select name="type">${typeOptions(r.type)}</select>
    <div class="two"><div><label>Fecha</label><input type="date" name="date" value="${esc(r.date)}" required></div>
    <div><label>Kilómetros</label><input type="number" name="km" inputmode="numeric" min="0" value="${esc(r.km)}"></div></div>
    <label>Coste (€)</label><input type="number" name="cost" inputmode="decimal" min="0" step="0.01" value="${esc(r.cost)}">
    <label>Notas</label><textarea name="notes" rows="3">${esc(r.notes)}</textarea>
    <div class="actions"><button class="primary" type="submit">Guardar</button><button type="button" id="cancel">Cancelar</button></div></form>`);
  $("#cancel").onclick = closeDialog;
  $("#f").onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const rec = { id: id || uid(), vid: car.id, type: f.get("type"), date: f.get("date"),
      km: f.get("km") ? Number(f.get("km")) : "", cost: f.get("cost") ? Number(f.get("cost")) : "", notes: f.get("notes").trim() };
    if (id) state.records = state.records.map(x => x.id === id ? rec : x); else state.records.push(rec);
    if (rec.km && rec.km > (Number(car.km) || 0)) car.km = rec.km;
    save(); closeDialog(); render(); toast("Guardado");
  };
}

function reminderForm(id) {
  const car = vehicle();
  const r = id ? state.reminders.find(x => x.id === id) : { type: TYPES[0], everyKm: "", everyMonths: "" };
  openDialog(`<form method="dialog" id="f"><h3>${id ? "Editar" : "Nuevo"} aviso</h3>
    <label>Tipo de mantenimiento</label><select name="type">${typeOptions(r.type)}</select>
    <div class="two"><div><label>Cada (km)</label><input type="number" name="everyKm" inputmode="numeric" min="0" value="${esc(r.everyKm)}" placeholder="15000"></div>
    <div><label>Cada (meses)</label><input type="number" name="everyMonths" inputmode="numeric" min="0" value="${esc(r.everyMonths)}" placeholder="12"></div></div>
    <p class="muted">Rellena uno o los dos. Salta el aviso con el que llegue antes.</p>
    <div class="actions"><button class="primary" type="submit">Guardar</button><button type="button" id="cancel">Cancelar</button></div></form>`);
  $("#cancel").onclick = closeDialog;
  $("#f").onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const km = Number(f.get("everyKm")) || 0, mo = Number(f.get("everyMonths")) || 0;
    if (!km && !mo) { toast("Indica kilómetros o meses"); return; }
    const rem = { id: id || uid(), vid: car.id, type: f.get("type"), everyKm: km || "", everyMonths: mo || "" };
    if (id) state.reminders = state.reminders.map(x => x.id === id ? rem : x); else state.reminders.push(rem);
    save(); closeDialog(); render(); toast("Guardado");
  };
}

function vehicleForm(id) {
  const v = id ? state.vehicles.find(x => x.id === id) : { name: "", plate: "", year: "", km: "" };
  openDialog(`<form method="dialog" id="f"><h3>${id ? "Editar" : "Nuevo"} vehículo</h3>
    <label>Nombre (marca y modelo)</label><input name="name" value="${esc(v.name)}" required placeholder="Seat León">
    <div class="two"><div><label>Matrícula</label><input name="plate" value="${esc(v.plate)}"></div>
    <div><label>Año</label><input type="number" name="year" inputmode="numeric" value="${esc(v.year)}"></div></div>
    <label>Kilómetros actuales</label><input type="number" name="km" inputmode="numeric" min="0" value="${esc(v.km)}">
    <div class="actions"><button class="primary" type="submit">Guardar</button><button type="button" id="cancel">Cancelar</button>
    ${id ? '<button type="button" class="danger" id="del">Borrar vehículo</button>' : ""}</div></form>`);
  $("#cancel").onclick = closeDialog;
  if (id) $("#del").onclick = () => {
    if (confirm("Se borrará el vehículo con todos sus registros y avisos. ¿Seguro?")) {
      state.vehicles = state.vehicles.filter(x => x.id !== id);
      state.records = state.records.filter(x => x.vid !== id);
      state.reminders = state.reminders.filter(x => x.vid !== id);
      currentVid = state.vehicles[0] ? state.vehicles[0].id : null;
      save(); closeDialog(); render();
    }
  };
  $("#f").onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const nv = { id: id || uid(), name: f.get("name").trim(), plate: f.get("plate").trim().toUpperCase(),
      year: f.get("year") ? Number(f.get("year")) : "", km: f.get("km") ? Number(f.get("km")) : 0 };
    if (id) state.vehicles = state.vehicles.map(x => x.id === id ? nv : x); else { state.vehicles.push(nv); currentVid = nv.id; }
    save(); closeDialog(); render(); toast("Guardado");
  };
}

function vehicleManager() {
  openDialog(`<h3>Vehículos</h3>
    ${state.vehicles.map(v => `<div class="card"><div class="row"><div><div class="title">${esc(v.name)}</div>
      <div class="muted">${esc(v.plate)} ${v.year ? "· " + esc(v.year) : ""} · ${num(v.km)} km</div></div>
      <button class="small" data-ev="${v.id}" type="button">Editar</button></div></div>`).join("") || '<p class="muted">Sin vehículos.</p>'}
    <div class="actions"><button class="primary" id="newV" type="button">Añadir vehículo</button><button id="close" type="button">Cerrar</button></div>`);
  $("#close").onclick = closeDialog;
  $("#newV").onclick = () => vehicleForm();
  dlg.querySelectorAll("[data-ev]").forEach(b => b.onclick = () => vehicleForm(b.dataset.ev));
}

/* ---------- copia de seguridad ---------- */
function exportData() {
  const blob = new Blob([JSON.stringify({ app: "micoche", version: 1, exported: new Date().toISOString(), data: state }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `micoche-copia-${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("Copia exportada");
}
function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const j = JSON.parse(rd.result);
      const d = j.data || j;
      if (!Array.isArray(d.vehicles) || !Array.isArray(d.records) || !Array.isArray(d.reminders)) throw new Error("formato");
      if (!confirm("Esto reemplazará los datos actuales por los de la copia. ¿Continuar?")) return;
      state = { vehicles: d.vehicles, records: d.records, reminders: d.reminders };
      currentVid = state.vehicles[0] ? state.vehicles[0].id : null;
      save(); render(); toast("Copia importada");
    } catch (err) { toast("El archivo no es una copia válida"); }
  };
  rd.readAsText(file);
  e.target.value = "";
}

/* ---------- eventos globales ---------- */
document.querySelectorAll("nav button").forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); window.scrollTo(0, 0); });
$("#vehicleSelect").onchange = e => { currentVid = e.target.value; render(); };
$("#btnVehicles").onclick = vehicleManager;
dlg.addEventListener("close", () => render());
$("#fab").onclick = () => {
  if (!vehicle()) return vehicleForm();
  if (tab === "avisos") reminderForm(); else recordForm();
};

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
render();
