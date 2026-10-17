# Esteira de Tráfego

Painel web para acompanhar as campanhas de Meta Ads de todas as contas de anúncio, com foco em campanhas de mensagem (WhatsApp/Messenger/Direct): **custo por conversa iniciada**, conversas, novos contatos, investimento, CPM, CTR e CPC — sempre comparando com o período anterior.

**Produção:** https://esteira.144-22-163-43.sslip.io

## Telas

- **Visão geral** — totais de todas as contas, ranking de custo por conversa e de conversas por conta, tabela de contas.
- **Conta** — indicadores, evolução diária (investimento, conversas, custo por conversa) e tabela de campanhas com orçamento, status e resultados.
- **Campanha** — indicadores, evolução diária, conjuntos de anúncios e anúncios (com miniatura do criativo).
- **Configurações** — status do token da Meta (validade, permissões) e troca do token pela interface.

Todas as tabelas são ordenáveis e exportam CSV (abre direto no Excel). O período escolhido fica na URL, então os links podem ser compartilhados.

## Como funciona

```
Navegador ──HTTPS──> nginx (Oracle) ──> Node/Express :3010 ──> Graph API da Meta
                                          │
                                          └─ data/ (usuários, token salvo pela interface)
```

- `server/` — API em Express. O token da Meta fica só no servidor; o navegador nunca o vê.
  - `meta/client.js` — chamadas à Graph API com cache de 5 min, paginação e tratamento de erros (token expirado, limite de requisições).
  - `meta/metrics.js` — extrai as métricas das `actions` da Meta (ex.: `onsite_conversion.messaging_conversation_started_7d` = conversas iniciadas) e calcula custos e taxas.
  - `meta/dates.js` — períodos no fuso de São Paulo e o período anterior equivalente.
  - `meta/service.js` — monta as visões de visão geral, conta e campanha.
- `web/` — frontend em React + Vite + Recharts. `npm run build` gera `web/dist`, servido pelo Express.

## Rodar localmente

> Quem vai continuar o projeto: veja o guia completo em [COMO_CONTINUAR.md](COMO_CONTINUAR.md). Não precisa de acesso à VPS.

```bash
npm install
cp .env.example .env            # preencha META_ACCESS_TOKEN
npm run user:create -- admin "uma-senha-forte" "Seu Nome"
npm run build && npm start      # http://127.0.0.1:3010
```

Para desenvolver o frontend com recarga automática: `npm run dev` (API) e `npm run dev:web` (http://localhost:5173).

## Deploy no servidor Oracle

No Git Bash, a partir da raiz do projeto:

```bash
bash scripts/deploy.sh
```

O script faz o build, envia o código para `/home/ubuntu/esteira-de-trafego`, instala as dependências e recarrega o processo `esteira-de-trafego` no PM2. O `.env` e a pasta `data/` do servidor nunca são sobrescritos.

Usa a chave em `~/.ssh/oracle_esteira.key` (dá para trocar com `SSH_KEY=... bash scripts/deploy.sh`).

Dados do servidor:

| Item | Valor |
|---|---|
| Acesso | `ssh -i ~/.ssh/oracle_esteira.key ubuntu@144.22.163.43` |
| Pasta | `/home/ubuntu/esteira-de-trafego` |
| Processo | `pm2 logs esteira-de-trafego` / `pm2 restart esteira-de-trafego` |
| nginx | `/etc/nginx/sites-available/esteira-de-trafego` (HTTPS via certbot, renovação automática) |
| Porta interna | 3010 (só escuta em 127.0.0.1) |

## Usuários

No servidor:

```bash
cd /home/ubuntu/esteira-de-trafego
node scripts/create-user.js <usuario> "<senha>" "<Nome>" [admin|viewer]
```

Rodar de novo com o mesmo usuário troca a senha. `viewer` vê tudo, mas não pode trocar o token.

## Token da Meta

A plataforma usa o token do `.env` (`META_ACCESS_TOKEN`) ou o que for salvo em **Configurações** (que tem prioridade). Um aviso aparece no topo quando o token está inválido ou perto de expirar.

O mais estável é um **token de usuário do sistema** do Gerenciador de Negócios (não expira e não depende do login de uma pessoa). O passo a passo está na tela de Configurações.

## Domínio próprio

O endereço atual usa o sslip.io (DNS gratuito que aponta para o IP do servidor). Para usar um domínio próprio, por exemplo `esteira.suaempresa.com.br`:

1. Crie um registro DNS `A` apontando para `144.22.163.43`.
2. No servidor, troque o `server_name` em `/etc/nginx/sites-available/esteira-de-trafego` e rode `sudo certbot --nginx -d esteira.suaempresa.com.br`.
