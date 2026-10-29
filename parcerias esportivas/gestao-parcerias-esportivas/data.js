/**
 * Dados de exemplo (100% fictícios).
 * As datas são geradas em relação ao dia de hoje para que a demo
 * sempre mostre eventos próximos, alertas e entregáveis atrasados.
 */
window.SEED = (function () {
  const day = 24 * 60 * 60 * 1000;
  // Data local (não UTC) para não pular de dia à noite
  const iso = (offsetDays) => {
    const d = new Date(Date.now() + offsetDays * day);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const teams = [
    {
      id: "t1",
      name: "Cerrado FC",
      sport: "Futebol",
      color: "#16a34a",
      contractEnd: iso(240),
      contact: "contato@cerradofc.exemplo",
      links: [
        { label: "Contrato (PDF)", url: "#" },
        { label: "Pasta de fotos", url: "#" },
        { label: "Manual de marca do time", url: "#" }
      ]
    },
    {
      id: "t2",
      name: "Araguaia Vôlei",
      sport: "Vôlei",
      color: "#2563eb",
      contractEnd: iso(150),
      contact: "marketing@araguaiavolei.exemplo",
      links: [
        { label: "Contrato (PDF)", url: "#" },
        { label: "Fotos da temporada", url: "#" }
      ]
    },
    {
      id: "t3",
      name: "Planalto Basquete",
      sport: "Basquete",
      color: "#ea580c",
      contractEnd: iso(320),
      contact: "parcerias@planaltobasquete.exemplo",
      links: [{ label: "Contrato (PDF)", url: "#" }]
    },
    {
      id: "t4",
      name: "Corrida Serra Dourada",
      sport: "Corrida de rua",
      color: "#7c3aed",
      contractEnd: iso(90),
      contact: "org@serradourada.exemplo",
      links: [
        { label: "Regulamento da prova", url: "#" },
        { label: "Kit do patrocinador", url: "#" }
      ]
    }
  ];

  // stage = fase do card no quadro: todo | planning | production | ready | done
  const events = [
    { id: "e1", teamId: "t1", type: "game", stage: "ready", owner: "Ana Lima", title: "Cerrado FC x Rio Verde EC", date: iso(0), time: "16:00", location: "Estádio Municipal", notes: "Placa de LED no 2º tempo." },
    { id: "e2", teamId: "t2", type: "game", stage: "ready", owner: "Bruno Reis", title: "Araguaia x Litoral Vôlei", date: iso(3), time: "19:30", location: "Ginásio Central", notes: "" },
    { id: "e3", teamId: "t1", type: "activation", stage: "production", owner: "Ana Lima", title: "Sampling na entrada do estádio", date: iso(20), time: "14:00", location: "Portão A", notes: "Precisa de promotores e tenda." },
    { id: "e4", teamId: "t3", type: "game", stage: "planning", owner: "Carla Souza", title: "Planalto x Capital Basket", date: iso(6), time: "20:00", location: "Arena Planalto", notes: "" },
    { id: "e5", teamId: "t4", type: "activation", stage: "planning", owner: "Diego Alves", title: "Estande na entrega de kits", date: iso(38), time: "09:00", location: "Shopping Parque", notes: "Validar layout do estande com o time de trade." },
    { id: "e6", teamId: "t2", type: "activation", stage: "todo", owner: "Bruno Reis", title: "Meet & greet com atletas", date: iso(60), time: "18:00", location: "Ginásio Central", notes: "" },
    { id: "e7", teamId: "t3", type: "other", stage: "production", owner: "Carla Souza", title: "Sessão de fotos do uniforme", date: iso(14), time: "10:00", location: "CT Planalto", notes: "Conferir aplicação da logo na manga." },
    { id: "e8", teamId: "t4", type: "game", stage: "todo", owner: "Diego Alves", title: "Corrida Serra Dourada 10K", date: iso(45), time: "06:30", location: "Parque da Cidade", notes: "" },
    { id: "e9", teamId: "t1", type: "game", stage: "planning", owner: "Ana Lima", title: "Cerrado FC x Vale do Sol", date: iso(17), time: "16:00", location: "Estádio Municipal", notes: "" },
    { id: "e10", teamId: "t3", type: "activation", stage: "todo", owner: "Carla Souza", title: "Quadra aberta para crianças", date: iso(29), time: "15:00", location: "Arena Planalto", notes: "" },
    { id: "e11", teamId: "t2", type: "game", stage: "done", owner: "Bruno Reis", title: "Araguaia x Serra Azul", date: iso(-4), time: "19:30", location: "Ginásio Central", notes: "Fotos enviadas." },
    { id: "e12", teamId: "t1", type: "activation", stage: "done", owner: "Ana Lima", title: "Ação com torcedores no intervalo", date: iso(-9), time: "16:45", location: "Estádio Municipal", notes: "" },
    { id: "e13", teamId: "t4", type: "other", stage: "production", owner: "Diego Alves", title: "Produção das camisetas do staff", date: iso(1), time: "", location: "Fornecedor", notes: "" }
  ];

  const deliverables = [
    { id: "d1", teamId: "t1", title: "Logo na frente da camisa (temporada)", due: iso(-10), done: true },
    { id: "d2", teamId: "t1", title: "2 posts patrocinados no Instagram / mês", due: iso(5), done: false },
    { id: "d3", teamId: "t2", title: "Backdrop de entrevistas com logo", due: iso(-3), done: false },
    { id: "d4", teamId: "t2", title: "Relatório de exposição de mídia (trimestral)", due: iso(25), done: false },
    { id: "d5", teamId: "t3", title: "Placas de quadra em jogos em casa", due: iso(8), done: false },
    { id: "d6", teamId: "t4", title: "Logo no peito do número de peito", due: iso(30), done: false },
    { id: "d7", teamId: "t4", title: "Menção no locutor da largada", due: iso(45), done: false },
    { id: "d8", teamId: "t3", title: "Envio de fotos oficiais dos jogos", due: iso(-1), done: true }
  ];

  return { teams, events, deliverables };
})();
