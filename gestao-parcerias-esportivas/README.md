# ⚽ Gestão de Parcerias Esportivas

Aplicação web para centralizar a gestão de patrocínios esportivos de uma marca: calendário de jogos, ativações, entregáveis de contrato e documentos de cada time patrocinado — tudo em um só lugar, editável por todo o time.

Inclui um **agente de IA (Claude) que lê o contrato de patrocínio** e transforma as cláusulas em entregáveis e ativações dentro do app, e um **banco PostgreSQL no Supabase** para o time inteiro editar os mesmos dados em tempo real.

> Projeto de portfólio. Todos os times, contatos e dados são **fictícios**.

## O problema

Em times de marketing que cuidam de vários patrocínios ao mesmo tempo, as informações costumam ficar espalhadas entre planilhas, e-mails e pastas. Isso dificulta saber o que vem pela frente, quais contrapartidas do contrato já foram entregues e se há tempo suficiente para planejar cada ativação.

## Funcionalidades

- **✨ Importar contrato com IA**: cole o texto ou envie o PDF do contrato e o Claude extrai vigência, contrapartidas (entregáveis) e ativações
  - Saída estruturada em JSON via *tool use* com esquema definido, validada no servidor antes de chegar ao app
  - Entregáveis recorrentes (*mensal*, *trimestral*, *todo jogo*) viram ocorrências com prazo dentro da vigência
  - Datas relativas são calculadas (ex.: "60 dias antes do término")
  - **Rastreabilidade**: cada item mostra o trecho do contrato que o originou
  - **Revisão humana**: prévia editável, itens sem data ficam desmarcados e a ativação com menos de 45 dias é sinalizada
  - Valores financeiros e dados pessoais são ignorados pelo prompt

- **Quadro estilo kanban (inspirado no Pipefy)**: cada evento é um card que anda pelas fases *A planejar → Em planejamento → Em produção → Pronto p/ executar → Realizado*
  - Cards **arrastáveis** com mouse ou toque (no celular, segure e arraste)
  - Etiquetas de urgência (*Hoje*, *Amanhã*, *Em N dias*, *Passou há N dias*) e borda colorida por proximidade
  - Filtros rápidos clicáveis: hoje, próximos 7 e 30 dias, ativações que precisam de planejamento e eventos com data vencida
  - Busca por texto, filtro por time e responsável em cada card
- **Visão geral** com indicadores (eventos dos próximos 30 dias, entregáveis pendentes e atrasados)
- **Alertas de planejamento**: ativações com menos de 45 dias de antecedência que ainda estão em planejamento são sinalizadas automaticamente
- **Calendário mensal** com jogos, ativações e outros eventos, filtrável por time
- **Entregáveis de contrato** com checklist, prazo e status (pendente, vencendo, atrasado, concluído)
- **Página por time** com modalidade, contato, fim de contrato (aviso de renovação), progresso dos entregáveis e links para documentos e fotos
- **Banco compartilhado (Supabase/PostgreSQL)** com login, edição em tempo real e auditoria de quem alterou cada registro
  - Sem login, o app funciona em modo local (dados no navegador)
- Criar, editar e excluir eventos, entregáveis e times
- **Exportar / importar** os dados em JSON
- Tema claro/escuro automático e layout responsivo (funciona no celular)

## Tecnologias

- HTML, CSS e JavaScript puro — sem frameworks e sem build
- **Supabase**: PostgreSQL, Auth, Row Level Security e Realtime
- `localStorage` para o modo local
- **Claude API** (Messages API com *tool use* e leitura nativa de PDF)
- Função serverless em Node.js (`api/extract-contract.js`), compatível com Vercel
- Testes com `node:test` e API simulada (`npm test`)

## Como rodar

Basta abrir o `index.html` no navegador.

Ou, com um servidor local:

```bash
npx serve .
# ou
python -m http.server 8000
```

Sem backend, a aba **Contrato com IA** funciona em **modo demo** com o contrato fictício de exemplo (resultado pré-calculado).

### Conectar ao banco (Supabase)

1. No Supabase, abra **SQL Editor → New query**, cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**
2. (Opcional) Rode também [`supabase/seed.sql`](supabase/seed.sql) para carregar os dados de exemplo
3. Em **Authentication → Users → Add user**, crie o login de cada pessoa do time (marque *Auto Confirm User*)
4. Em **Authentication → Sign In / Providers**, desative *Allow new users to sign up* para que só o time tenha acesso
5. Em **Project Settings → API Keys**, copie a chave **anon / publishable** e cole em [`config.js`](config.js)

A chave *anon/publishable* é pública por design; quem protege os dados é o RLS. **Nunca** use a chave *service_role/secret* no front-end.

### Rodar com IA

A chave da API fica **somente no servidor**; o navegador nunca tem acesso a ela.

```bash
cp .env.example .env      # coloque sua ANTHROPIC_API_KEY
npm run dev               # http://localhost:3000 (sem dependências)
npm test                  # testes do backend com API simulada
```

### Publicar com IA na Vercel

1. Importe o repositório na Vercel (sem configuração de build)
2. Em **Settings → Environment Variables**, crie `ANTHROPIC_API_KEY` (opcional: `ANTHROPIC_MODEL`)
3. A rota `/api/extract-contract` é publicada automaticamente

> Em produção, vale adicionar autenticação e limite de requisições na rota da IA para evitar uso indevido da chave.

### Publicar no GitHub Pages (modo demo)

1. Suba os arquivos para um repositório
2. Em **Settings → Pages**, escolha a branch `main` e a pasta `/ (root)`
3. O app ficará disponível em `https://<seu-usuario>.github.io/<nome-do-repo>/`

## Estrutura

```
├── index.html   # estrutura das telas
├── style.css    # estilos (tema claro/escuro, responsivo)
├── data.js      # dados de exemplo fictícios
├── board.js     # quadro kanban: fases, urgência, filtros e arrastar-e-soltar
├── app.js       # lógica: estado, calendário, entregáveis, times, formulários
├── ai.js        # importação de contrato com IA: envio, prévia editável, recorrências
├── sync.js      # login, carga e sincronização com o Supabase (diff por linha + tempo real)
├── config.js    # URL e chave pública do Supabase
├── sample-contract.js       # contrato fictício + resultado do modo demo
├── supabase/schema.sql      # tabelas, índices, RLS, triggers de auditoria e views
├── supabase/seed.sql        # dados de exemplo com datas relativas a hoje
├── api/extract-contract.js  # backend: prompt, esquema da ferramenta, validação
├── dev-server.js            # servidor local (app + API), sem dependências
└── tests/                   # testes do backend
```

## Banco de dados

```
teams 1───n events          (jogos, ativações e outros; fase do quadro)
  └───────n deliverables    (entregáveis do contrato)
```

- **Integridade**: chaves estrangeiras com `on delete cascade` e `check` nos tipos e fases
- **Segurança**: Row Level Security; só usuários autenticados leem e editam
- **Auditoria**: triggers preenchem `updated_at` e `updated_by` (quem alterou)
- **Sincronização**: o app envia ao banco só as linhas que mudaram e recebe alterações do time via Realtime

Views prontas para relatórios (podem ser consultadas no SQL Editor ou por automações):

| View | O que mostra |
|---|---|
| `v_deliverables_status` | Cada entregável com status calculado: atrasado, vencendo, pendente, concluído |
| `v_planning_alerts` | Ativações que ainda não saíram do planejamento e estão a menos de 45 dias |
| `v_team_summary` | Por time: % de entregáveis concluídos, atrasados, próximo evento e dias até o fim do contrato |

```sql
-- Exemplo: times com entregáveis atrasados
select name, deliverables_late, pct_done
from v_team_summary
where deliverables_late > 0
order by deliverables_late desc;
```

## Como funciona a extração

```
Contrato (texto/PDF) → /api/extract-contract → Claude (tool_choice forçado)
     → JSON validado e limpo no servidor → prévia editável → time + entregáveis + ativações
```

O prompt e o esquema da ferramenta `registrar_contrato` ficam em `api/extract-contract.js`.

## Configuração

A antecedência mínima para ativações fica em `app.js`:

```js
const CONFIG = {
  planningLeadDays: 45,
};
```

As fases do quadro (nome e cor) ficam em `board.js`, na constante `STAGES`.

## Próximos passos

- Histórico completo de alterações (tabela de log)
- Upload de fotos e documentos direto no app
- Notificações por e-mail para prazos próximos
- Automação com n8n: contrato novo numa pasta do Drive dispara a extração automaticamente
- Assistente em linguagem natural ("quais ativações temos em novembro?")

## Licença

MIT
