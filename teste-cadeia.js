const ENDPOINT = "https://pje.tjpa.jus.br/pje-mni-1g/ConsultaPJe";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
  if (!res.ok || xml.includes("<soap:Fault>")) {
    throw new Error(`${operacao}: HTTP ${res.status}\n${xml}`);
  }
  return xml;
}

// Extrai cada <return>...</return> como objeto com os campos simples de 1º nível
function parseReturns(xml) {
  const itens = [];
  for (const [, bloco] of xml.matchAll(/<return>([\s\S]*?)<\/return>/g)) {
    const obj = {};
    const semFilhos = bloco.replace(/<(\w+)>(?:(?!<\/\1>)[\s\S])*?<\w[\s\S]*?<\/\1>/g, "");
    for (const [, tag, valor] of semFilhos.matchAll(/<(\w+)>([^<]*)<\/\1>/g)) {
      obj[tag] = valor;
    }
    itens.push(obj);
  }
  return itens;
}

const jurisdicaoXml = (j) =>
  `<descricao>${esc(j.descricao)}</descricao><id>${j.id}</id>`;
const classeXml = (c) =>
  `<codigo>${esc(c.codigo)}</codigo><descricao>${esc(c.descricao)}</descricao>`;
const assuntoXml = (a) =>
  `<codigo>${esc(a.codigo)}</codigo><descricao>${esc(a.descricao)}</descricao>`;

async function main() {
  const jurisdicao = { id: 301, descricao: "Belém - Fórum Cível" };
  console.log("Jurisdição:", jurisdicao);

  const classes = parseReturns(
    await soap("consultarClassesJudiciais", `<arg0>${jurisdicaoXml(jurisdicao)}</arg0>`)
  );
  console.log(`\nClasses: ${classes.length}`);
  console.table(classes.slice(0, 10));

  const classe = classes.find((c) => /div[óo]rcio/i.test(c.descricao)) || classes[0];
  console.log("\nClasse escolhida:", classe);

  const assuntos = parseReturns(
    await soap(
      "consultarAssuntosJudiciais",
      `<arg0>${jurisdicaoXml(jurisdicao)}</arg0><arg1>${classeXml(classe)}</arg1>`
    )
  );
  console.log(`\nAssuntos: ${assuntos.length}`);
  console.table(assuntos.slice(0, 10));

  const assunto = assuntos[0];
  console.log("\nAssunto escolhido:", assunto);

  const competencias = parseReturns(
    await soap(
      "consultarCompetencias",
      `<arg0>${jurisdicaoXml(jurisdicao)}</arg0><arg1>${classeXml(classe)}</arg1><arg2>${assuntoXml(assunto)}</arg2>`
    )
  );
  console.log(`\nCompetências: ${competencias.length}`);
  console.table(competencias);
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
