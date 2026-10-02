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

## Publicar na Vercel

1. Envie este repositório para o GitHub.
2. Na Vercel: **Add New → Project**, importe o repositório e clique em **Deploy**
   (sem configuração extra; o `vercel.json` já fixa a região São Paulo, `gru1`).

## Estrutura

- `public/index.html` — interface
- `api/[rota].js` — função serverless da Vercel
- `server.js` — servidor local
- `lib/rotas.js` — rotas da API (compartilhadas)
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
