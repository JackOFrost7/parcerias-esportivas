/* =========================================================
   Importar contrato com IA
   1. Usuário cola o texto ou envia o PDF do contrato
   2. O backend (/api/extract-contract) chama o Claude e devolve JSON estruturado
   3. O app mostra uma prévia editável (revisão humana) e, ao confirmar,
      cria o time, os entregáveis (com recorrências expandidas) e as ativações.
   Sem backend (ex.: GitHub Pages), o contrato de exemplo roda em "modo demo".
   ========================================================= */

const AI = {
  endpoint: "api/extract-contract",
  timeoutMs: 90_000,
  maxPdfBytes: 3 * 1024 * 1024,
  maxOccurrences: 24, // limite de ocorrências geradas por entregável recorrente
};

const RECUR_LABEL = { nenhuma: "", semanal: "Semanal", mensal: "Mensal", trimestral: "Trimestral", por_jogo: "Todo jogo" };
const TEAM_COLORS = ["#0891b2", "#be123c", "#4d7c0f", "#a16207", "#6d28d9", "#0f766e"];

let aiPdf = null;     // { name, size, base64 }
let aiResult = null;  // resultado sanitizado da API
let aiMode = null;    // "ia" | "demo"

/* ---------- Entrada ---------- */
$("#ai-sample").addEventListener("click", () => {
  clearPdf();
  $("#ai-text").value = window.SAMPLE_CONTRACT.text;
  setStatus("Contrato fictício carregado. Clique em “Extrair com IA”.");
});

$("#ai-file").addEventListener("change", async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = "";
  if (!file) return;
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    if (file.size > AI.maxPdfBytes) return setStatus("O PDF precisa ter no máximo 3 MB.", "error");
    aiPdf = { name: file.name, size: file.size, base64: await fileToBase64(file) };
    $("#ai-text").value = "";
    renderPdfChip();
    setStatus("PDF pronto para análise.");
  } else {
    clearPdf();
    $("#ai-text").value = await file.text();
    setStatus(`Texto de “${file.name}” carregado.`);
  }
});

$("#ai-pdf-chip").addEventListener("click", (ev) => {
  if (ev.target.closest("[data-ai-clear-pdf]")) { clearPdf(); setStatus(""); }
});

function clearPdf() { aiPdf = null; renderPdfChip(); }

function renderPdfChip() {
  const chip = $("#ai-pdf-chip");
  chip.hidden = !aiPdf;
  chip.innerHTML = aiPdf
    ? `📄 ${esc(aiPdf.name)} <span class="muted">(${(aiPdf.size / 1024 / 1024).toFixed(1)} MB)</span>
       <button type="button" class="link-btn" data-ai-clear-pdf aria-label="Remover PDF">remover</button>`
    : "";
  $("#ai-text").disabled = !!aiPdf;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function setStatus(msg, kind = "") {
  const el = $("#ai-status");
  el.textContent = msg;
  el.className = `ai-status ${kind}`;
}

/* ---------- Extração ---------- */
$("#ai-extract").addEventListener("click", extract);

async function extract() {
  const text = $("#ai-text").value.trim();
  if (!text && !aiPdf) return setStatus("Cole o texto do contrato ou envie um PDF.", "error");

  const btn = $("#ai-extract");
  btn.disabled = true;
  btn.textContent = "Analisando contrato…";
  setStatus("O Claude está lendo o contrato e identificando entregáveis e ativações.", "loading");

  try {
    const res = await callApi({ text: aiPdf ? undefined : text, pdfBase64: aiPdf?.base64 });
    showResult(res.result, "ia");
    setStatus("Extração concluída. Revise os itens antes de adicionar.", "ok");
  } catch (err) {
    // Sem backend disponível: o contrato de exemplo cai no modo demo
    if (err.offline && !aiPdf && text === window.SAMPLE_CONTRACT.text.trim()) {
      showResult(structuredClone(window.SAMPLE_CONTRACT.result), "demo");
      setStatus("Modo demo: backend de IA indisponível, exibindo resultado pré-calculado do contrato de exemplo.", "ok");
    } else if (err.offline) {
      setStatus("A extração com IA precisa do backend (veja o README: “Rodar com IA”). Enquanto isso, teste com o contrato de exemplo.", "error");
    } else {
      setStatus(err.message || "Não foi possível analisar o contrato.", "error");
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "✨ Extrair com IA";
  }
}

async function callApi(payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI.timeoutMs);
  let res;
  try {
    res = await fetch(AI.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, today: toISO(today()), teams: state.teams.map((t) => t.name) }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw Object.assign(new Error(e.name === "AbortError" ? "A análise demorou demais. Tente novamente." : "Sem conexão com o backend."),
      { offline: e.name !== "AbortError" });
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try { data = await res.json(); } catch (_) { /* resposta não-JSON = sem backend (ex.: 404 do GitHub Pages) */ }
  if (!data || res.status === 404 || res.status === 405 || data.code === "NO_KEY") {
    throw Object.assign(new Error("Backend de IA indisponível."), { offline: true });
  }
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

/* ---------- Recorrências ---------- */
function addMonths(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth() + n, 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(date.getDate(), last));
  return d;
}

// Gera as datas de um entregável recorrente dentro da vigência, a partir de hoje
function occurrences(item, vig) {
  if (item.recorrencia === "nenhuma") return item.prazo ? [item.prazo] : [];
  const end = vig.fim ? parseDate(vig.fim) : addMonths(today(), 12);
  if (item.recorrencia === "por_jogo") return [toISO(end)];

  const stepMonths = { mensal: 1, trimestral: 3 }[item.recorrencia];
  let cursor = item.prazo ? parseDate(item.prazo) : vig.inicio ? parseDate(vig.inicio) : today();
  const next = (d, i) => stepMonths ? addMonths(cursor, stepMonths * i) : new Date(cursor.getTime() + 7 * 86400000 * i);
  // a 1ª ocorrência é o fim do 1º período, não o dia da assinatura
  const dates = [];
  for (let i = item.prazo ? 0 : 1; dates.length < AI.maxOccurrences; i++) {
    const d = next(cursor, i);
    if (d > end) break;
    if (d >= today()) dates.push(toISO(d));
  }
  return dates;
}

/* ---------- Prévia editável ---------- */
function showResult(result, mode) {
  aiResult = result;
  aiMode = mode;
  const r = result;
  const match = state.teams.find((t) => t.name.toLowerCase() === r.time.nome.toLowerCase());

  const delivRows = r.entregaveis.map((d, i) => {
    const occ = occurrences(d, r.vigencia);
    const recurring = d.recorrencia !== "nenhuma";
    const occInfo = d.recorrencia === "por_jogo"
      ? "1 item com prazo no fim do contrato"
      : recurring ? `${occ.length} ocorrência${occ.length === 1 ? "" : "s"} até o fim do contrato` : "";
    return `<li class="ai-item" data-kind="deliv" data-i="${i}">
      <input type="checkbox" class="ai-check" ${occ.length ? "checked" : ""} aria-label="Incluir" />
      <div class="ai-fields">
        <input class="ai-title" value="${esc(d.titulo)}" aria-label="Título" />
        <div class="ai-meta">
          ${recurring
            ? `<span class="badge info">${RECUR_LABEL[d.recorrencia]}</span><span class="muted small">${occInfo}</span>`
            : `<input type="date" class="ai-date" value="${d.prazo || ""}" aria-label="Prazo" />
               ${d.prazo ? "" : `<span class="badge warn">sem data no contrato</span>`}`}
        </div>
        ${d.trecho ? `<blockquote class="ai-quote">“${esc(d.trecho)}”</blockquote>` : ""}
      </div>
    </li>`;
  }).join("") || `<li class="empty">Nenhum entregável encontrado.</li>`;

  const actRows = r.ativacoes.map((a, i) => {
    const n = a.data ? daysUntil(a.data) : null;
    const tight = n !== null && n >= 0 && n < CONFIG.planningLeadDays;
    return `<li class="ai-item" data-kind="act" data-i="${i}">
      <input type="checkbox" class="ai-check" ${a.data ? "checked" : ""} aria-label="Incluir" />
      <div class="ai-fields">
        <input class="ai-title" value="${esc(a.titulo)}" aria-label="Título" />
        <div class="ai-meta">
          <input type="date" class="ai-date" value="${a.data || ""}" aria-label="Data" />
          <input type="time" class="ai-time" value="${esc(a.horario || "")}" aria-label="Horário" />
          ${a.data ? "" : `<span class="badge warn">data a definir</span>`}
          ${tight ? `<span class="badge late">⚠ menos de ${CONFIG.planningLeadDays} dias</span>` : ""}
        </div>
        ${a.local || a.observacoes ? `<div class="muted small">${[a.local && "📍 " + esc(a.local), esc(a.observacoes || "")].filter(Boolean).join(" · ")}</div>` : ""}
        ${a.trecho ? `<blockquote class="ai-quote">“${esc(a.trecho)}”</blockquote>` : ""}
      </div>
    </li>`;
  }).join("") || `<li class="empty">Nenhuma ativação encontrada.</li>`;

  $("#ai-result").hidden = false;
  $("#ai-result").innerHTML = `
    <div class="card-head">
      <div>
        <h2>${esc(r.time.nome)} <span class="badge ${mode === "demo" ? "warn" : "ok"}">${mode === "demo" ? "Modo demo" : "Extraído com IA"}</span></h2>
        <p class="muted small ai-summary">${esc(r.resumo)}</p>
      </div>
    </div>

    ${r.avisos.length ? `<div class="ai-warnings"><strong>Pontos de atenção</strong><ul>${r.avisos.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}

    <div class="field-row ai-team">
      <div class="field"><label for="ai-team">Vincular ao time</label>
        <select id="ai-team">
          <option value="__new">+ Criar novo time: ${esc(r.time.nome)}</option>
          ${state.teams.map((t) => `<option value="${t.id}" ${match?.id === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Vigência</label>
        <div class="ai-vig">${r.vigencia.inicio ? fmtDate(r.vigencia.inicio) : "—"} → ${r.vigencia.fim ? fmtDate(r.vigencia.fim) : "—"}</div>
      </div>
    </div>

    <h3 class="ai-section">Entregáveis <span class="muted small">(${r.entregaveis.length})</span></h3>
    <ul class="ai-list">${delivRows}</ul>

    <h3 class="ai-section">Ativações <span class="muted small">(${r.ativacoes.length})</span></h3>
    <ul class="ai-list">${actRows}</ul>

    <div class="modal-actions ai-actions">
      <button type="button" class="btn ghost" id="ai-discard">Descartar</button>
      <span class="spacer"></span>
      <button type="button" class="btn primary" id="ai-import">Adicionar ao app</button>
    </div>`;

  $("#ai-result").scrollIntoView({ behavior: "smooth", block: "start" });
}

$("#ai-result").addEventListener("click", (ev) => {
  if (ev.target.id === "ai-discard") { $("#ai-result").hidden = true; aiResult = null; setStatus(""); }
  if (ev.target.id === "ai-import") importResult();
});

// Marcar o checkbox automaticamente quando a pessoa preenche uma data que faltava
$("#ai-result").addEventListener("input", (ev) => {
  if (ev.target.classList.contains("ai-date") && ev.target.value) {
    ev.target.closest(".ai-item").querySelector(".ai-check").checked = true;
    ev.target.classList.remove("invalid");
  }
});

/* ---------- Importar para o app ---------- */
function importResult() {
  const r = aiResult;
  if (!r) return;
  const items = [...document.querySelectorAll("#ai-result .ai-item")]
    .filter((li) => li.querySelector(".ai-check").checked);

  // Validação: itens marcados sem data
  const missing = items.filter((li) => {
    const date = li.querySelector(".ai-date");
    return date && !date.value;
  });
  missing.forEach((li) => li.querySelector(".ai-date").classList.add("invalid"));
  if (missing.length) return toast("Preencha a data dos itens marcados ou desmarque-os");
  if (!items.length) return toast("Selecione ao menos um item");

  // Time: novo ou existente
  let teamId = $("#ai-team").value;
  if (teamId === "__new") {
    teamId = uid("t");
    state.teams.push({
      id: teamId,
      name: r.time.nome,
      sport: r.time.modalidade || "",
      color: TEAM_COLORS[state.teams.length % TEAM_COLORS.length],
      contractEnd: r.vigencia.fim || "",
      contact: r.time.contato || "",
      links: [{ label: aiPdf ? `Contrato (${aiPdf.name})` : "Contrato (PDF)", url: "#" }],
    });
  } else {
    const t = teamById(teamId);
    if (t && !t.contractEnd && r.vigencia.fim) t.contractEnd = r.vigencia.fim;
  }

  let nDeliv = 0, nAct = 0, nTight = 0;
  for (const li of items) {
    const src = li.dataset.kind === "deliv" ? r.entregaveis[li.dataset.i] : r.ativacoes[li.dataset.i];
    const title = li.querySelector(".ai-title").value.trim() || src.titulo;

    if (li.dataset.kind === "deliv") {
      const dateInput = li.querySelector(".ai-date");
      const dates = dateInput ? [dateInput.value] : occurrences(src, r.vigencia);
      dates.forEach((due) => {
        const suffix = src.recorrencia === "por_jogo" ? " (todos os jogos)"
          : dates.length > 1 ? ` — ${parseDate(due).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", "").replace(" de ", "/")}` : "";
        state.deliverables.push({ id: uid("d"), teamId, title: title + suffix, due, done: false });
        nDeliv++;
      });
    } else {
      const ev = {
        id: uid("e"), teamId, type: "activation", stage: "todo", owner: "",
        title,
        date: li.querySelector(".ai-date").value,
        time: li.querySelector(".ai-time").value,
        location: src.local || "",
        notes: [src.observacoes, src.trecho && `Contrato: “${src.trecho}”`].filter(Boolean).join("\n"),
      };
      if (needsPlanning(ev)) nTight++;
      state.events.push(ev);
      nAct++;
    }
  }

  saveState();
  $("#ai-result").hidden = true;
  aiResult = null;
  clearPdf();
  $("#ai-text").value = "";
  setStatus(`Adicionados ${nDeliv} entregáveis e ${nAct} ativações.`, "ok");
  toast(nTight
    ? `${nDeliv + nAct} itens adicionados · ${nTight} ativação(ões) com menos de ${CONFIG.planningLeadDays} dias!`
    : `${nDeliv + nAct} itens adicionados ao app`);
  document.querySelector('.tab[data-view="board"]').click();
}
