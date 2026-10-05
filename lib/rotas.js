// Rotas da API (/api/...)
const pje = require("./pje");

const rotas = {
  tribunais: () => pje.tribunais,
  jurisdicoes: (q) => cliente(q).jurisdicoes(),
  classes: (q) => cliente(q).classes(obrigatorio(q, "jurisdicao")),
  assuntos: (q) => cliente(q).assuntos(obrigatorio(q, "jurisdicao"), obrigatorio(q, "classe")),
  competencias: (q) =>
    cliente(q).competencias(
      obrigatorio(q, "jurisdicao"),
      obrigatorio(q, "classe"),
      obrigatorio(q, "assuntos").split(",").filter(Boolean)
    ),
};

// Tribunal escolhido (?tribunal=...); sem o parâmetro, usa o TJPA 1º grau
function cliente(q) {
  const id = q.get("tribunal") || "tjpa-1g";
  const c = pje.cliente(id);
  if (!c) throw Object.assign(new Error(`Tribunal desconhecido: ${id}`), { status: 400 });
  return c;
}

function obrigatorio(q, nome) {
  const v = q.get(nome);
  if (!v) throw Object.assign(new Error(`Parâmetro obrigatório: ${nome}`), { status: 400 });
  return v;
}

// Atende /api/<rota>?... e escreve a resposta JSON
async function atender(req, res) {
  const url = new URL(req.url, "http://localhost");
  const rota = rotas[url.pathname.replace(/^\/api\//, "")];
  let status = 200;
  let corpo;

  if (!rota) {
    status = 404;
    corpo = { erro: "Não encontrado" };
  } else {
    try {
      corpo = await rota(url.searchParams);
    } catch (e) {
      status = e.status || (e instanceof pje.PjeFault ? 422 : 502);
      corpo = { erro: e.message };
    }
  }

  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  // Permite cache no navegador/proxy e poupa chamadas ao TJ
  if (status === 200) {
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  }
  res.end(JSON.stringify(corpo));
}

module.exports = { atender };
