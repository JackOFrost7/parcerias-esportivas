/**
 * Testes do backend com uma API do Claude simulada (não gasta créditos).
 *   npm test
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");

let upstream, lastRequest, nextReply;

before(async () => {
  upstream = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      lastRequest = { headers: req.headers, body: JSON.parse(body) };
      res.writeHead(nextReply.status, { "content-type": "application/json" });
      res.end(JSON.stringify(nextReply.body));
    });
  });
  await new Promise((r) => upstream.listen(0, r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${upstream.address().port}`;
  process.env.ANTHROPIC_API_KEY = "test-key";
});
after(() => upstream.close());

const handler = () => require("../api/extract-contract");

function call(method, body) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 0, headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      end(data) { resolve({ status: this.statusCode, json: JSON.parse(data) }); },
    };
    handler()({ method, body }, res);
  });
}

const toolReply = (input) => ({
  status: 200,
  body: { model: "claude-test", usage: {}, content: [{ type: "tool_use", name: "registrar_contrato", input }] },
});

test("recusa métodos diferentes de POST", async () => {
  const r = await call("GET");
  assert.equal(r.status, 405);
});

test("exige texto ou PDF", async () => {
  const r = await call("POST", { today: "2026-10-28" });
  assert.equal(r.status, 400);
});

test("sem chave configurada responde NO_KEY (front-end cai no modo demo)", async () => {
  const key = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const r = await call("POST", { text: "contrato" });
  process.env.ANTHROPIC_API_KEY = key;
  assert.equal(r.status, 503);
  assert.equal(r.json.code, "NO_KEY");
});

test("força a ferramenta e envia a chave só no servidor", async () => {
  nextReply = toolReply({ time: { nome: "X", modalidade: "Vôlei" }, vigencia: { inicio: null, fim: null }, resumo: "", entregaveis: [], ativacoes: [], avisos: [] });
  await call("POST", { text: "Contrato teste", today: "2026-10-28", teams: ["Cerrado FC"] });
  assert.equal(lastRequest.headers["x-api-key"], "test-key");
  assert.deepEqual(lastRequest.body.tool_choice, { type: "tool", name: "registrar_contrato" });
  const prompt = lastRequest.body.messages[0].content.at(-1).text;
  assert.match(prompt, /2026-10-28/);
  assert.match(prompt, /Cerrado FC/);
});

test("envia PDF como bloco de documento", async () => {
  nextReply = toolReply({ time: { nome: "X", modalidade: "" }, vigencia: {}, resumo: "", entregaveis: [], ativacoes: [], avisos: [] });
  await call("POST", { pdfBase64: Buffer.from("%PDF-1.4").toString("base64") });
  const doc = lastRequest.body.messages[0].content[0];
  assert.equal(doc.type, "document");
  assert.equal(doc.source.media_type, "application/pdf");
});

test("valida e limpa a saída da IA", async () => {
  nextReply = toolReply({
    time: { nome: "  Ipê Futsal ", modalidade: "Futsal", contato: "" },
    vigencia: { inicio: "2026-10-13", fim: "31/12/2027" },
    resumo: "ok",
    entregaveis: [
      { titulo: "Posts", prazo: null, recorrencia: "quinzenal", trecho: "t" },
      { titulo: "Fotos", prazo: "2026-11-27", recorrencia: "nenhuma", trecho: "t" },
      { titulo: "", prazo: null, recorrencia: "nenhuma", trecho: "" },
    ],
    ativacoes: [{ titulo: "Sampling", data: "amanhã", horario: "7pm", trecho: "t" }],
    avisos: ["a"],
  });
  const { status, json } = await call("POST", { text: "c" });
  assert.equal(status, 200);
  const r = json.result;
  assert.equal(r.time.nome, "Ipê Futsal");
  assert.equal(r.time.contato, null);
  assert.equal(r.vigencia.fim, null, "data fora do formato vira null");
  assert.equal(r.entregaveis.length, 2, "itens sem título são descartados");
  assert.equal(r.entregaveis[0].recorrencia, "nenhuma", "recorrência desconhecida vira 'nenhuma'");
  assert.equal(r.ativacoes[0].data, null);
  assert.equal(r.ativacoes[0].horario, "");
});

test("erro da API vira 502 sem vazar detalhes", async () => {
  nextReply = { status: 401, body: { error: { type: "authentication_error", message: "invalid x-api-key" } } };
  const r = await call("POST", { text: "c" });
  assert.equal(r.status, 502);
  assert.doesNotMatch(JSON.stringify(r.json), /x-api-key/);
});
