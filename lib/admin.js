// Administração da base: dispara a sincronização, guarda o resultado pendente e publica.
// Só atende requisições feitas da própria máquina (localhost).
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const sync = require("./sincronizar");

const ARQ_PENDENTE = path.join(sync.DIR_SYNC, "pendente.json");

const estado = {
  situacao: "parado", // parado | executando | concluido | erro
  modo: null,
  inicio: null,
  fim: null,
  progresso: null,
  erro: null,
  controle: null,
  pendente: null, // { base, mudancas }
};

// Resultado de uma sincronização anterior que ainda não foi publicada
if (fs.existsSync(ARQ_PENDENTE)) {
  try {
    estado.pendente = JSON.parse(fs.readFileSync(ARQ_PENDENTE, "utf8"));
    estado.situacao = "concluido";
  } catch { /* arquivo corrompido: ignora */ }
}

function ehLocal(req) {
  const ip = req.socket.remoteAddress || "";
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function iniciar(modo) {
  if (estado.situacao === "executando") throw Object.assign(new Error("Já existe uma sincronização em andamento"), { status: 409 });
  Object.assign(estado, {
    situacao: "executando", modo, inicio: Date.now(), fim: null, erro: null,
    progresso: null, controle: { cancelado: false }, pendente: null,
  });
  if (fs.existsSync(ARQ_PENDENTE)) fs.unlinkSync(ARQ_PENDENTE);

  sync
    .sincronizar({ modo, controle: estado.controle, progresso: (p) => (estado.progresso = p) })
    .then((resultado) => {
      estado.pendente = resultado;
      fs.writeFileSync(ARQ_PENDENTE, JSON.stringify(resultado));
      estado.situacao = "concluido";
    })
    .catch((e) => {
      estado.situacao = "erro";
      estado.erro = e instanceof sync.Cancelado ? "Sincronização cancelada. As competências já consultadas ficam guardadas por 24 h e serão reaproveitadas." : e.message;
    })
    .finally(() => (estado.fim = Date.now()));
}

function git(args) {
  return new Promise((resolve, reject) =>
    execFile("git", args, { cwd: sync.RAIZ }, (erro, stdout, stderr) =>
      erro ? reject(new Error((stderr || stdout || erro.message).trim())) : resolve(stdout.trim())
    )
  );
}

async function publicar() {
  if (!estado.pendente) throw Object.assign(new Error("Não há resultado para publicar"), { status: 409 });
  const { base, mudancas } = estado.pendente;
  sync.gravarBase(base);

  const r = mudancas.resumo;
  const titulo = r.inicial
    ? `Base PJe: carga inicial (${r.combinacoes} combinações)`
    : `Base PJe: ${r.mudancas} mudança(s)`;
  const detalhe = Object.entries(r.porTipo || {}).map(([t, n]) => `- ${t}: ${n}`).join("\n");

  await git(["add", "public/dados", "config/classes-mp.csv"]);
  const pendentes = await git(["status", "--porcelain", "--", "public/dados", "config/classes-mp.csv"]);
  let saida = "Nenhuma alteração nos arquivos da base; nada a publicar.";
  if (pendentes) {
    await git(["commit", "-m", `${titulo}\n\n${detalhe}`.trim()]);
    await git(["push"]);
    saida = `Publicado: ${titulo}`;
  }

  estado.pendente = null;
  estado.situacao = "parado";
  if (fs.existsSync(ARQ_PENDENTE)) fs.unlinkSync(ARQ_PENDENTE);
  sync.limparCache();
  return { mensagem: saida };
}

function descartar() {
  if (estado.situacao === "executando") throw Object.assign(new Error("Cancele a sincronização antes"), { status: 409 });
  estado.pendente = null;
  estado.situacao = "parado";
  if (fs.existsSync(ARQ_PENDENTE)) fs.unlinkSync(ARQ_PENDENTE);
  return { mensagem: "Resultado descartado" };
}

function status() {
  const atual = sync.carregarBase();
  const p = estado.pendente;
  return {
    situacao: estado.situacao,
    modo: estado.modo,
    inicio: estado.inicio,
    fim: estado.fim,
    progresso: estado.progresso,
    erro: estado.erro,
    basePublicada: atual ? { geradoEm: atual.meta.geradoEm, ...atual.meta.ultimaAtualizacao } : null,
    resultado: p && {
      geradoEm: p.base.meta.geradoEm,
      resumo: p.mudancas.resumo,
      erros: p.mudancas.erros.length,
      amostra: p.mudancas.linhas.slice(0, 500),
    },
  };
}

function json(res, status, corpo) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(corpo));
}

async function atender(req, res) {
  if (!ehLocal(req)) return json(res, 403, { erro: "A administração só pode ser usada na própria máquina" });
  const rota = req.url.split("?")[0].replace(/^\/api\/admin\//, "");
  const post = req.method === "POST";
  try {
    if (rota === "status") return json(res, 200, status());
    if (post && rota === "verificar") { iniciar("rapido"); return json(res, 202, status()); }
    if (post && rota === "carga-completa") { iniciar("completo"); return json(res, 202, status()); }
    if (post && rota === "cancelar") { if (estado.controle) estado.controle.cancelado = true; return json(res, 200, status()); }
    if (post && rota === "descartar") return json(res, 200, descartar());
    if (post && rota === "publicar") return json(res, 200, await publicar());
    if (rota === "mudancas.csv") {
      if (!estado.pendente) return json(res, 404, { erro: "Não há resultado" });
      const data = new Date(estado.pendente.base.meta.geradoEm).toISOString().slice(0, 10);
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="mudancas-pje-${data}.csv"`,
      });
      return res.end(sync.mudancasCsv(estado.pendente.mudancas));
    }
    json(res, 404, { erro: "Não encontrado" });
  } catch (e) {
    json(res, e.status || 500, { erro: e.message });
  }
}

module.exports = { atender, ehLocal };
