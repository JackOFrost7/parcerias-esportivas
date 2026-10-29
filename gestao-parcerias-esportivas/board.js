/* =========================================================
   Quadro de eventos (estilo Pipefy / kanban)
   Cada evento é um card que anda pelas fases do pipe.
   Arraste com o mouse ou, no celular, segure o card e arraste.
   ========================================================= */

const STAGES = [
  { id: "todo",       label: "A planejar",         color: "#94a3b8" },
  { id: "planning",   label: "Em planejamento",    color: "#3b82f6" },
  { id: "production", label: "Em produção",        color: "#f59e0b" },
  { id: "ready",      label: "Pronto p/ executar", color: "#10b981" },
  { id: "done",       label: "Realizado",          color: "#8b5cf6" },
];

const PERIODS = [
  { id: "today", label: "Hoje" },
  { id: "week",  label: "Próximos 7 dias" },
  { id: "month", label: "Próximos 30 dias" },
  { id: "alert", label: "⚠ Precisam de planejamento" },
  { id: "late",  label: "Data já passou" },
];

const boardFilter = { q: "", team: "all", period: "all" };

const stageLabel = (id) => STAGES.find((s) => s.id === id)?.label || id;

/* ---------- Regras de urgência ---------- */
function eventUrgency(e) {
  if (e.stage === "done") return null;
  const n = daysUntil(e.date);
  if (n < 0)   return { cls: "late", label: `Passou há ${-n}d` };
  if (n === 0) return { cls: "late", label: "Hoje" };
  if (n === 1) return { cls: "warn", label: "Amanhã" };
  if (n <= 7)  return { cls: "warn", label: `Em ${n} dias` };
  if (n <= 30) return { cls: "info", label: `Em ${n} dias` };
  return { cls: "muted", label: `Em ${n} dias` };
}

// Ativação que ainda não saiu do planejamento e já está dentro da janela mínima
function needsPlanning(e) {
  if (e.type !== "activation" || !["todo", "planning"].includes(e.stage)) return false;
  const n = daysUntil(e.date);
  return n >= 0 && n < CONFIG.planningLeadDays;
}

function inPeriod(e, period) {
  const n = daysUntil(e.date);
  const open = e.stage !== "done";
  switch (period) {
    case "today": return open && n === 0;
    case "week":  return open && n >= 0 && n <= 7;
    case "month": return open && n >= 0 && n <= 30;
    case "alert": return needsPlanning(e);
    case "late":  return open && n < 0;
    default:      return true;
  }
}

function matchesBase(e) {
  if (boardFilter.team !== "all" && e.teamId !== boardFilter.team) return false;
  if (boardFilter.q) {
    const hay = `${e.title} ${e.location || ""} ${e.owner || ""} ${teamById(e.teamId)?.name || ""}`.toLowerCase();
    if (!hay.includes(boardFilter.q)) return false;
  }
  return true;
}

/* ---------- Render ---------- */
function renderBoard() {
  const board = document.getElementById("board");
  if (!board) return;

  const base = state.events.filter(matchesBase);

  // Resumo clicável no topo do quadro
  const chips = [{ id: "all", label: "Todos", count: base.length }]
    .concat(PERIODS.map((p) => ({ ...p, count: base.filter((e) => inPeriod(e, p.id)).length })));
  $("#board-summary").innerHTML = chips.map((c) =>
    `<button class="schip${boardFilter.period === c.id ? " active" : ""}${c.id === "alert" && c.count ? " alert" : ""}" data-period="${c.id}">
      ${c.label} <strong>${c.count}</strong>
    </button>`).join("");

  const visible = base.filter((e) => inPeriod(e, boardFilter.period));
  const scroll = board.scrollLeft;

  board.innerHTML = STAGES.map((stage) => {
    const cards = visible
      .filter((e) => e.stage === stage.id)
      .sort((a, b) => stage.id === "done"
        ? b.date.localeCompare(a.date)
        : (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
    return `<section class="kcol" data-stage="${stage.id}" style="--phase:${stage.color}">
      <header class="kcol-head">
        <h3>${stage.label}</h3>
        <span class="kcount">${cards.length}</span>
        <button class="kadd" data-action="new-event" data-stage="${stage.id}" title="Novo card em ${stage.label}" aria-label="Novo card em ${stage.label}">+</button>
      </header>
      <div class="kcol-body">
        ${cards.map(kanbanCard).join("") || `<div class="kempty">Arraste um card para cá</div>`}
      </div>
    </section>`;
  }).join("");

  board.scrollLeft = scroll;
}

function kanbanCard(e) {
  const team = teamById(e.teamId);
  const u = eventUrgency(e);
  const d = parseDate(e.date);
  return `<article class="kcard${u ? " urg-" + u.cls : ""}" data-id="${e.id}" tabindex="0" aria-label="${esc(e.title)}">
    <div class="klabels">
      <span class="badge ${e.type}">${TYPE_LABEL[e.type]}</span>
      ${u ? `<span class="badge ${u.cls}">${u.label}</span>` : ""}
      ${needsPlanning(e) ? `<span class="badge late" title="Menos de ${CONFIG.planningLeadDays} dias e ainda em planejamento">⚠ Planejar</span>` : ""}
    </div>
    <h4>${esc(e.title)}</h4>
    <div class="kfield"><span class="team-dot" style="background:${esc(team?.color || "#94a3b8")}"></span>${esc(team?.name || "Sem time")}</div>
    ${e.location ? `<div class="kfield">📍 ${esc(e.location)}</div>` : ""}
    <footer class="kfoot">
      <span>📅 ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${e.time ? " · " + esc(e.time) : ""}</span>
      ${e.owner ? `<span class="owner" title="Responsável: ${esc(e.owner)}">${esc(initials(e.owner))}</span>` : ""}
    </footer>
  </article>`;
}

/* ---------- Arrastar e soltar (mouse + toque) ---------- */
const DRAG_THRESHOLD = 6;   // px de movimento do mouse para iniciar o arraste
const LONG_PRESS_MS = 220;  // no toque, segure para arrastar (senão é rolagem)
let drag = null;

const preventTouchScroll = (ev) => ev.preventDefault();

function onCardPointerDown(ev) {
  const card = ev.target.closest(".kcard");
  if (!card || (ev.pointerType === "mouse" && ev.button !== 0)) return;

  drag = {
    card, id: card.dataset.id,
    x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY,
    touch: ev.pointerType !== "mouse",
    active: false, cancelled: false, col: null,
  };
  if (drag.touch) drag.timer = setTimeout(() => drag && !drag.cancelled && startDrag(), LONG_PRESS_MS);

  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd);
  window.addEventListener("pointercancel", cleanupDrag);
}

function onDragMove(ev) {
  if (!drag) return;
  drag.x = ev.clientX;
  drag.y = ev.clientY;
  if (!drag.active) {
    if (Math.hypot(drag.x - drag.x0, drag.y - drag.y0) > DRAG_THRESHOLD) {
      if (drag.touch) { drag.cancelled = true; clearTimeout(drag.timer); } // é rolagem
      else startDrag();
    }
    return;
  }
  ev.preventDefault();
  positionGhost();
}

function startDrag() {
  const r = drag.card.getBoundingClientRect();
  drag.dx = drag.x - r.left;
  drag.dy = drag.y - r.top;

  const ghost = drag.card.cloneNode(true);
  ghost.classList.add("ghost");
  ghost.style.width = r.width + "px";
  document.body.appendChild(ghost);

  drag.ghost = ghost;
  drag.active = true;
  drag.card.classList.add("placeholder");
  document.body.classList.add("is-dragging");
  window.addEventListener("touchmove", preventTouchScroll, { passive: false });
  navigator.vibrate?.(15);
  positionGhost();

  // Loop: atualiza a coluna de destino e rola o quadro nas bordas
  const tick = () => {
    if (!drag?.active) return;
    updateDropTarget();
    autoScrollBoard();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function positionGhost() {
  drag.ghost.style.left = drag.x - drag.dx + "px";
  drag.ghost.style.top = drag.y - drag.dy + "px";
}

function updateDropTarget() {
  const col = document.elementFromPoint(drag.x, drag.y)?.closest(".kcol") || null;
  if (col !== drag.col) {
    drag.col?.classList.remove("drop-target");
    col?.classList.add("drop-target");
    drag.col = col;
  }
}

function autoScrollBoard() {
  const board = document.getElementById("board");
  const r = board.getBoundingClientRect();
  const edge = 70;
  if (drag.x < r.left + edge) board.scrollLeft -= 12;
  else if (drag.x > r.right - edge) board.scrollLeft += 12;
}

function onDragEnd() {
  if (!drag) return;
  const d = drag;
  const moved = Math.hypot(d.x - d.x0, d.y - d.y0);
  cleanupDrag();

  if (d.active) {
    const stage = d.col?.dataset.stage;
    const e = state.events.find((x) => x.id === d.id);
    if (e && stage && stage !== e.stage) {
      e.stage = stage;
      saveState();
      toast(`Movido para “${stageLabel(stage)}”`);
    }
  } else if (!d.cancelled && moved <= DRAG_THRESHOLD) {
    openEvent(d.id); // foi um clique/toque simples
  }
}

function cleanupDrag() {
  if (!drag) return;
  clearTimeout(drag.timer);
  drag.ghost?.remove();
  drag.card.classList.remove("placeholder");
  drag.col?.classList.remove("drop-target");
  document.body.classList.remove("is-dragging");
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", onDragEnd);
  window.removeEventListener("pointercancel", cleanupDrag);
  window.removeEventListener("touchmove", preventTouchScroll);
  drag = null;
}

/* ---------- Inicialização ---------- */
function initBoard() {
  const board = document.getElementById("board");
  board.addEventListener("pointerdown", onCardPointerDown);
  board.addEventListener("contextmenu", (ev) => { if (ev.target.closest(".kcard")) ev.preventDefault(); });
  board.addEventListener("keydown", (ev) => {
    const card = ev.target.closest(".kcard");
    if (card && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); openEvent(card.dataset.id); }
  });

  $("#board-search").addEventListener("input", (ev) => {
    boardFilter.q = ev.target.value.trim().toLowerCase();
    renderBoard();
  });
  $("#filter-board-team").addEventListener("change", (ev) => {
    boardFilter.team = ev.target.value;
    renderBoard();
  });
  $("#board-summary").addEventListener("click", (ev) => {
    const chip = ev.target.closest("[data-period]");
    if (!chip) return;
    const p = chip.dataset.period;
    boardFilter.period = boardFilter.period === p && p !== "all" ? "all" : p;
    renderBoard();
  });
}
