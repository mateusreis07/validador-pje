# Validador PJe/TJPA — instalação em servidor interno

## O que é

Uma página web interna que consulta o **PJe do TJPA** e mostra os vínculos reais
entre Jurisdição, Classe, Assunto e Competência. Serve para a equipe identificar
combinações que o SAJ oferece, mas que o PJe não aceita.

- **Somente leitura:** usa apenas operações de consulta do serviço SOAP público
  `ConsultaPJe` do TJPA. Não peticiona, não altera dados e não usa credenciais.
- **Sem banco de dados e sem dependências:** um único processo Node.js.
- **Sem dados sensíveis:** só tabelas públicas (classes, assuntos, competências).

## Por que precisa ser servidor interno

O TJPA recusa (HTTP 403) chamadas vindas de provedores de nuvem; testamos na
Vercel, inclusive na região São Paulo. A partir da rede do MPPA o acesso funciona.

## Requisitos

| Item | Valor |
|---|---|
| Saída de rede (HTTPS, porta 443) | `pje.tjpa.jus.br` (TJPA) e `pjews.tjce.jus.br` (TJCE) |
| Porta de entrada | 3000 (configurável pela variável `PORT`) |
| Recursos | Mínimos: ~100 MB de RAM, CPU desprezível |
| Usuários | Equipe interna, pela rede do MPPA ou VPN |

Código-fonte: https://github.com/mateusreis07/validador-pje

## Opção A — Docker (recomendada)

```bash
git clone https://github.com/mateusreis07/validador-pje.git
cd validador-pje
docker build -t validador-pje .
docker run -d --name validador-pje --restart unless-stopped -p 3000:3000 validador-pje
```

## Opção B — Node.js direto, sem Docker

Requer Node.js 18 ou superior. Não há `npm install`.

```bash
git clone https://github.com/mateusreis07/validador-pje.git
cd validador-pje
PORT=3000 node server.js
```

Para manter o processo ativo, use o gerenciador de serviços da casa
(systemd, PM2, serviço do Windows etc.).

## Como verificar

1. `GET http://SERVIDOR:3000/saude` deve responder `{"status":"ok"}`
   (não consulta o TJ, pode ser usado em monitoramento).
2. `GET http://SERVIDOR:3000/api/jurisdicoes` deve retornar uma lista JSON com
   cerca de 130 jurisdições. **Este é o teste que confirma a saída para o TJPA.**
3. Abrir `http://SERVIDOR:3000` no navegador e escolher uma jurisdição.

## Se o passo 2 falhar

| Sintoma | Causa provável | Solução |
|---|---|---|
| `HTTP 403` | O TJPA não aceita o IP de saída do servidor | Usar um servidor cuja saída seja a mesma das estações da rede interna |
| Tempo esgotado / `fetch failed` | Saída para a internet só via proxy | Definir `HTTPS_PROXY=http://proxy:porta` **e** `NODE_USE_ENV_PROXY=1` (exige Node 24 ou 22.21+; a imagem Docker já usa Node 24) |
| Erro de certificado (`self-signed certificate`, `unable to get local issuer`) | Inspeção TLS no proxy/firewall | Montar o certificado da CA interna e definir `NODE_EXTRA_CA_CERTS=/caminho/ca.pem` |

Exemplo com proxy e CA interna no Docker:

```bash
docker run -d --name validador-pje --restart unless-stopped -p 3000:3000 \
  -e HTTPS_PROXY=http://proxy.mppa:8080 -e NODE_USE_ENV_PROXY=1 \
  -e NODE_EXTRA_CA_CERTS=/certs/ca.pem -v /caminho/ca.pem:/certs/ca.pem:ro \
  validador-pje
```

## Atualizações

```bash
git pull
docker build -t validador-pje .
docker rm -f validador-pje
docker run -d --name validador-pje --restart unless-stopped -p 3000:3000 validador-pje
```

## Contato

Responsável pelo projeto: [nome, setor e ramal]
