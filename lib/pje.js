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
    signal: AbortSignal.timeout(60000),
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

const jur = (id) => `<arg0><id>${Number(id)}</id></arg0>`;
const cls = (codigo) => `<arg1><codigo>${esc(codigo)}</codigo></arg1>`;

// Cria um cliente; com cacheMs > 0 guarda as respostas em memória por esse tempo
function criarCliente(cacheMs) {
  const cache = new Map();

  function consultar(operacao, corpo = "") {
    if (!cacheMs) return soap(operacao, corpo).then(parseReturns);
    const chave = operacao + corpo;
    const item = cache.get(chave);
    if (item && Date.now() - item.em < cacheMs) return item.promessa;
    const promessa = soap(operacao, corpo).then(parseReturns);
    cache.set(chave, { promessa, em: Date.now() });
    promessa.catch(() => cache.delete(chave));
    return promessa;
  }

  return {
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
}

module.exports = {
  PjeFault,
  // Cache de 1 hora para não repetir chamadas ao TJ
  ...criarCliente(60 * 60 * 1000),
};
