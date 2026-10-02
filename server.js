// Servidor HTTP local (npm start).
//   /           validador ao vivo (consulta o PJe a cada clique)
//   /admin      sincronização e publicação da base (somente nesta máquina)
//   /publico/   prévia do site publicado na Vercel (pasta public/)
const http = require("http");
const fs = require("fs");
const path = require("path");
const { atender } = require("./lib/rotas");
const admin = require("./lib/admin");

const PORT = process.env.PORT || 3000;
const DIR_PUBLICO = path.join(__dirname, "public");

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function enviarArquivo(res, arquivo) {
  fs.stat(arquivo, (erro, info) => {
    if (erro || !info.isFile()) return naoEncontrado(res);
    res.writeHead(200, {
      "Content-Type": TIPOS[path.extname(arquivo)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(arquivo).pipe(res);
  });
}

function naoEncontrado(res) {
  res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ erro: "Não encontrado" }));
}

http
  .createServer((req, res) => {
    const caminho = decodeURIComponent(req.url.split("?")[0]);

    if (caminho.startsWith("/api/admin/")) return admin.atender(req, res);
    if (caminho.startsWith("/api/")) return atender(req, res);

    // Verificação de saúde para monitoramento (não consulta o TJ)
    if (caminho === "/saude") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (caminho === "/") return enviarArquivo(res, path.join(__dirname, "local", "validador.html"));

    if (caminho === "/admin") {
      if (!admin.ehLocal(req)) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("A administração só pode ser usada na própria máquina.");
      }
      return enviarArquivo(res, path.join(__dirname, "local", "admin.html"));
    }

    if (caminho === "/publico") {
      res.writeHead(301, { Location: "/publico/" });
      return res.end();
    }
    if (caminho.startsWith("/publico/")) {
      const relativo = caminho.slice("/publico/".length) || "index.html";
      const arquivo = path.join(DIR_PUBLICO, relativo);
      if (!arquivo.startsWith(DIR_PUBLICO + path.sep)) return naoEncontrado(res);
      return enviarArquivo(res, arquivo);
    }

    naoEncontrado(res);
  })
  .listen(PORT, () => {
    console.log(`Validador ao vivo:  http://localhost:${PORT}`);
    console.log(`Administração:      http://localhost:${PORT}/admin`);
    console.log(`Prévia do site:     http://localhost:${PORT}/publico/`);
  });
