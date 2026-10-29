/**
 * POST /api/extract-contract
 *
 * Função serverless (Vercel / Netlify-compatível) que recebe um contrato de
 * patrocínio (texto ou PDF) e usa o Claude para extrair, em JSON estruturado:
 * dados do time, vigência, entregáveis (contrapartidas) e ativações.
 *
 * A chave da API fica SOMENTE aqui no servidor (variável ANTHROPIC_API_KEY).
 * O navegador nunca vê a chave.
 *
 * Corpo da requisição:
 *   { text?: string, pdfBase64?: string, today: "AAAA-MM-DD", teams?: string[] }
 */

const API_URL = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com") + "/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const MAX_TEXT_CHARS = 120_000;
const MAX_PDF_BYTES = 3 * 1024 * 1024; // 3 MB (o limite de corpo da Vercel é 4,5 MB e o base64 aumenta ~33%)

/* ---------- Prompt ---------- */
const SYSTEM_PROMPT = `Você é um assistente do time de marketing esportivo de uma marca patrocinadora.
Sua tarefa é ler um contrato de patrocínio esportivo e extrair as informações operacionais
que o time precisa acompanhar no dia a dia. Responda SEMPRE chamando a ferramenta "registrar_contrato".

Regras:
- Extraia apenas o que está escrito no contrato. Nunca invente datas, valores ou entregáveis.
- Datas no formato AAAA-MM-DD. Converta datas relativas usando as datas do próprio contrato
  (ex.: "60 dias antes do término" → calcule a partir da data de término). Se não for possível
  determinar a data, use null e explique em "avisos".
- "entregaveis" são contrapartidas que o patrocinado deve entregar à marca (exposição de logo,
  posts, relatórios, fotos, menções, notificações de renovação etc.).
- "ativacoes" são ações presenciais/eventos em que a marca participa (sampling, estande,
  meet & greet, clínicas, ações com torcedores). Jogos do calendário regular não são ativações,
  a menos que o contrato descreva uma ação específica da marca naquele jogo.
- Para entregáveis recorrentes, NÃO liste cada ocorrência: informe uma vez com "recorrencia"
  (semanal, mensal, trimestral, por_jogo) e o app gera as ocorrências.
- Em "trecho", copie a frase curta do contrato que justifica o item (rastreabilidade).
- Títulos curtos e acionáveis, em português (máx. ~70 caracteres).
- Ignore valores financeiros e dados pessoais; eles não devem aparecer na resposta.`;

const TOOL = {
  name: "registrar_contrato",
  description: "Registra as informações operacionais extraídas de um contrato de patrocínio esportivo.",
  input_schema: {
    type: "object",
    properties: {
      time: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome do time, atleta ou evento patrocinado" },
          modalidade: { type: "string", description: "Ex.: Futebol, Vôlei, Futsal, Corrida de rua" },
          contato: { type: ["string", "null"], description: "E-mail de contato operacional, se houver" },
        },
        required: ["nome", "modalidade"],
      },
      vigencia: {
        type: "object",
        properties: {
          inicio: { type: ["string", "null"], description: "AAAA-MM-DD" },
          fim: { type: ["string", "null"], description: "AAAA-MM-DD" },
        },
        required: ["inicio", "fim"],
      },
      resumo: { type: "string", description: "Resumo do contrato em 1 ou 2 frases" },
      entregaveis: {
        type: "array",
        items: {
          type: "object",
          properties: {
            titulo: { type: "string" },
            prazo: { type: ["string", "null"], description: "AAAA-MM-DD; para recorrentes, a primeira ocorrência se o contrato disser, senão null" },
            recorrencia: { type: "string", enum: ["nenhuma", "semanal", "mensal", "trimestral", "por_jogo"] },
            trecho: { type: "string" },
          },
          required: ["titulo", "prazo", "recorrencia", "trecho"],
        },
      },
      ativacoes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            titulo: { type: "string" },
            data: { type: ["string", "null"], description: "AAAA-MM-DD ou null se 'a definir'" },
            horario: { type: ["string", "null"], description: "HH:MM" },
            local: { type: ["string", "null"] },
            observacoes: { type: ["string", "null"], description: "O que o contrato exige para a ação (estrutura, quantidade, etc.)" },
            trecho: { type: "string" },
          },
          required: ["titulo", "data", "trecho"],
        },
      },
      avisos: {
        type: "array",
        items: { type: "string" },
        description: "Pontos de atenção: datas indefinidas, cláusulas ambíguas, prazos curtos",
      },
    },
    required: ["time", "vigencia", "resumo", "entregaveis", "ativacoes", "avisos"],
  },
};

/* ---------- Handler ---------- */
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST." });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return send(res, 503, { error: "API de IA não configurada no servidor (ANTHROPIC_API_KEY).", code: "NO_KEY" });

  let body = req.body;
  try {
    if (typeof body === "string") body = JSON.parse(body);
  } catch {
    return send(res, 400, { error: "JSON inválido." });
  }
  const { text, pdfBase64, today, teams } = body || {};

  if (!text && !pdfBase64) return send(res, 400, { error: "Envie o texto do contrato ou um PDF." });
  if (text && text.length > MAX_TEXT_CHARS) return send(res, 413, { error: "Contrato muito longo." });
  if (pdfBase64 && Buffer.byteLength(pdfBase64, "base64") > MAX_PDF_BYTES) return send(res, 413, { error: "PDF maior que 3 MB." });

  const todayStr = /^\d{4}-\d{2}-\d{2}$/.test(today || "") ? today : new Date().toISOString().slice(0, 10);
  const knownTeams = Array.isArray(teams) ? teams.slice(0, 50).map(String) : [];

  const content = [];
  if (pdfBase64) {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } });
  }
  content.push({
    type: "text",
    text: [
      `Data de hoje: ${todayStr}.`,
      knownTeams.length ? `Times já cadastrados no app (use o mesmo nome se for um deles): ${knownTeams.join(", ")}.` : "",
      text ? `Contrato:\n"""\n${text}\n"""` : "O contrato está no PDF anexo.",
      "Extraia as informações chamando a ferramenta registrar_contrato.",
    ].filter(Boolean).join("\n\n"),
  });

  try {
    const r = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name }, // força saída estruturada
        messages: [{ role: "user", content }],
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      console.error("Anthropic API error", r.status, data?.error);
      return send(res, 502, { error: "Falha ao consultar a IA. Tente novamente." });
    }

    const toolUse = (data.content || []).find((c) => c.type === "tool_use");
    if (!toolUse) return send(res, 502, { error: "A IA não retornou dados estruturados." });

    return send(res, 200, { result: sanitize(toolUse.input), model: data.model, usage: data.usage });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: "Erro interno ao processar o contrato." });
  }
};

/* ---------- Validação da saída da IA ---------- */
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const str = (s, max = 200) => (typeof s === "string" ? s.trim().slice(0, max) : "");
const RECUR = ["nenhuma", "semanal", "mensal", "trimestral", "por_jogo"];

function sanitize(r = {}) {
  return {
    time: {
      nome: str(r.time?.nome, 80) || "Time sem nome",
      modalidade: str(r.time?.modalidade, 40),
      contato: str(r.time?.contato, 120) || null,
    },
    vigencia: {
      inicio: isDate(r.vigencia?.inicio) ? r.vigencia.inicio : null,
      fim: isDate(r.vigencia?.fim) ? r.vigencia.fim : null,
    },
    resumo: str(r.resumo, 400),
    entregaveis: (Array.isArray(r.entregaveis) ? r.entregaveis : []).slice(0, 40).map((d) => ({
      titulo: str(d.titulo, 120),
      prazo: isDate(d.prazo) ? d.prazo : null,
      recorrencia: RECUR.includes(d.recorrencia) ? d.recorrencia : "nenhuma",
      trecho: str(d.trecho, 300),
    })).filter((d) => d.titulo),
    ativacoes: (Array.isArray(r.ativacoes) ? r.ativacoes : []).slice(0, 40).map((a) => ({
      titulo: str(a.titulo, 120),
      data: isDate(a.data) ? a.data : null,
      horario: /^\d{2}:\d{2}$/.test(a.horario || "") ? a.horario : "",
      local: str(a.local, 120),
      observacoes: str(a.observacoes, 300),
      trecho: str(a.trecho, 300),
    })).filter((a) => a.titulo),
    avisos: (Array.isArray(r.avisos) ? r.avisos : []).slice(0, 15).map((w) => str(w, 300)).filter(Boolean),
  };
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

module.exports.sanitize = sanitize;
module.exports.TOOL = TOOL;
