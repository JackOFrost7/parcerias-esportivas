/* =========================================================
   Sincronização com o Supabase (PostgreSQL)
   - Login por e-mail e senha (Supabase Auth)
   - Carrega times, eventos e entregáveis do banco
   - Cada alteração envia ao banco só o que mudou (diff por linha)
   - Tempo real: quando alguém do time altera algo, a tela de todos atualiza
   Sem configuração ou sem login, o app continua em modo local.
   ========================================================= */

/* ---------- Mapeamento app (camelCase) ↔ banco (snake_case) ---------- */
const TABLES = [
  {
    name: "teams", key: "teams",
    toRow: (t) => ({
      id: t.id, name: t.name, sport: t.sport || "", color: t.color || "#1d4ed8",
      contract_end: t.contractEnd || null, contact: t.contact || "", links: t.links || [],
    }),
    fromRow: (r) => ({
      id: r.id, name: r.name, sport: r.sport, color: r.color,
      contractEnd: r.contract_end || "", contact: r.contact, links: r.links || [],
    }),
  },
  {
    name: "events", key: "events",
    toRow: (e) => ({
      id: e.id, team_id: e.teamId, type: e.type, stage: e.stage, title: e.title, date: e.date,
      time: e.time || null, location: e.location || "", owner: e.owner || "", notes: e.notes || "",
    }),
    fromRow: (r) => ({
      id: r.id, teamId: r.team_id, type: r.type, stage: r.stage, title: r.title, date: r.date,
      time: r.time ? r.time.slice(0, 5) : "", location: r.location, owner: r.owner, notes: r.notes,
    }),
  },
  {
    name: "deliverables", key: "deliverables",
    toRow: (d) => ({ id: d.id, team_id: d.teamId, title: d.title, due: d.due, done: !!d.done }),
    fromRow: (r) => ({ id: r.id, teamId: r.team_id, title: r.title, due: r.due, done: r.done }),
  },
];

window.Remote = {
  client: null,
  active: false,
  user: null,
  synced: null,          // { teams: Map(id → json), ... } — último estado confirmado pelo banco
  chain: Promise.resolve(),
  pending: 0,
  channel: null,
  reloadTimer: null,

  init() {
    const cfg = window.APP_CONFIG || {};
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase?.createClient) {
      setSyncStatus("local");
      return;
    }
    this.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    $("#btn-login").hidden = false;
    setSyncStatus("local");

    this.client.auth.onAuthStateChange((event, session) => {
      // Adia para fora do callback (recomendação do supabase-js)
      setTimeout(() => {
        if (session?.user && (!this.active || this.user?.id !== session.user.id)) this.enter(session.user);
        else if (!session && this.active) this.leave();
      }, 0);
    });
  },

  async enter(user) {
    this.user = user;
    setSyncStatus("loading");
    try {
      await this.load();
      this.active = true;
      this.subscribe();
      setSyncStatus("online");
      toast(`Conectado ao banco do time`);
    } catch (err) {
      console.error(err);
      setSyncStatus("error", "Não foi possível carregar os dados do banco.");
      toast("Erro ao carregar do banco: " + (err.message || err));
    }
  },

  leave() {
    this.active = false;
    this.user = null;
    this.synced = null;
    if (this.channel) this.client.removeChannel(this.channel);
    this.channel = null;
    state = loadState(); // volta para os dados locais do navegador
    render();
    setSyncStatus("local");
  },

  async load() {
    const results = await Promise.all(TABLES.map((t) =>
      this.client.from(t.name).select("*").order("created_at", { ascending: true })));
    const failed = results.find((r) => r.error);
    if (failed) throw failed.error;

    const next = {};
    TABLES.forEach((t, i) => { next[t.key] = results[i].data.map(t.fromRow); });
    state = normalize(next);
    this.snapshot();
    render();
  },

  snapshot() {
    this.synced = {};
    for (const t of TABLES) {
      this.synced[t.key] = new Map(state[t.key].map((x) => [x.id, JSON.stringify(t.toRow(x))]));
    }
  },

  // Enfileira um envio; vários saves seguidos viram envios em sequência
  sync() {
    this.pending++;
    setSyncStatus("saving");
    this.chain = this.chain
      .then(() => this.push())
      .catch(async (err) => {
        console.error(err);
        toast("Erro ao salvar no banco: " + (err.message || "tente novamente"));
        await this.load().catch(() => {}); // volta ao que está no banco
      })
      .finally(() => {
        this.pending--;
        if (!this.pending) setSyncStatus(this.active ? "online" : "local");
      });
    return this.chain;
  },

  async push() {
    if (!this.active) return;
    const upserts = {}, deletes = {};
    for (const t of TABLES) {
      const prev = this.synced[t.key];
      const rows = state[t.key].map(t.toRow);
      const ids = new Set(rows.map((r) => r.id));
      upserts[t.key] = rows.filter((r) => prev.get(r.id) !== JSON.stringify(r));
      deletes[t.key] = [...prev.keys()].filter((id) => !ids.has(id));
    }
    // Times primeiro (chave estrangeira); exclusões na ordem inversa
    for (const t of TABLES) {
      if (upserts[t.key].length) {
        const { error } = await this.client.from(t.name).upsert(upserts[t.key]);
        if (error) throw error;
      }
    }
    for (const t of [...TABLES].reverse()) {
      if (deletes[t.key].length) {
        const { error } = await this.client.from(t.name).delete().in("id", deletes[t.key]);
        if (error) throw error;
      }
    }
    for (const t of TABLES) {
      upserts[t.key].forEach((r) => this.synced[t.key].set(r.id, JSON.stringify(r)));
      deletes[t.key].forEach((id) => this.synced[t.key].delete(id));
    }
  },

  // Tempo real: recarrega quando outra pessoa altera algo
  subscribe() {
    if (this.channel) this.client.removeChannel(this.channel);
    this.channel = this.client
      .channel("parcerias")
      .on("postgres_changes", { event: "*", schema: "public" }, () => this.scheduleReload())
      .subscribe();
  },

  scheduleReload(delay = 500) {
    clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => {
      // Não recarrega no meio de uma edição, de um arraste ou de um envio
      const busy = $("#modal").open || $("#login-modal").open || (typeof drag !== "undefined" && drag) || this.pending > 0 ||
        !$("#ai-result").hidden;
      if (busy) return this.scheduleReload(1500);
      if (this.active) this.load().catch((e) => console.error(e));
    }, delay);
  },

  async signIn(email, password) {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  async signOut() {
    await this.client.auth.signOut();
  },
};

/* ---------- Interface ---------- */
function setSyncStatus(kind, title = "") {
  const el = $("#sync-status");
  const labels = {
    local: "Modo local",
    loading: "Conectando…",
    online: "Sincronizado",
    saving: "Salvando…",
    error: "Erro de conexão",
  };
  el.dataset.state = kind;
  el.textContent = labels[kind];
  el.title = title || (kind === "local"
    ? "Dados salvos apenas neste navegador"
    : `Banco do time${Remote.user?.email ? " · " + Remote.user.email : ""}`);
  $("#btn-login").textContent = Remote.active ? "Sair" : "Entrar";
  $("#btn-reset").hidden = Remote.active; // não apaga o banco do time por engano
}

$("#btn-login").addEventListener("click", () => {
  if (Remote.active) {
    if (confirm(`Sair da conta ${Remote.user?.email || ""}?`)) Remote.signOut();
    return;
  }
  $("#login-error").textContent = "";
  $("#login-modal").showModal();
});

$("#login-cancel").addEventListener("click", () => $("#login-modal").close());

$("#login-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const btn = $("#login-submit");
  btn.disabled = true;
  $("#login-error").textContent = "";
  try {
    await Remote.signIn(form.email.value.trim(), form.password.value);
    form.reset();
    $("#login-modal").close();
  } catch (err) {
    $("#login-error").textContent = /invalid/i.test(err.message || "")
      ? "E-mail ou senha incorretos."
      : err.message || "Não foi possível entrar.";
  } finally {
    btn.disabled = false;
  }
});

Remote.init();
