// Cliente SOAP mínimo para o ConsultaPJe do TJPA (somente consultas de leitura).
const ENDPOINT = "https://pje.tjpa.jus.br/pje-mni-1g/ConsultaPJe";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();

class PjeFault extends Error {}

async function soap(operacao, corpo = "") {
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://ws.pje.cnj.jus.br/">
  <soapenv:Header/>
  <soapenv:Body><ws:${operacao}>${corpo}</ws:${operacao}></soapenv:Body>
</soapenv:Envelope>`;
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
    body: envelope,
  });
  const xml = await res.text();
  const fault = xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/);
  if (fault) throw new PjeFault(`${operacao}: ${decode(fault[1])}`);
  if (!res.ok) throw new Error(`${operacao}: HTTP ${res.status}`);
  return xml;
}

// Converte o conteúdo de um elemento em objeto (suporta um nível de aninhamento por recursão)
function parseObj(s) {
  const obj = {};
  for (const [, tag, valor] of s.matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)) {
    obj[tag] = valor.includes("<") ? parseObj(valor) : decode(valor);
  }
  return obj;
}

const parseReturns = (xml) =>
  [...xml.matchAll(/<return>([\s\S]*?)<\/return>/g)].map(([, b]) => parseObj(b));

// Cache em memória: as tabelas mudam pouco e evita repetir chamadas ao TJ
const cache = new Map();
async function consultar(operacao, corpo = "") {
  const chave = operacao + corpo;
  if (!cache.has(chave)) {
    const p = soap(operacao, corpo).then(parseReturns);
    cache.set(chave, p);
    p.catch(() => cache.delete(chave));
  }
  return cache.get(chave);
}

const jur = (id) => `<arg0><id>${Number(id)}</id></arg0>`;
const cls = (codigo) => `<arg1><codigo>${esc(codigo)}</codigo></arg1>`;

module.exports = {
  PjeFault,
  jurisdicoes: () => consultar("consultarJurisdicoes"),
  classes: (idJurisdicao) => consultar("consultarClassesJudiciais", jur(idJurisdicao)),
  assuntos: (idJurisdicao, codClasse) =>
    consultar("consultarAssuntosJudiciais", jur(idJurisdicao) + cls(codClasse)),
  competencias: (idJurisdicao, codClasse, codAssuntos) =>
    consultar(
      "consultarCompetencias",
      jur(idJurisdicao) +
        cls(codClasse) +
        codAssuntos.map((a) => `<arg2><codigo>${esc(a)}</codigo></arg2>`).join("")
    ),
};
