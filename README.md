# Validador PJe/TJPA

Ferramentas para consultar os vínculos reais **Jurisdição → Classe → Assunto → Competência**
no PJe do TJPA (1º grau), usando o serviço SOAP público `ConsultaPJe` (somente consultas,
sem autenticação).

## Como funciona

```
REDE DO MP (esta máquina)                        VERCEL (usuário final)
  npm start                                        public/index.html
  /admin → Verificar atualizações                  lê public/dados/
         → revisar mudanças / baixar planilha      não chama o TJ
         → Publicar (commit + push) ─────────────► deploy automático
```

O TJPA recusa (HTTP 403) chamadas vindas de provedores de nuvem. Por isso a consulta ao PJe
roda na rede do MP e a Vercel só publica a base já pronta.

## Rodar

Requer Node.js 18 ou superior e nenhuma dependência.

```
npm start
```

| Endereço | O que é |
|---|---|
| http://localhost:3000 | Validador ao vivo (consulta o PJe a cada clique) |
| http://localhost:3000/admin | Sincronização e publicação da base (só abre na própria máquina) |
| http://localhost:3000/publico/ | Prévia do site do usuário final |

## Atualizar a base

1. Em `config/classes-mp.csv`, marque com **S** na coluna `usar_mp` as classes que entram na base.
2. Em `/admin`:
   - **Carga completa** (a primeira vez, ou para reconferir tudo): consulta todas as competências.
     Com cerca de 60 classes, leva de 3 a 5 horas; rode fora do expediente. Se for interrompida,
     o que já foi consultado é reaproveitado por 24 h.
   - **Verificar atualizações** (rotina): refaz as listas de jurisdições, classes e assuntos, calcula
     a competência do que for novo e revalida 1/7 das competências conhecidas.
3. Revise as mudanças (ou baixe a planilha) e clique em **Publicar no site**. O commit e o push
   disparam o deploy na Vercel.

## Estrutura

- `public/` — site publicado na Vercel (`index.html` e `dados/`, gerados pelo sincronizador)
- `local/validador.html` — validador ao vivo
- `local/admin.html` — administração da base
- `lib/sincronizar.js` — consulta o PJe, monta a base e compara com a publicada
- `lib/admin.js` — execução da sincronização e publicação (git)
- `lib/pje.js` — cliente SOAP do ConsultaPJe
- `lib/rotas.js` — API do validador ao vivo
- `config/classes-mp.csv` — classes incluídas na base
- `server.js` — servidor local
- `Dockerfile`, `DEPLOY-TI.md` — instalação do validador ao vivo em servidor interno
- `ConsultaPJe.wsdl` — contrato do serviço

## Base de dados (`public/dados`)

- `meta.json` — data, jurisdições e dicionários de classes, assuntos e competências
- `j/<id>.json` — `{ codClasse: { codAssunto: [idsCompetencia] } }`; lista vazia significa que o
  PJe lista o assunto para a classe, mas não retorna competência

## API do validador ao vivo

| Rota | Parâmetros |
|---|---|
| `/api/jurisdicoes` | — |
| `/api/classes` | `jurisdicao` |
| `/api/assuntos` | `jurisdicao`, `classe` |
| `/api/competencias` | `jurisdicao`, `classe`, `assuntos` (códigos separados por vírgula) |
