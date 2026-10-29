/**
 * Contrato de exemplo 100% fictício + resultado pré-calculado para o "modo demo".
 * O modo demo permite ver a funcionalidade de IA funcionando no GitHub Pages,
 * onde não existe backend nem chave de API.
 * As datas são geradas em relação a hoje, como em data.js.
 */
window.SAMPLE_CONTRACT = (function () {
  const day = 24 * 60 * 60 * 1000;
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (offset) => {
    const d = new Date(Date.now() + offset * day);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const br = (isoStr) => isoStr.split("-").reverse().join("/");

  const inicio = iso(-15);
  const fim = iso(350);
  const fotos = iso(30);
  const sampling = iso(52);
  const clinica = iso(100);
  const renovacao = iso(290); // 60 dias antes do fim

  const text = `CONTRATO DE PATROCÍNIO ESPORTIVO

PATROCINADORA: Marca Exemplo Alimentos Ltda. ("MARCA")
PATROCINADO: Associação Ipê Futsal ("CLUBE"), equipe de futsal adulto.
Contato operacional do CLUBE: marketing@ipefutsal.exemplo

CLÁUSULA 1 — VIGÊNCIA
1.1. Este contrato vigora de ${br(inicio)} a ${br(fim)}.

CLÁUSULA 2 — EXPOSIÇÃO DE MARCA
2.1. O CLUBE aplicará a logomarca da MARCA na manga direita do uniforme de jogo, em todas as partidas oficiais da temporada.
2.2. O CLUBE posicionará 2 (duas) placas de quadra com a marca da MARCA em todos os jogos disputados em casa.

CLÁUSULA 3 — MÍDIAS DIGITAIS
3.1. O CLUBE publicará 2 (dois) posts patrocinados por mês em seu perfil oficial no Instagram, com aprovação prévia da MARCA.
3.2. O CLUBE enviará à MARCA, a cada trimestre, relatório de exposição de mídia com alcance e impressões das publicações.

CLÁUSULA 4 — CONTEÚDO
4.1. Até ${br(fotos)}, o CLUBE entregará o kit de fotos oficiais do elenco vestindo o uniforme com a marca da MARCA.

CLÁUSULA 5 — ATIVAÇÕES
5.1. O CLUBE cederá espaço para ação de sampling de produtos da MARCA no jogo em casa de ${br(sampling)}, às 19h, no Ginásio Ipê, incluindo área de 3x3 m próxima à entrada principal e ponto de energia.
5.2. O CLUBE realizará, em ${br(clinica)}, às 9h, clínica de futsal gratuita para 60 crianças, com participação de 3 atletas do elenco principal e aplicação da marca da MARCA nos materiais.
5.3. O CLUBE promoverá um meet & greet entre atletas e consumidores convidados pela MARCA, em data a ser definida de comum acordo entre as partes.

CLÁUSULA 6 — VALORES
6.1. Pelo patrocínio, a MARCA pagará ao CLUBE o valor de R$ 000.000,00 (valor fictício), em parcelas mensais.

CLÁUSULA 7 — RENOVAÇÃO
7.1. O CLUBE deverá manifestar interesse na renovação por escrito com antecedência mínima de 60 (sessenta) dias do término da vigência.

Goiânia, ${br(inicio)}.`;

  // Resultado no mesmo formato que a API devolve (/api/extract-contract)
  const result = {
    time: { nome: "Ipê Futsal", modalidade: "Futsal", contato: "marketing@ipefutsal.exemplo" },
    vigencia: { inicio, fim },
    resumo: "Patrocínio do Ipê Futsal com exposição no uniforme e em quadra, posts mensais, relatórios trimestrais e três ativações presenciais.",
    entregaveis: [
      { titulo: "Logo na manga direita do uniforme de jogo", prazo: null, recorrencia: "por_jogo", trecho: "aplicará a logomarca da MARCA na manga direita do uniforme de jogo, em todas as partidas oficiais" },
      { titulo: "2 placas de quadra em jogos em casa", prazo: null, recorrencia: "por_jogo", trecho: "2 (duas) placas de quadra com a marca da MARCA em todos os jogos disputados em casa" },
      { titulo: "2 posts patrocinados no Instagram", prazo: null, recorrencia: "mensal", trecho: "publicará 2 (dois) posts patrocinados por mês em seu perfil oficial no Instagram" },
      { titulo: "Relatório de exposição de mídia", prazo: null, recorrencia: "trimestral", trecho: "a cada trimestre, relatório de exposição de mídia com alcance e impressões" },
      { titulo: "Kit de fotos oficiais do elenco com uniforme", prazo: fotos, recorrencia: "nenhuma", trecho: `Até ${br(fotos)}, o CLUBE entregará o kit de fotos oficiais do elenco` },
      { titulo: "Manifestação de interesse na renovação", prazo: renovacao, recorrencia: "nenhuma", trecho: "antecedência mínima de 60 (sessenta) dias do término da vigência" },
    ],
    ativacoes: [
      { titulo: "Sampling de produtos no jogo em casa", data: sampling, horario: "19:00", local: "Ginásio Ipê", observacoes: "Área de 3x3 m próxima à entrada principal + ponto de energia.", trecho: `ação de sampling de produtos da MARCA no jogo em casa de ${br(sampling)}, às 19h` },
      { titulo: "Clínica de futsal para 60 crianças", data: clinica, horario: "09:00", local: "", observacoes: "3 atletas do elenco principal; marca aplicada nos materiais.", trecho: `em ${br(clinica)}, às 9h, clínica de futsal gratuita para 60 crianças` },
      { titulo: "Meet & greet com atletas", data: null, horario: "", local: "", observacoes: "Consumidores convidados pela marca.", trecho: "em data a ser definida de comum acordo entre as partes" },
    ],
    avisos: [
      "Meet & greet sem data definida: combine a data com o clube com pelo menos 45 dias de antecedência.",
      "Entregáveis 'por jogo' dependem do calendário de partidas, que não consta no contrato.",
    ],
  };

  return { text, result };
})();
