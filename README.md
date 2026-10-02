# Validador PJe/TJPA

Consulta ao vivo, no PJe do TJPA (1º grau), os vínculos reais entre
**Jurisdição → Classe → Assunto(s) → Competência**, usando o serviço SOAP público
`ConsultaPJe` (somente operações de consulta, sem autenticação).

## Rodar localmente

Requer Node.js 18 ou superior. Não há dependências para instalar.

```
npm start
```

Abra http://localhost:3000.

## Publicar em servidor interno

Veja [DEPLOY-TI.md](DEPLOY-TI.md) (Docker ou Node direto).

O TJPA recusa (HTTP 403) chamadas vindas de provedores de nuvem, então o
validador precisa rodar dentro da rede do MPPA. Testado na Vercel, inclusive
na região São Paulo, sem sucesso.

## Estrutura

- `public/index.html` — interface
- `server.js` — servidor HTTP (também expõe `/saude`)
- `lib/rotas.js` — rotas da API
- `Dockerfile` — imagem para o servidor interno
- `lib/pje.js` — cliente SOAP do ConsultaPJe
- `ConsultaPJe.wsdl` — contrato do serviço

## API

| Rota | Parâmetros |
|---|---|
| `/api/jurisdicoes` | — |
| `/api/classes` | `jurisdicao` |
| `/api/assuntos` | `jurisdicao`, `classe` |
| `/api/competencias` | `jurisdicao`, `classe`, `assuntos` (códigos separados por vírgula) |

Lista vazia em `/api/competencias` significa que o PJe não tem competência para a
combinação. Erro 422 significa que algum código não existe no PJe.
