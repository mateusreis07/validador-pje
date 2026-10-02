// Rotas da API, compartilhadas entre o servidor local (server.js) e a Vercel (api/[rota].js)
const pje = require("./pje");

const rotas = {
  jurisdicoes: () => pje.jurisdicoes(),
  classes: (q) => pje.classes(obrigatorio(q, "jurisdicao")),
  assuntos: (q) => pje.assuntos(obrigatorio(q, "jurisdicao"), obrigatorio(q, "classe")),
  competencias: (q) =>
    pje.competencias(
      obrigatorio(q, "jurisdicao"),
      obrigatorio(q, "classe"),
      obrigatorio(q, "assuntos").split(",").filter(Boolean)
    ),
};

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
  // Na Vercel, respostas OK ficam em cache na CDN e poupam chamadas ao TJ
  if (status === 200) {
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  }
  res.end(JSON.stringify(corpo));
}

module.exports = { atender };
