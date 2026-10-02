# Validador PJe/TJPA

Consulta ao vivo, no PJe do TJPA (1º grau), os vínculos reais entre
**Jurisdição → Classe → Assunto(s) → Competência**, usando o serviço SOAP público
`ConsultaPJe` (somente operações de consulta, sem autenticação).

O TJPA recusa (HTTP 403) chamadas vindas de provedores de nuvem, então o validador
precisa rodar na rede do MP.

## Rodar

Requer Node.js 18 ou superior. Não há dependências para instalar.

**Windows:** dê dois cliques em `iniciar-validador.bat`. Ele sobe o servidor, mostra os
endereços e abre a página no navegador. Para encerrar, feche a janela.

Ou pelo terminal:

```
npm start
```

Abra http://localhost:3000. Outros computadores da rede ou da VPN acessam pelo IP desta
máquina na porta 3000.

## Servidor interno

Veja [DEPLOY-TI.md](DEPLOY-TI.md) (Docker ou Node direto).

## Estrutura

- `public/index.html` — interface
- `server.js` — servidor HTTP (também expõe `/saude`)
- `lib/rotas.js` — rotas da API
- `lib/pje.js` — cliente SOAP do ConsultaPJe
- `iniciar-validador.bat` — atalho para iniciar no Windows
- `Dockerfile` — imagem para o servidor interno
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
