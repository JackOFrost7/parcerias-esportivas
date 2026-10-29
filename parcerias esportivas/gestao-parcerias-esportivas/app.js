/* =========================================================
   Gestão de Parcerias Esportivas
   App estático (HTML/CSS/JS puro), dados salvos no localStorage.
   ========================================================= */

const CONFIG = {
  storageKey: "parcerias-esportivas:v1",
  planningLeadDays: 45, // antecedência mínima para planejar uma ativação
};

const TYPE_LABEL = { game: "Jogo", activation: "Ativação", other: "Outro" };
const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/* ---------- Estado ---------- */
let state = loadState();
let viewMonth = startOfMonth(new Date());

function loadState() {
  let saved = null;
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (raw) saved = JSON.parse(raw);
  } catch (_) { /* storage indisponível: usa dados de exemplo */ }
  return normalize(saved || structuredClone(window.SEED));
}

// Garante que todo evento tenha uma fase do quadro (compatível com dados antigos)
function normalize(s) {
  s.events.forEach((e) => {
    if (!STAGES.some((st) => st.id === e.stage)) e.stage = daysUntil(e.date) < 0 ? "done" : "todo";
  });
  return s;
}

function saveState() {
  try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(state)); } catch (_) {}
  render();
}

const uid = (p) => p + Math.random().toString(36).slice(2, 9);

/* ---------- Datas ---------- */
function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function today() { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
function daysUntil(str) { return Math.round((parseDate(str) - today()) / 86400000); }
function fmtDate(str) {
  return parseDate(str).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

/* ---------- Helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const teamById = (id) => state.teams.find((t) => t.id === id);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const initials = (name) => name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2200);
}

function deliverableStatus(d) {
  if (d.done) return { cls: "ok", label: "Concluído" };
  const n = daysUntil(d.due);
  if (n < 0) return { cls: "late", label: `Atrasado ${-n}d` };
  if (n <= 7) return { cls: "warn", label: `Vence em ${n}d` };
  return { cls: "other", label: "Pendente" };
}

/* ---------- Render ---------- */
function render() {
  renderTeamFilters();
  renderBoard();
  renderDashboard();
  renderCalendar();
  renderDeliverables();
  renderTeams();
}

function renderTeamFilters() {
  const opts = `<option value="all">Todos os times</option>` +
    state.teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("");
  for (const id of ["#filter-board-team", "#filter-team", "#filter-deliv-team"]) {
    const sel = $(id);
    const current = sel.value || "all";
    sel.innerHTML = opts;
    sel.value = state.teams.some((t) => t.id === current) ? current : "all";
  }
}

function renderDashboard() {
  const upcoming = state.events
    .filter((e) => daysUntil(e.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const pending = state.deliverables.filter((d) => !d.done);
  const late = pending.filter((d) => daysUntil(d.due) < 0);
  const next30 = upcoming.filter((e) => daysUntil(e.date) <= 30);

  $("#lead-days").textContent = CONFIG.planningLeadDays;
  $("#stats").innerHTML = [
    { v: state.teams.length, l: "Times patrocinados" },
    { v: next30.length, l: "Eventos nos próximos 30 dias" },
    { v: pending.length, l: "Entregáveis pendentes" },
    { v: late.length, l: "Entregáveis atrasados" },
  ].map((s) => `<div class="stat"><div class="value">${s.v}</div><div class="label">${s.l}</div></div>`).join("");

  $("#upcoming").innerHTML = upcoming.slice(0, 6).map(eventListItem).join("") ||
    `<li class="empty">Nenhum evento futuro.</li>`;

  // Alertas: ativações ainda em planejamento dentro da janela mínima + entregáveis atrasados
  const alerts = [];
  state.events
    .filter(needsPlanning)
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((e) => {
      alerts.push({
        html: `<span class="badge warn">Faltam ${daysUntil(e.date)}d</span>
               <div class="info"><div class="title">${esc(e.title)}</div>
               <div class="muted small">Ativação em “${stageLabel(e.stage)}” · ${esc(teamById(e.teamId)?.name || "")}</div></div>`,
        action: `event:${e.id}`,
      });
    });
  late.forEach((d) => {
    alerts.push({
      html: `<span class="badge late">Atrasado</span>
             <div class="info"><div class="title">${esc(d.title)}</div>
             <div class="muted small">Entregável · venceu em ${fmtDate(d.due)}</div></div>`,
      action: `deliverable:${d.id}`,
    });
  });
  $("#alerts").innerHTML = alerts.map((a) => `<li data-open="${a.action}">${a.html}</li>`).join("") ||
    `<li class="empty">Tudo em dia 🎉</li>`;
}

function eventListItem(e) {
  const d = parseDate(e.date);
  const team = teamById(e.teamId);
  return `<li data-open="event:${e.id}">
    <div class="date-box"><span class="d">${d.getDate()}</span><span class="m">${MONTHS_SHORT[d.getMonth()]}</span></div>
    <div class="info">
      <div class="title">${esc(e.title)}</div>
      <div class="muted small">${esc(team?.name || "")} · ${esc(e.time || "")} ${e.location ? "· " + esc(e.location) : ""}</div>
    </div>
    <span class="badge ${e.type}">${TYPE_LABEL[e.type]}</span>
  </li>`;
}

function renderCalendar() {
  const teamFilter = $("#filter-team").value || "all";
  $("#month-label").textContent = viewMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const first = new Date(viewMonth);
  first.setDate(1 - first.getDay()); // começa no domingo
  const todayISO = toISO(today());
  const cells = [];

  for (let i = 0; i < 42; i++) {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    const iso = toISO(d);
    const evs = state.events
      .filter((e) => e.date === iso && (teamFilter === "all" || e.teamId === teamFilter))
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    const outside = d.getMonth() !== viewMonth.getMonth();
    cells.push(`<div class="day${outside ? " outside" : ""}${iso === todayISO ? " today" : ""}" data-date="${iso}">
      <span class="num">${d.getDate()}</span>
      ${evs.map((e) => `<span class="chip ${e.type}" data-open="event:${e.id}" title="${esc(e.title)}">${esc(e.time || "")} ${esc(e.title)}</span>`).join("")}
    </div>`);
  }
  $("#calendar").innerHTML = cells.join("");
}

function renderDeliverables() {
  const team = $("#filter-deliv-team").value || "all";
  const status = $("#filter-deliv-status").value;
  const rows = state.deliverables
    .filter((d) => team === "all" || d.teamId === team)
    .filter((d) => status === "all" || (status === "done" ? d.done : !d.done))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.due.localeCompare(b.due));

  $("#deliverables").innerHTML = rows.map((d) => {
    const s = deliverableStatus(d);
    return `<tr class="${d.done ? "done" : ""}">
      <td><input type="checkbox" data-toggle="${d.id}" ${d.done ? "checked" : ""} aria-label="Marcar como concluído" /></td>
      <td>${esc(d.title)}</td>
      <td>${esc(teamById(d.teamId)?.name || "—")}</td>
      <td>${fmtDate(d.due)}</td>
      <td><span class="badge ${s.cls}">${s.label}</span></td>
      <td><button class="link-btn" data-open="deliverable:${d.id}">Editar</button></td>
    </tr>`;
  }).join("") || `<tr><td colspan="6" class="muted">Nenhum entregável encontrado.</td></tr>`;
}

function renderTeams() {
  $("#teams").innerHTML = state.teams.map((t) => {
    const delivs = state.deliverables.filter((d) => d.teamId === t.id);
    const done = delivs.filter((d) => d.done).length;
    const pct = delivs.length ? Math.round((done / delivs.length) * 100) : 0;
    const nextEvent = state.events
      .filter((e) => e.teamId === t.id && daysUntil(e.date) >= 0)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    const contractDays = t.contractEnd ? daysUntil(t.contractEnd) : null;

    return `<article class="card team-card">
      <div class="team-top">
        <div class="team-avatar" style="background:${esc(t.color)}">${esc(initials(t.name))}</div>
        <div>
          <h2>${esc(t.name)}</h2>
          <div class="team-meta">${esc(t.sport)}${t.contact ? " · " + esc(t.contact) : ""}</div>
        </div>
      </div>
      <div class="small">
        <div>Próximo evento: <strong>${nextEvent ? esc(nextEvent.title) + " (" + fmtDate(nextEvent.date) + ")" : "—"}</strong></div>
        <div>Contrato até: <strong>${t.contractEnd ? fmtDate(t.contractEnd) : "—"}</strong>
          ${contractDays !== null && contractDays <= 90 ? `<span class="badge warn">renovar</span>` : ""}</div>
      </div>
      <div>
        <div class="small muted">Entregáveis: ${done}/${delivs.length}</div>
        <div class="team-progress"><span style="width:${pct}%"></span></div>
      </div>
      <ul class="team-links">
        ${(t.links || []).map((l) => `<li>📎 <a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a></li>`).join("") || `<li class="muted">Sem documentos</li>`}
      </ul>
      <button class="btn ghost" data-open="team:${t.id}">Editar time</button>
    </article>`;
  }).join("");
}

/* ---------- Modal / formulários ---------- */
const modal = $("#modal");
let onSave = null;
let onDelete = null;

function openModal({ title, body, save, remove }) {
  $("#modal-title").textContent = title;
  $("#modal-body").innerHTML = body;
  onSave = save;
  onDelete = remove || null;
  $("#modal-delete").hidden = !remove;
  modal.showModal();
}

const teamOptions = (selected) =>
  state.teams.map((t) => `<option value="${t.id}" ${t.id === selected ? "selected" : ""}>${esc(t.name)}</option>`).join("");

function openEvent(id, presetDate, presetStage) {
  const e = state.events.find((x) => x.id === id) ||
    { teamId: state.teams[0]?.id, type: "game", title: "", date: presetDate || toISO(today()), time: "", location: "", notes: "", stage: presetStage || "todo", owner: "" };
  openModal({
    title: id ? "Editar evento" : "Novo evento",
    body: `
      <div class="field"><label>Título</label><input name="title" required value="${esc(e.title)}" /></div>
      <div class="field-row">
        <div class="field"><label>Time</label><select name="teamId">${teamOptions(e.teamId)}</select></div>
        <div class="field"><label>Tipo</label><select name="type">
          ${Object.entries(TYPE_LABEL).map(([k, v]) => `<option value="${k}" ${k === e.type ? "selected" : ""}>${v}</option>`).join("")}
        </select></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Data</label><input type="date" name="date" required value="${e.date}" /></div>
        <div class="field"><label>Horário</label><input type="time" name="time" value="${esc(e.time)}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Fase</label><select name="stage">
          ${STAGES.map((s) => `<option value="${s.id}" ${s.id === e.stage ? "selected" : ""}>${s.label}</option>`).join("")}
        </select></div>
        <div class="field"><label>Responsável</label><input name="owner" placeholder="Nome" value="${esc(e.owner || "")}" /></div>
      </div>
      <div class="field"><label>Local</label><input name="location" value="${esc(e.location)}" /></div>
      <div class="field"><label>Observações</label><textarea name="notes">${esc(e.notes)}</textarea></div>`,
    save: (data) => {
      if (id) Object.assign(e, data);
      else state.events.push({ id: uid("e"), ...data });
      if (needsPlanning(data)) {
        toast(`Atenção: ativação com menos de ${CONFIG.planningLeadDays} dias de antecedência`);
      } else toast("Evento salvo");
    },
    remove: id ? () => { state.events = state.events.filter((x) => x.id !== id); toast("Evento excluído"); } : null,
  });
}

function openDeliverable(id) {
  const d = state.deliverables.find((x) => x.id === id) ||
    { teamId: state.teams[0]?.id, title: "", due: toISO(today()), done: false };
  openModal({
    title: id ? "Editar entregável" : "Novo entregável",
    body: `
      <div class="field"><label>Descrição</label><input name="title" required value="${esc(d.title)}" /></div>
      <div class="field-row">
        <div class="field"><label>Time</label><select name="teamId">${teamOptions(d.teamId)}</select></div>
        <div class="field"><label>Prazo</label><input type="date" name="due" required value="${d.due}" /></div>
      </div>`,
    save: (data) => {
      if (id) Object.assign(d, data);
      else state.deliverables.push({ id: uid("d"), done: false, ...data });
      toast("Entregável salvo");
    },
    remove: id ? () => { state.deliverables = state.deliverables.filter((x) => x.id !== id); toast("Entregável excluído"); } : null,
  });
}

function openTeam(id) {
  const t = state.teams.find((x) => x.id === id) ||
    { name: "", sport: "", color: "#1d4ed8", contractEnd: "", contact: "", links: [] };
  const linksText = (t.links || []).map((l) => `${l.label} | ${l.url}`).join("\n");
  openModal({
    title: id ? "Editar time" : "Novo time",
    body: `
      <div class="field"><label>Nome</label><input name="name" required value="${esc(t.name)}" /></div>
      <div class="field-row">
        <div class="field"><label>Modalidade</label><input name="sport" value="${esc(t.sport)}" /></div>
        <div class="field"><label>Cor</label><input type="color" name="color" value="${esc(t.color)}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Fim do contrato</label><input type="date" name="contractEnd" value="${t.contractEnd || ""}" /></div>
        <div class="field"><label>Contato</label><input name="contact" value="${esc(t.contact)}" /></div>
      </div>
      <div class="field"><label>Documentos e fotos</label>
        <textarea name="links" placeholder="Nome | https://link">${esc(linksText)}</textarea>
        <span class="hint">Um por linha, no formato: Nome | link</span>
      </div>`,
    save: (data) => {
      data.links = data.links.split("\n").map((line) => line.split("|").map((s) => s.trim()))
        .filter(([label]) => label).map(([label, url]) => ({ label, url: url || "#" }));
      if (id) Object.assign(t, data);
      else state.teams.push({ id: uid("t"), ...data });
      toast("Time salvo");
    },
    remove: id ? () => {
      state.teams = state.teams.filter((x) => x.id !== id);
      state.events = state.events.filter((e) => e.teamId !== id);
      state.deliverables = state.deliverables.filter((d) => d.teamId !== id);
      toast("Time excluído");
    } : null,
  });
}

/* ---------- Eventos de interface ---------- */
$("#modal-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const data = Object.fromEntries(new FormData(ev.target).entries());
  onSave?.(data);
  modal.close();
  saveState();
});
$("#modal-cancel").addEventListener("click", () => modal.close());
$("#modal-delete").addEventListener("click", () => {
  if (!confirm("Tem certeza que deseja excluir?")) return;
  onDelete?.();
  modal.close();
  saveState();
});

document.querySelectorAll(".tab").forEach((tab) =>
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${tab.dataset.view}`));
  })
);

document.addEventListener("click", (ev) => {
  const opener = ev.target.closest("[data-open]");
  if (opener) {
    ev.stopPropagation();
    const [kind, id] = opener.dataset.open.split(":");
    ({ event: openEvent, deliverable: openDeliverable, team: openTeam })[kind]?.(id);
    return;
  }
  const actionEl = ev.target.closest("[data-action]");
  const action = actionEl?.dataset.action;
  if (action === "new-event") openEvent(null, null, actionEl.dataset.stage);
  if (action === "new-deliverable") openDeliverable();
  if (action === "new-team") openTeam();

  const day = ev.target.closest(".day");
  if (day && !action) openEvent(null, day.dataset.date);
});

document.addEventListener("change", (ev) => {
  const id = ev.target.dataset?.toggle;
  if (id) {
    const d = state.deliverables.find((x) => x.id === id);
    d.done = ev.target.checked;
    saveState();
  }
});

$("#filter-team").addEventListener("change", renderCalendar);
$("#filter-deliv-team").addEventListener("change", renderDeliverables);
$("#filter-deliv-status").addEventListener("change", renderDeliverables);
$("#prev-month").addEventListener("click", () => { viewMonth.setMonth(viewMonth.getMonth() - 1); renderCalendar(); });
$("#next-month").addEventListener("click", () => { viewMonth.setMonth(viewMonth.getMonth() + 1); renderCalendar(); });
$("#today-btn").addEventListener("click", () => { viewMonth = startOfMonth(new Date()); renderCalendar(); });

$("#btn-export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `parcerias-${toISO(today())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$("#input-import").addEventListener("change", async (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.teams) || !Array.isArray(data.events) || !Array.isArray(data.deliverables)) throw new Error();
    state = normalize(data);
    saveState();
    toast("Dados importados");
  } catch {
    toast("Arquivo inválido");
  }
  ev.target.value = "";
});

$("#btn-reset").addEventListener("click", () => {
  if (!confirm("Isso substitui seus dados pelos dados de exemplo. Continuar?")) return;
  state = normalize(structuredClone(window.SEED));
  saveState();
  toast("Dados de exemplo restaurados");
});

initBoard();
render();
