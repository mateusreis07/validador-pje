// Servidor local (npm start). Na Vercel, quem atende é api/[rota].js.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { atender } = require("./lib/rotas");

const PORT = process.env.PORT || 3000;

http
  .createServer((req, res) => {
    if (req.url.startsWith("/api/")) return atender(req, res);

    if (req.url === "/" || req.url.startsWith("/?")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      fs.createReadStream(path.join(__dirname, "public", "index.html")).pipe(res);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ erro: "Não encontrado" }));
  })
  .listen(PORT, () => console.log(`Validador PJe/TJPA em http://localhost:${PORT}`));
