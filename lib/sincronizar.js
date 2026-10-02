// Sincronizador: consulta o PJe, monta a base de vínculos e compara com a base publicada.
//
// Base (public/dados):
//   meta.json      → data, jurisdições e dicionários de classes, assuntos e competências
//   j/<id>.json    → { codClasse: { codAssunto: [idsCompetencia] | null } }
//                    [] = o PJe lista o assunto, mas não retorna competência
//                    null = não foi possível consultar
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { semCache: pje, PjeFault } = require("./pje");

const RAIZ = path.join(__dirname, "..");
const DIR_DADOS = path.join(RAIZ, "public", "dados");
const DIR_SYNC = path.join(RAIZ, ".sync");
const ARQ_CLASSES = path.join(RAIZ, "config", "classes-mp.csv");
const ARQ_CACHE = path.join(DIR_SYNC, "competencias.jsonl");

// Respostas de competência já obtidas valem por 7 dias: permite retomar uma carga interrompida
const VALIDADE_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
// Na verificação rápida, cada execução revalida 1/FATIAS das competências já conhecidas
const FATIAS = 7;

class Cancelado extends Error {}

// ---------- Leitura de configuração e da base ----------

function lerCsv(texto) {
  const linhas = [];
  for (const linha of texto.replace(/^﻿/, "").split(/\r?\n/)) {
    if (!linha.trim()) continue;
    const campos = [];
    let atual = "";
    let aspas = false;
    for (let i = 0; i < linha.length; i++) {
      const ch = linha[i];
      if (aspas) {
        if (ch === '"' && linha[i + 1] === '"') { atual += '"'; i++; }
        else if (ch === '"') aspas = false;
        else atual += ch;
      } else if (ch === '"') aspas = true;
      else if (ch === ";" || ch === ",") { campos.push(atual); atual = ""; }
      else atual += ch;
    }
    campos.push(atual);
    linhas.push(campos.map((c) => c.trim()));
  }
  return linhas;
}

function classesSelecionadas() {
  const [cabecalho, ...linhas] = lerCsv(fs.readFileSync(ARQ_CLASSES, "utf8"));
  const iCodigo = cabecalho.indexOf("codigo");
  const iUsar = cabecalho.indexOf("usar_mp");
  if (iCodigo < 0 || iUsar < 0) {
    throw new Error("config/classes-mp.csv precisa das colunas 'codigo' e 'usar_mp'");
  }
  return new Set(linhas.filter((l) => /^s/i.test(l[iUsar] || "")).map((l) => l[iCodigo]));
}

function carregarBase() {
  const arqMeta = path.join(DIR_DADOS, "meta.json");
  if (!fs.existsSync(arqMeta)) return null;
  const meta = JSON.parse(fs.readFileSync(arqMeta, "utf8"));
  const j = {};
  for (const { id } of meta.jurisdicoes) {
    const arq = path.join(DIR_DADOS, "j", `${id}.json`);
    if (!j[id] && fs.existsSync(arq)) j[id] = JSON.parse(fs.readFileSync(arq, "utf8"));
  }
  return { meta, j };
}

function gravarBase(base) {
  const dirJ = path.join(DIR_DADOS, "j");
  fs.mkdirSync(dirJ, { recursive: true });
  for (const arq of fs.readdirSync(dirJ)) {
    if (!(arq.replace(/\.json$/, "") in base.j)) fs.unlinkSync(path.join(dirJ, arq));
  }
  for (const [id, dados] of Object.entries(base.j)) {
    fs.writeFileSync(path.join(dirJ, `${id}.json`), JSON.stringify(dados));
  }
  fs.writeFileSync(path.join(DIR_DADOS, "meta.json"), JSON.stringify(base.meta));
}

// ---------- Cache de competências (retomada) ----------

function carregarCache() {
  const cache = new Map();
  if (!fs.existsSync(ARQ_CACHE)) return cache;
  const limite = Date.now() - VALIDADE_CACHE_MS;
  for (const linha of fs.readFileSync(ARQ_CACHE, "utf8").split("\n")) {
    if (!linha) continue;
    try {
      const r = JSON.parse(linha);
      if (r.t > limite) cache.set(r.k, r);
    } catch { /* linha incompleta de uma execução interrompida */ }
  }
  return cache;
}

function limparCache() {
  if (fs.existsSync(ARQ_CACHE)) fs.unlinkSync(ARQ_CACHE);
}

// ---------- Execução ----------

async function tentar(fn, controle) {
  for (let tentativa = 1; ; tentativa++) {
    if (controle.cancelado) throw new Cancelado("Cancelado");
    try {
      return await fn();
    } catch (e) {
      if (e instanceof PjeFault || tentativa >= 3) throw e;
      await new Promise((r) => setTimeout(r, tentativa * 3000));
    }
  }
}

async function emParalelo(itens, concorrencia, controle, fn) {
  let proximo = 0;
  await Promise.all(
    Array.from({ length: Math.min(concorrencia, itens.length) }, async () => {
      while (proximo < itens.length) {
        if (controle.cancelado) throw new Cancelado("Cancelado");
        await fn(itens[proximo++]);
      }
    })
  );
}

const fatia = (chave) =>
  parseInt(crypto.createHash("md5").update(chave).digest("hex").slice(0, 8), 16) % FATIAS;

function resumoClasse(c) {
  const parte = (p) => (p && p.descTipoParte ? p.descTipoParte : undefined);
  return {
    descricao: c.descricao,
    recursal: c.recursal === "true",
    exigePoloPassivo: c.exigePoloPassivo === "true",
    poloAtivo: parte(c.tipoPartePoloAtivo),
    poloPassivo: parte(c.tipoPartePoloPassivo),
  };
}

/**
 * Consulta o PJe e devolve { base, mudancas } sem gravar nada em public/dados.
 * modo "rapido": recalcula competências novas + 1/7 das conhecidas.
 * modo "completo": recalcula todas as competências.
 * jurisdicoes: lista opcional de ids para limitar a consulta (as demais mantêm os dados atuais).
 */
async function sincronizar({ modo = "rapido", concorrencia = 3, progresso = () => {}, controle = {}, jurisdicoes = null } = {}) {
  const antiga = carregarBase();
  const completo = modo === "completo" || !antiga;
  const selecao = classesSelecionadas();
  const rodada = antiga ? (antiga.meta.rodada || 0) + 1 : 0;
  const erros = [];

  fs.mkdirSync(DIR_SYNC, { recursive: true });
  const cache = carregarCache();
  const gravarCache = fs.createWriteStream(ARQ_CACHE, { flags: "a" });

  const nova = {
    meta: {
      geradoEm: new Date().toISOString(),
      modo: completo ? "completo" : "rapido",
      rodada,
      jurisdicoes: [],
      classes: {},
      assuntos: {},
      competencias: { ...(antiga ? antiga.meta.competencias : {}) },
    },
    j: {},
  };

  try {
    // 1. Jurisdições
    progresso({ etapa: "Jurisdições", feito: 0, total: 1 });
    const jurs = await tentar(() => pje.jurisdicoes(), controle);
    nova.meta.jurisdicoes = jurs.map((j) => ({ id: j.id, descricao: j.descricao }));
    let ids = [...new Set(jurs.map((j) => j.id))];
    if (jurisdicoes) {
      const filtro = new Set(jurisdicoes.map(String));
      // Jurisdições fora do filtro mantêm os dados da base atual
      for (const id of ids) if (!filtro.has(id) && antiga && antiga.j[id]) nova.j[id] = antiga.j[id];
      ids = ids.filter((id) => filtro.has(id));
      if (antiga) for (const [c, v] of Object.entries(antiga.meta.classes)) nova.meta.classes[c] = v;
      if (antiga) Object.assign(nova.meta.assuntos, antiga.meta.assuntos);
    }

    // 2. Classes de cada jurisdição (somente as marcadas em config/classes-mp.csv)
    let feito = 0;
    progresso({ etapa: "Classes", feito, total: ids.length });
    await emParalelo(ids, concorrencia, controle, async (id) => {
      const classes = await tentar(() => pje.classes(id), controle);
      nova.j[id] = {};
      for (const c of classes) {
        if (!selecao.has(c.codigo)) continue;
        nova.meta.classes[c.codigo] = resumoClasse(c);
        nova.j[id][c.codigo] = {};
      }
      progresso({ etapa: "Classes", feito: ++feito, total: ids.length });
    });

    // 3. Assuntos de cada par jurisdição + classe
    const pares = ids.flatMap((id) => Object.keys(nova.j[id]).map((c) => [id, c]));
    feito = 0;
    progresso({ etapa: "Assuntos", feito, total: pares.length });
    await emParalelo(pares, concorrencia, controle, async ([id, c]) => {
      for (const a of await tentar(() => pje.assuntos(id, c), controle)) {
        nova.meta.assuntos[a.codigo] = a.descricao;
        nova.j[id][c][a.codigo] = null;
      }
      progresso({ etapa: "Assuntos", feito: ++feito, total: pares.length });
    });

    // 4. Competências: reaproveita o que já se sabe e consulta o restante
    const aConsultar = [];
    for (const [id, c] of pares) {
      for (const a of Object.keys(nova.j[id][c])) {
        const chave = `${id}|${c}|${a}`;
        const anterior = antiga && antiga.j[id] && antiga.j[id][c] ? antiga.j[id][c][a] : undefined;
        const emCache = cache.get(chave);
        if (emCache) {
          nova.j[id][c][a] = emCache.v;
          Object.assign(nova.meta.competencias, emCache.d);
        } else if (!completo && Array.isArray(anterior) && fatia(chave) !== rodada % FATIAS) {
          nova.j[id][c][a] = anterior;
        } else {
          aConsultar.push([id, c, a, anterior]);
        }
      }
    }

    feito = 0;
    progresso({ etapa: "Competências", feito, total: aConsultar.length });
    await emParalelo(aConsultar, concorrencia, controle, async ([id, c, a, anterior]) => {
      try {
        const comps = await tentar(() => pje.competencias(id, c, [a]), controle);
        const v = comps.map((x) => x.id).sort((x, y) => x - y);
        const d = Object.fromEntries(comps.map((x) => [x.id, x.descricao]));
        nova.j[id][c][a] = v;
        Object.assign(nova.meta.competencias, d);
        gravarCache.write(JSON.stringify({ k: `${id}|${c}|${a}`, v, d, t: Date.now() }) + "\n");
      } catch (e) {
        if (e instanceof Cancelado) throw e;
        nova.j[id][c][a] = Array.isArray(anterior) ? anterior : null;
        erros.push({ jurisdicao: id, classe: c, assunto: a, erro: e.message });
      }
      progresso({ etapa: "Competências", feito: ++feito, total: aConsultar.length });
    });
  } finally {
    await new Promise((r) => gravarCache.end(r));
  }

  // Mantém no dicionário só as competências em uso
  const usadas = new Set();
  for (const classes of Object.values(nova.j))
    for (const assuntos of Object.values(classes))
      for (const v of Object.values(assuntos)) if (v) v.forEach((x) => usadas.add(String(x)));
  nova.meta.competencias = Object.fromEntries(
    Object.entries(nova.meta.competencias).filter(([id]) => usadas.has(id))
  );

  const mudancas = comparar(antiga, nova);
  mudancas.erros = erros;
  nova.meta.ultimaAtualizacao = mudancas.resumo;
  return { base: nova, mudancas };
}

// ---------- Comparação ----------

function comparar(antiga, nova) {
  const nomesJ = (base) => {
    const m = {};
    for (const j of base.meta.jurisdicoes) m[j.id] = m[j.id] ? `${m[j.id]} / ${j.descricao}` : j.descricao;
    return m;
  };
  const totais = {
    jurisdicoes: nova.meta.jurisdicoes.length,
    classes: Object.keys(nova.meta.classes).length,
    combinacoes: Object.values(nova.j).reduce(
      (s, cls) => s + Object.values(cls).reduce((t, as) => t + Object.keys(as).length, 0), 0),
  };

  if (!antiga) {
    return { inicial: true, resumo: { inicial: true, ...totais }, linhas: [] };
  }

  const nJ = { ...nomesJ(antiga), ...nomesJ(nova) };
  const nomeClasse = (c) => `${c} - ${(nova.meta.classes[c] || antiga.meta.classes[c] || {}).descricao || "?"}`;
  const nomeAssunto = (a) => `${a} - ${nova.meta.assuntos[a] || antiga.meta.assuntos[a] || "?"}`;
  const comps = (v, base) =>
    v === null || v === undefined ? "(não consultada)"
      : v.length ? v.map((id) => `${base.meta.competencias[id] || "?"} (${id})`).join(" | ")
      : "(nenhuma)";
  const linhas = [];
  const add = (tipo, id, c, a, antes, depois) =>
    linhas.push({ tipo, jurisdicao: id ? `${id} - ${nJ[id]}` : "", classe: c ? nomeClasse(c) : "",
      assunto: a ? nomeAssunto(a) : "", antes: antes || "", depois: depois || "" });

  const chaveJ = (j) => `${j.id}|${j.descricao}`;
  const jAntes = new Set(antiga.meta.jurisdicoes.map(chaveJ));
  const jDepois = new Set(nova.meta.jurisdicoes.map(chaveJ));
  for (const j of nova.meta.jurisdicoes) if (!jAntes.has(chaveJ(j))) add("Jurisdição nova", j.id);
  for (const j of antiga.meta.jurisdicoes) if (!jDepois.has(chaveJ(j))) add("Jurisdição removida", j.id);

  for (const id of new Set([...Object.keys(antiga.j), ...Object.keys(nova.j)])) {
    const cAntes = antiga.j[id] || {};
    const cDepois = nova.j[id] || {};
    for (const c of new Set([...Object.keys(cAntes), ...Object.keys(cDepois)])) {
      if (!cAntes[c]) { add("Classe nova", id, c, null, "", `${Object.keys(cDepois[c]).length} assuntos`); continue; }
      if (!cDepois[c]) { add("Classe removida", id, c, null, `${Object.keys(cAntes[c]).length} assuntos`, ""); continue; }
      for (const a of new Set([...Object.keys(cAntes[c]), ...Object.keys(cDepois[c])])) {
        const va = cAntes[c][a];
        const vd = cDepois[c][a];
        if (!(a in cAntes[c])) add("Assunto novo", id, c, a, "", comps(vd, nova));
        else if (!(a in cDepois[c])) add("Assunto removido", id, c, a, comps(va, antiga), "");
        else if (JSON.stringify(va) !== JSON.stringify(vd)) add("Competência alterada", id, c, a, comps(va, antiga), comps(vd, nova));
      }
    }
  }

  const porTipo = {};
  for (const l of linhas) porTipo[l.tipo] = (porTipo[l.tipo] || 0) + 1;
  return { inicial: false, resumo: { ...totais, mudancas: linhas.length, porTipo }, linhas };
}

function mudancasCsv(mudancas) {
  const cel = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const linhas = [["tipo", "jurisdicao", "classe", "assunto", "antes", "depois"].join(";")];
  for (const l of mudancas.linhas) {
    linhas.push([l.tipo, l.jurisdicao, l.classe, l.assunto, l.antes, l.depois].map(cel).join(";"));
  }
  for (const e of mudancas.erros || []) {
    linhas.push(["Erro na consulta", e.jurisdicao, e.classe, e.assunto, "", e.erro].map(cel).join(";"));
  }
  return "﻿" + linhas.join("\r\n") + "\r\n";
}

module.exports = {
  sincronizar, carregarBase, gravarBase, limparCache, mudancasCsv, Cancelado,
  DIR_DADOS, DIR_SYNC, RAIZ,
};
