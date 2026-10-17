# Prompt — Gerador automático de criativos Auto Prime (Feed + Stories)

> Cole este prompt num assistente de código (Claude Code, Cursor etc.). Ele descreve todo o processo
> que hoje é feito à mão no Canva e no Drive, para virar um script Python que roda sozinho, sem abrir navegador.

---

## Contexto

Sou de uma agência que faz os criativos de anúncio da loja de carros **Auto Prime Multimarcas** (Içara/SC).
O cliente envia cada carro numa pasta do Google Drive. Para cada carro precisamos gerar **2 artes**:

- **FEED**: 1080 × 1350 px (Instagram 4:5)
- **STORIES**: 1080 × 1920 px (9:16)

e subir as duas de volta na pasta do próprio carro, com os nomes `[FEED] <Carro>.png` e `[STORIES] <Carro>.png`.

Quero um **script Python (CLI)** que faça tudo isso de ponta a ponta, sem Canva e sem automação de navegador.
O layout tem que ser reproduzido **em código** (Pillow), seguindo as especificações abaixo.

---

## 1. Entrada: estrutura do Google Drive

- Pasta raiz do cliente: `01 - MATERIAL DO CLIENTE` (ID `1jUMEtSB8TkBvWUrmOWUjfF5U_lVuGyk5`).
- Dentro dela há **uma subpasta por carro**, com nome livre (ex.: `Gol 2023`, `Argo Drive 2023 ( PRATA )`, `HB20 Comfort 2024`).
- Cada pasta de carro contém:
  - 10 a 15 fotos `WhatsApp Image ....jpeg` (frente, 3/4, lateral, traseira e interior), quase sempre em retrato 3:4 (960×1280 ou 1200×1600).
  - Um `Novo(a) Documento do Microsoft Word.docx` com a descrição do anúncio.
- Pastas que **não** são carros devem ser ignoradas (ex.: `Vídeos Carros`).
- Um carro é considerado **pendente** quando a pasta ainda não tem arquivos que comecem com `[FEED]` e `[STORIES]`.

**Requisito:** usar a **Google Drive API v3** com Service Account (ou OAuth do usuário) para:
1. listar as subpastas;
2. detectar as pendentes;
3. baixar as fotos e o .docx;
4. fazer o upload das artes prontas na mesma pasta.

Também deve existir a opção `--carros "Gol 2023,Mobi 2023"` para forçar carros específicos e `--reprocessar` para sobrescrever artes existentes.

---

## 2. Ler a descrição (.docx) e extrair os dados

Use `python-docx`. O texto segue sempre este padrão (os emojis variam):

```
🚙✨ VOLKSWAGEN GOL 1.0 FLEX | 2023 | MANUAL
🔥 BAIXA QUILOMETRAGEM
...
✅ Motor 1.0 Flex
✅ Câmbio manual
✅ Ar-condicionado
...
💰 Valor à vista: R$ 55.900,00
♻️ Para trocas considerar: R$ 57.900,00
```

Extrair:

| Campo | Regra |
|---|---|
| `marca` | primeira palavra do título (linha 1, sem emojis), ex.: `VOLKSWAGEN`, `FIAT`, `HYUNDAI`, `RENAULT` |
| `modelo` | segunda palavra, ex.: `GOL`, `MOBI`, `ARGO`, `HB20`, `KANGOO`, `T-CROSS`. Se a 3ª palavra for nome de versão sem número (ex.: `DRIVE`), incluir em `modelo` → `ARGO DRIVE` |
| `versao` | o resto do trecho antes do primeiro `\|`, ex.: `1.0 FLEX`, `1.0 6V FLEX`, `1.0 LIKE FLEX`, `1.0 COMFORTLINE 200 TSI` (permitir encurtar para caber, ver §5) |
| `ano` | 2º campo separado por `\|` (4 dígitos) |
| `cambio` | 3º campo (`MANUAL` / `AUTOMÁTICO`) |
| `preco` | valor após `Valor à vista:` (formato `R$ 55.900,00`). **Nunca** usar o preço de troca |
| `destaques` | linha 2 (ex.: `BAIXA QUILOMETRAGEM \| TODO REVISADO`) + itens `✅` |

**Linha de detalhes da arte:** `CÂMBIO  |  ANO 2023  |  DESTAQUE 1  |  DESTAQUE 2` (dois espaços em volta de cada `|`, tudo em maiúsculas).
Escolha os destaques nesta ordem de prioridade, quando existirem: `ÚNICO DONO`, `BAIXA KM` (de "baixa quilometragem"), `PILOTO AUTOMÁTICO`, `MULTIMÍDIA`, `REVISADO`, `UTILITÁRIO`, `COMPLETO` / `COMPLETA`, `ECONÔMICO`. Use no máximo 2 e respeite a largura máxima (§5).

Exemplos reais já aprovados:

| Carro | Título (negrito + fino) | Detalhes | Preço |
|---|---|---|---|
| Argo 2023 | **FIAT ARGO** 1.0 6V FLEX | MANUAL \| ANO 2023 \| BAIXA KM \| REVISADO | R$ 63.900,00 |
| Argo Drive 2023 | **FIAT ARGO DRIVE** 1.0 6V FLEX | MANUAL \| ANO 2023 \| MULTIMÍDIA \| REVISADO | R$ 65.900,00 |
| HB20 2015 | **HYUNDAI HB20** COMFORT 1.0 FLEX | MANUAL \| ANO 2015 \| COMPLETO \| REVISADO | R$ 47.900,00 |
| HB20 Comfort 2024 | **HYUNDAI HB20** COMFORT 1.0 FLEX | MANUAL \| ANO 2024 \| PILOTO AUTOMÁTICO \| MULTIMÍDIA | R$ 71.900,00 |
| Kangoo 2016 | **RENAULT KANGOO** 1.6 EXPRESS HI-FLEX | MANUAL \| ANO 2016 \| UTILITÁRIO \| COMPLETA | R$ 47.900,00 |
| T-Cross 2024 | **VOLKSWAGEN T-CROSS** 1.0 200 TSI | AUTOMÁTICO \| ANO 2024 \| ÚNICO DONO \| BAIXA KM | R$ 117.900,00 |
| Gol 2023 | **VOLKSWAGEN GOL** 1.0 FLEX | MANUAL \| ANO 2023 \| BAIXA KM \| COMPLETO | R$ 55.900,00 |
| Mobi 2023 | **FIAT MOBI** 1.0 LIKE FLEX | MANUAL \| ANO 2023 \| BAIXA KM \| ECONÔMICO | R$ 54.900,00 |

Gere também um `dados.json` por carro com esses campos, para revisão. Opcional: um modo `--revisar` que só gera o JSON e pausa até eu editar.

---

## 3. Escolher a foto principal

A foto ideal é **3/4 de frente**: carro inteiro, frente virada para a câmera, com o painel preto escrito **"AUTO PRIME"** ao fundo, no showroom de piso de porcelanato claro. Evite traseira, lateral pura, interior e fotos cortadas.

Implemente em duas camadas:
1. **Automática:** mande as miniaturas para um modelo de visão (Claude, via API Anthropic, modelo `claude-sonnet-5-5`) com o pedido: *"Escolha o índice da foto em 3/4 frontal, com o carro inteiro e o painel AUTO PRIME visível; responda só o número."*
2. **Manual (override):** `--foto "Gol 2023=2"` para escolher pelo índice.

Salve uma folha de contato (grade de miniaturas numeradas) em `saida/<carro>/contato.jpg` para conferência.

---

## 4. Ampliar o fundo com IA (outpainting)

A foto é 3:4 e as artes são 4:5 e 9:16. **Não pode esticar nem distorcer o carro.** É preciso estender o cenário (teto, paredes e piso) de forma natural, como se a foto tivesse sido tirada já no formato final.

Use o modelo de inpainting **LaMa** (`big-lama.pt`, TorchScript, baixado de
`https://github.com/enesmsahin/simple-lama-inpainting/releases/download/v0.1.0/big-lama.pt`). Ele roda em CPU, com `torch` + `numpy` + `Pillow`.
A lib `simple-lama-inpainting` não instala no Python 3.14; carregue o modelo direto com `torch.jit.load`.

```python
model = torch.jit.load("big-lama.pt", map_location="cpu").eval()
def fill(img, mask):  # img RGB PIL, mask L (255 = área a preencher)
    a = torch.from_numpy(np.asarray(img, np.float32)/255).permute(2,0,1)[None]
    m = torch.from_numpy((np.asarray(mask) > 127).astype(np.float32))[None,None]
    with torch.no_grad(): out = model(a, m)
    return Image.fromarray((out[0].permute(1,2,0).numpy()*255).clip(0,255).astype(np.uint8))
```

Procedimento comum aos dois formatos:
1. Monte uma tela do tamanho final, preencha com cinza (128,128,128) e cole a foto redimensionada (LANCZOS) na posição indicada abaixo.
2. Crie a máscara: 255 em toda a tela, menos um retângulo com 4 px de recuo sobre a foto original (essa área fica com 0).
3. Rode o LaMa com a tela e a máscara reduzidas para **metade da resolução** (ex.: 540×960) e depois volte o resultado ao tamanho cheio (LANCZOS). Fica mais rápido e com textura melhor.
4. **Recomponha a foto original por cima**, com borda suavizada: máscara "manter" = retângulo da foto com ~18–20 px de recuo, com GaussianBlur de raio 9–10. Assim o carro e a foto original saem nítidos e só as áreas novas vêm da IA.

**STORIES (1080×1920)**
- Foto redimensionada para **largura 1080**: altura = `round(h*1080/w)` (≈1440 em fotos 3:4).
- Colada em **y = 0**, encostada no topo. A IA estende só o **piso, para baixo**.
- Resultado: o carro fica no terço superior/médio, longe da faixa inferior que os anúncios cobrem.

**FEED (1080×1350)**
- Foto redimensionada para **largura 880**, centralizada em X (`x = 100`).
- Colada em **y = −110**, cortando um pouco do teto. A IA estende as **laterais** e o **piso**.
- Se o para-choque do carro passar de **y ≈ 960** (onde começa o bloco de texto), suba mais a foto. Valores que funcionaram: `y = −185` (HB20 2015), `−150` (Kangoo), `−170` (Mobi). Implemente isso de forma automática: detecte a base do carro (ex.: com o modelo de visão retornando a coordenada y do para-choque, ou com uma segmentação simples) e ajuste o `y` até a base ficar ≤ 950.

Salve os fundos intermediários em `saida/<carro>/fundo_feed.jpg` e `fundo_stories.jpg`.

---

## 5. Compor a arte (Pillow)

Todas as medidas são em pixels da arte final. Fonte: **Poppins** (Google Fonts: Bold Italic, Light Italic e Regular). Use cores em RGB.

### Assets necessários (em `assets/`)
- `logo_auto_prime.png`: o logo "AUTO PRIME MULTIMARCAS" (branco e vermelho, fundo transparente), exportado do template do Canva.
- `Poppins-BoldItalic.ttf`, `Poppins-LightItalic.ttf`, `Poppins-Regular.ttf`, `Poppins-Bold.ttf`.

### Camadas, de baixo para cima

1. **Fundo**: a imagem ampliada do §4.
2. **Degradê inferior** (preto, horizontal em toda a largura):
   - FEED: começa transparente em **y ≈ 780** e chega a **opacidade ~100%** em y = 1350, com curva suave (ease-in, expoente ≈ 1.6).
   - STORIES: começa transparente em **y ≈ 950** e chega a ~100% em y = 1920 (do meio para baixo o fundo vai ficando quase preto).
3. **Degradê superior** (só no STORIES): cor (32,32,32), altura **650 px**, opacidade **alpha = 235·(1−t)^1.8**, com `t` = y/650 (escuro no topo, sumindo até a linha 650). Disfarça o teto estendido.
4. **Bloco de informações** (alinhado à esquerda):

| Elemento | FEED | STORIES |
|---|---|---|
| Logo AUTO PRIME | x = 129, topo em y ≈ 1049, largura ≈ 232 px | x = 135, topo em y ≈ 1325, largura ≈ 242 px |
| Título, linha 1 | x = 116, topo em y ≈ 1119, altura de caixa-alta ≈ 32 px (fonte ~44 px) | x = 142, topo em y ≈ 1401, altura de caixa-alta ≈ 29 px (fonte ~40 px) |
| Detalhes | x = 121, topo em y ≈ 1171, Poppins Regular ~26 px, branco | x = 140, topo em y ≈ 1453, Poppins Regular ~24 px, branco |
| Caixa do preço | retângulo **RGB (238,34,1)**, x 119 → (largura do texto + 2×16), y 1215 → 1283 | retângulo RGB (238,34,1), x 138 → (largura do texto + 2×18), y 1509 → 1584 |
| Texto do preço | Poppins Bold ~44 px, branco, centralizado na caixa na vertical | Poppins Bold ~42 px, branco |

- **Título:** `MARCA MODELO` em **Poppins Bold Italic** e, na mesma linha, depois de um espaço, `versao` em **Poppins Light Italic**, os dois brancos e com o mesmo tamanho. Ex.: **`VOLKSWAGEN GOL`** `1.0 FLEX`.
- **Largura máxima do título:** 1080 − 2×margem (≈ 840 px). Se passar, reduza a fonte de 2 em 2 px (mínimo ~36 px no Feed / 32 px no Stories) até caber **em uma linha só**. Nunca quebre o título em duas linhas.
- **Detalhes:** mesma regra. Se não couber, retire o último destaque.
- **Faixa de segurança (anúncios):** nada importante abaixo de **y = 1290** no Feed nem de **y = 1600** no Stories.

> Os valores de tamanho de fonte são aproximados (medidos nas artes exportadas). Implemente um script de calibração `calibrar.py` que desenha o layout sobre `referencia/[FEED] Gol 2023.png` e `referencia/[STORIES] Gol 2023.png` (artes oficiais que vou fornecer) e mostra a diferença (overlay/diff). Ajuste as constantes até o desvio ficar ≤ 3 px.

Coloque todas as constantes de layout num único `layout.py` (ou `layout.yaml`), separadas por formato, para eu ajustar sem mexer na lógica.

---

## 6. Saída e upload

1. Exporte PNG (RGB, sem transparência):
   - `saida/<carro>/[FEED] <Carro>.png` (1080×1350)
   - `saida/<carro>/[STORIES] <Carro>.png` (1080×1920)
   - `<Carro>` = nome legível do carro (ex.: `Gol 2023`, `HB20 Comfort 2024`, `T-Cross 2024`). Por padrão, use o nome da pasta do Drive, removendo parênteses e espaços extras.
2. Gere `saida/previa.jpg` com todas as artes da rodada lado a lado, para eu aprovar.
3. Faça o **upload pela Drive API** na pasta do carro, com o mesmo nome, só depois da confirmação (`--enviar`, ou um prompt `Enviar? [s/N]`). Se já existir um arquivo com o mesmo nome, atualize esse arquivo (`files.update`) em vez de criar duplicata.
4. Ao final, mostre um resumo: carro → arquivos enviados → links do Drive.

---

## 7. Requisitos técnicos

- Python 3.11+ (testar também no 3.14). Dependências: `google-api-python-client`, `google-auth`, `python-docx`, `Pillow`, `numpy`, `torch` (CPU), `anthropic` (opcional, para escolher a foto e detectar a base do carro).
- Estrutura sugerida:
  ```
  criativos/
    main.py            # CLI (argparse)
    drive.py           # listar, baixar, enviar
    descricao.py       # parse do .docx → dados
    foto.py            # escolha da foto + folha de contato
    outpaint.py        # LaMa
    layout.py          # constantes por formato
    render.py          # composição Pillow
    calibrar.py
    assets/ (logo, fontes)   modelos/big-lama.pt   saida/
  ```
- Cache: não baixe nem rode o LaMa de novo se o arquivo intermediário já existir (a não ser com `--reprocessar`).
- Logs claros em português.
- Testes mínimos: parser do .docx com os 8 exemplos da tabela do §2 e renderização de um carro de exemplo, comparando o tamanho da imagem e a posição da caixa vermelha.

---

## 8. Critérios de aceite

- [ ] Carro sempre inteiro, sem distorção e sem ficar atrás do texto, nos dois formatos.
- [ ] Teto, paredes e piso estendidos com aparência natural (sem espelhamento, emendas ou borrões visíveis).
- [ ] Título numa linha só, com o nome do carro em negrito e a versão em fino.
- [ ] Preço = valor à vista do .docx.
- [ ] Nomes `[FEED] …` / `[STORIES] …` na pasta certa do Drive.
- [ ] Rodar `python main.py --pendentes --enviar` processa todos os carros novos sem nenhuma interação com navegador.
