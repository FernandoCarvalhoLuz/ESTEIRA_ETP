# Como continuar o projeto (guia para quem está pegando o código)

Este guia mostra como rodar a Esteira de Tráfego (ETP) **na sua máquina, sem acesso à VPS**, e onde o trabalho parou.
A VPS só é necessária para publicar em produção (`scripts/deploy.sh`), e isso é decisão de quem é dono do servidor.

## 1. Rodar localmente

Requisitos: **Node 20.12 ou superior** e Git. Funciona em Windows, Mac e Linux.

```bash
git clone https://github.com/FernandoCarvalhoLuz/ESTEIRA_ETP.git
cd ESTEIRA_ETP
npm install
cp .env.example .env
```

Edite o `.env`. Para rodar local, deixe assim e preencha só o token:

```
PORT=3010
HOST=127.0.0.1
COOKIE_SECURE=false
META_ACCESS_TOKEN=<seu token da Meta com permissão ads_read>
```

Crie seu usuário de acesso (a senha precisa de pelo menos 8 caracteres):

```bash
npm run user:create -- admin "sua-senha-forte" "Seu Nome"
```

Suba em dois terminais, com recarga automática:

```bash
npm run dev        # API em http://127.0.0.1:3010
npm run dev:web    # interface em http://localhost:5173  (use este endereço)
```

Ou, para testar como em produção: `npm run build && npm start` e abra http://127.0.0.1:3010.

### O que você precisa ter

| Item | Para quê | Obrigatório? |
|---|---|---|
| Token da Meta (`ads_read`) | painel de campanhas | sim. Pode ser o seu; também dá para colar em **Configurações** |
| Chave da Claude API | textos da Esteira Automática | não. Cole em Configurações › Esteira Automática. Fica em `data/` e nunca vai para o Git |
| Ollama local | alternativa à Claude para os textos | não |
| Conta de serviço do Google (JSON) | ler as pastas do Drive | só se for usar fotos/estoque do Drive |
| Integração Canva (Client ID/Secret) | artes pelo Canva | só se usar o motor Canva |

### O que NÃO vem no repositório

- **`data/`** (usuários, contas dos clientes, modelos, rascunhos): fica só na VPS. Você começa com tudo vazio e cadastra contas de teste.
- **Modelos de IA de recorte/ampliação** (`isnet.onnx` e `lama_fp32.onnx`, cerca de 390 MB): são baixados sozinhos na primeira vez que a Esteira Automática gera uma arte. A primeira geração demora por causa disso.
- **`.env`, chaves SSH e `*.key`**: nunca devem ser commitados. O `.gitignore` já os ignora.

> Nunca coloque chaves (OpenAI, Claude, Meta, Google) em arquivos rastreados pelo Git. O repositório é público.

## 2. Mapa rápido do código

- `server/meta/` — chamadas à Graph API, métricas e períodos.
- `server/builder/` — Esteira de Campanha (modelos, rascunhos, Canva, mídia).
- `server/auto/` — **Esteira Automática**: leitura dos sites, padrão do cliente, LLM, Drive, gerador de artes, recorte do carro.
- `server/routes/` — rotas da API (`meta`, `builder`, `auto`, `settings`).
- `web/src/` — frontend React + Vite (identidade preto + dourado em `brand.css` e `fx.css`).
- `PROMPT_gerador_criativos_auto_prime.md` — padrão de criativo "Auto Prime".
- `README.md` — visão geral do produto.

## 3. Regras de produto já decididas

- Cada conta de anúncio é um cliente: modelos, artes e padrões são **separados por conta**, nunca globais.
- As opções do assistente seguem os campos e nomes do Gerenciador de Anúncios da Meta.
- Só campanhas de WhatsApp. Objetivos: Engajamento, Leads e Vendas. A campanha é publicada **pausada**.
- Nada é publicado sem aprovação do usuário.
- Foco em desktop; não priorizar mobile.
- Visual: preto + dourado (`#F7C21B`). Use os tokens `--accent`, `--brand-gradient` e `--on-accent`. Texto sobre dourado é sempre preto.
- Sem cursor customizado (anel ou ponto seguindo o ponteiro). Anime os próprios elementos no hover.
- O servidor de produção é compartilhado com outros apps e tem 2 núcleos e 11 GB de RAM. Evite modelos que usem muita memória (o BiRefNet foi descartado por isso).

## 4. Onde paramos (Esteira Automática)

Implementado: leitura de sites de estoque (LitoralCar, Webmotors, AutoBusiness e genérico), análise do padrão do cliente a partir do histórico da Meta, LLM (Claude ou Ollama), Drive por conta de serviço, Canva por OAuth, **gerador de artes próprio** (layouts "vitrine" e "prime"), recorte do carro com ISNet, ampliação de cenário com LaMa e aviso de carro novo detectado no site.

Decisões recentes:

- O Autofill do Canva saiu fora do formato, então as artes agora usam o motor próprio (`client.art.engine`: `etp` por padrão, `canva` opcional).
- Fotos das artes vêm sempre da pasta do carro no Drive.
- O estoque vem das pastas do Drive mais o `.docx` do veículo (`driveStock.js` e `vehicleText.js`).

Pendências e próximos passos sugeridos:

1. Conferir a qualidade das artes do layout `prime` com carros de outros clientes (Nandi, CND).
2. Ligar o LLM local (Ollama) em produção. Depende de autorização do dono do servidor.
3. Posts do Instagram em "publicação existente" exigem token com `instagram_basic`.
4. O assistente manual de campanha (Esteira de Campanha) ficou em segundo plano. Retomar depois da Esteira Automática.
5. Revisar os nomes dos templates importados do Canva (o Canva repete nomes entre páginas).

## 5. Continuidade com o ai-memory (bastão)

O ai-memory é a memória de longo prazo que usamos com o Claude Code. Ela é **local**: cada pessoa tem a sua e ela não viaja com o Git. Por isso o essencial está escrito neste arquivo, e funciona mesmo sem o ai-memory.

Se você usa Claude Code com o servidor ai-memory ligado:

1. Abra o projeto clonado no Claude Code.
2. Se existir um bastão (handoff) aberto, o Claude o mostra sozinho no início da sessão.
3. Se não aparecer, peça: *"Liste os handoffs abertos do ai-memory e aceite o mais recente."*
4. Se não houver nenhum (a memória do Fernando está na máquina dele), diga ao Claude: *"Leia o COMO_CONTINUAR.md e o README.md e retome de onde o projeto parou."*

Para registrar o seu próprio bastão ao terminar uma sessão, peça ao Claude: *"Salve um handoff do ai-memory com o que fizemos e os próximos passos."* Se a outra pessoa usa o mesmo servidor, peça que seja compartilhado (`shared: true`).
