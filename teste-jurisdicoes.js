const ENDPOINT =
  "https://pje.tjpa.jus.br/pje-mni-1g/ConsultaPJe";

const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
    xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:ws="http://ws.pje.cnj.jus.br/">
    <soapenv:Header/>
    <soapenv:Body>
        <ws:consultarJurisdicoes/>
    </soapenv:Body>
</soapenv:Envelope>`;

async function consultarJurisdicoes() {
  console.log("Enviando consulta ao PJe/TJPA...");
  console.log("Endpoint:", ENDPOINT);

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "",
        Accept: "text/xml",
      },
      body: soapEnvelope,
    });

    const xml = await response.text();

    console.log("\nHTTP STATUS:", response.status);
    console.log("HTTP OK:", response.ok);

    console.log("\n========== RESPOSTA SOAP ==========\n");
    console.log(xml);
    console.log("\n===================================\n");

    if (!response.ok) {
      console.error("A requisição HTTP retornou erro.");
      process.exitCode = 1;
      return;
    }

    if (xml.includes("Fault")) {
      console.error("O servidor retornou um SOAP Fault.");
      process.exitCode = 1;
      return;
    }

    if (xml.includes("consultarJurisdicoesResponse")) {
      console.log("✅ Consulta SOAP executada com sucesso.");
    } else {
      console.log(
        "⚠ O servidor respondeu, mas precisamos analisar o XML retornado."
      );
    }
  } catch (error) {
    console.error("\n❌ Erro na conexão:");
    console.error(error);
    process.exitCode = 1;
  }
}

consultarJurisdicoes();
