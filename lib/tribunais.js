// Tribunais com o serviço público ConsultaPJe (mesmo contrato MNI do CNJ).
// Para incluir outro, basta acrescentar uma linha com o endereço de chamada (soap:address do WSDL).
module.exports = [
  { id: "tjpa-1g", nome: "TJPA – 1º grau", endpoint: "https://pje.tjpa.jus.br/pje-mni-1g/ConsultaPJe" },
  { id: "tjpa-2g", nome: "TJPA – 2º grau", endpoint: "https://pje.tjpa.jus.br/pje-mni-2g/ConsultaPJe" },
  { id: "tjce-1g", nome: "TJCE – 1º grau", endpoint: "https://pjews.tjce.jus.br/pje1grau/ConsultaPJe" },
  { id: "tjce-2g", nome: "TJCE – 2º grau", endpoint: "https://pjews.tjce.jus.br/pje2grau/ConsultaPJe" },
];
