// LLM da Esteira Automática: Claude API (pago por uso, melhor texto) ou modelo local via Ollama (grátis, mais lento).
// Usada para escrever os textos no estilo do cliente, ler sites desconhecidos e escolher a foto de capa.
// Sem LLM, a esteira usa os textos-modelo e a escolha de foto por regras.
import Anthropic from '@anthropic-ai/sdk';
import { settings } from '../store.js';

export const DEFAULT_LLM = {
  provider: 'off', // 'off' | 'claude' | 'ollama'
  claudeKey: '',
  claudeModel: 'claude-sonnet-5-5',
  ollamaUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'gemma3:4b',
};

export function llmSettings() {
  return { ...DEFAULT_LLM, ...(settings.get().llm || {}) };
}

export function llmPublic() {
  const s = llmSettings();
  return {
    provider: s.provider,
    claudeModel: s.claudeModel,
    hasClaudeKey: Boolean(s.claudeKey),
    claudeKeyHint: s.claudeKey ? `…${s.claudeKey.slice(-4)}` : '',
    ollamaUrl: s.ollamaUrl,
    ollamaModel: s.ollamaModel,
  };
}

export function saveLlm(patch) {
  const current = llmSettings();
  const next = { ...current };
  for (const key of ['provider', 'claudeModel', 'ollamaUrl', 'ollamaModel']) if (patch[key] !== undefined) next[key] = String(patch[key]).trim();
  if (patch.claudeKey !== undefined && patch.claudeKey !== '') next.claudeKey = String(patch.claudeKey).trim();
  if (patch.clearClaudeKey) next.claudeKey = '';
  if (!['off', 'claude', 'ollama'].includes(next.provider)) next.provider = 'off';
  settings.update({ llm: next });
  return llmPublic();
}

export const llmEnabled = () => {
  const s = llmSettings();
  return (s.provider === 'claude' && Boolean(s.claudeKey)) || s.provider === 'ollama';
};

function parseJson(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('A LLM não devolveu um JSON válido.');
  }
}

// Modelos que aceitam o fallback do servidor: se o filtro de segurança recusar por engano, outro modelo responde.
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);
// `effort` existe a partir da geração 4.6 (Haiku 4.5 e anteriores recusam o campo).
const takesEffort = (model) => /^claude-(opus|sonnet|fable|mythos)-(5|4-[678])/.test(model);

async function callClaude(s, { system, prompt, images = [], maxTokens = 8000, effort }) {
  const client = new Anthropic({ apiKey: s.claudeKey, timeout: 180_000 });
  const content = [
    ...images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } })),
    { type: 'text', text: prompt },
  ];
  const params = {
    model: s.claudeModel,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content }],
    ...(effort && takesEffort(s.claudeModel) ? { output_config: { effort } } : {}),
  };
  let msg;
  try {
    msg = FALLBACK_MODELS.has(s.claudeModel)
      ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.messages.create(params);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error('Claude API: chave inválida. Confira em Configurações › Esteira Automática.');
    if (err instanceof Anthropic.RateLimitError) throw new Error('Claude API: limite de uso atingido. Tente de novo em instantes.');
    if (err instanceof Anthropic.APIConnectionError) throw new Error('Claude API: sem conexão com a Anthropic.');
    if (err instanceof Anthropic.APIError) throw new Error(`Claude API: ${err.message}`);
    throw err;
  }
  if (msg.stop_reason === 'refusal') throw new Error(`Claude API: o pedido foi recusado${msg.stop_details?.category ? ` (${msg.stop_details.category})` : ''}.`);
  return msg.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
}

async function callOllama(s, { system, prompt, images = [], json }) {
  const res = await fetch(`${s.ollamaUrl.replace(/\/$/, '')}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: s.ollamaModel,
      system,
      prompt,
      ...(images.length ? { images: images.map((i) => i.base64) } : {}),
      ...(json ? { format: 'json' } : {}),
      stream: false,
      keep_alive: '5m',
      options: { temperature: 0.5, num_ctx: 4096 },
    }),
    signal: AbortSignal.timeout(600_000),
  }).catch((err) => { throw new Error(`LLM local indisponível (${err.cause?.code || err.message}). Verifique se o Ollama está ligado no servidor.`); });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`LLM local: ${body?.error || `HTTP ${res.status}`}`);
  return body.response || '';
}

/**
 * Chamada genérica. `json: true` devolve o objeto já interpretado. `maxTokens` cobre o raciocínio do modelo e a
 * resposta (o Claude pensa antes de responder); `effort` ('low'…'max') só vale para o Claude.
 */
export async function complete({ system, prompt, images, json = true, maxTokens, effort }) {
  const s = llmSettings();
  let text;
  if (s.provider === 'claude') {
    if (!s.claudeKey) throw new Error('Informe a chave da Claude API em Configurações › Esteira Automática.');
    text = await callClaude(s, { system, prompt: json ? `${prompt}\n\nResponda apenas com JSON válido.` : prompt, images, maxTokens, effort });
  } else if (s.provider === 'ollama') {
    text = await callOllama(s, { system, prompt, images, json });
  } else {
    throw new Error('Nenhuma LLM configurada.');
  }
  return json ? parseJson(text) : text;
}

export async function testLlm() {
  const t0 = Date.now();
  const r = await complete({ system: 'Você responde em português do Brasil.', prompt: 'Responda {"ok": true, "frase": "<uma frase curta de boas-vindas para uma revenda de carros>"}', maxTokens: 2000, effort: 'low' });
  return { ok: true, ms: Date.now() - t0, sample: r.frase || JSON.stringify(r) };
}

const COPY_SYSTEM = `Você é o redator de anúncios de uma agência de tráfego pago para revendas de veículos no Brasil.
Escreve anúncios de Facebook/Instagram que levam a conversa para o WhatsApp.
Regras: português do Brasil; imite o estilo, o tamanho, os emojis e a estrutura dos exemplos do próprio cliente;
use somente dados do veículo informados (nunca invente opcional, preço, km ou condição); não coloque telefone, link nem hashtags;
termine chamando para conversar no WhatsApp quando os exemplos fizerem isso.`;

/**
 * Texto do anúncio no estilo do cliente. `examples` = textos de anúncios que já rodaram nesta conta.
 * Devolve { primaryText, headline, description }.
 */
export async function writeAdCopy({ vehicle, examples = [], clientName, showPrice = true }) {
  const data = {
    veiculo: vehicle.title,
    marca: vehicle.brand,
    modelo: vehicle.model,
    versao: vehicle.version,
    ano: vehicle.year,
    km: vehicle.km ? `${vehicle.km} km` : undefined,
    preco: showPrice && vehicle.price ? `R$ ${Number(vehicle.price).toLocaleString('pt-BR')}` : undefined,
    cor: vehicle.color,
    cambio: vehicle.transmission,
    combustivel: vehicle.fuel,
    opcionais: (vehicle.options || []).slice(0, 12),
    observacoes_do_site: vehicle.description?.slice(0, 600),
  };
  const prompt = `Cliente: ${clientName || 'revenda'}
Exemplos de anúncios que já rodaram para este cliente (copie o estilo):
${examples.slice(0, 4).map((e, i) => `--- Exemplo ${i + 1}\n${e}`).join('\n') || '(sem exemplos — use um estilo direto, com 3 a 5 destaques em lista com emojis)'}

Dados do novo veículo (JSON):
${JSON.stringify(data, null, 1)}

Escreva o anúncio deste veículo. Formato:
{"primaryText": "texto principal", "headline": "título curto (até 40 caracteres)", "description": "descrição curta ou vazio"}`;
  const r = await complete({ system: COPY_SYSTEM, prompt, maxTokens: 8000 });
  return {
    primaryText: String(r.primaryText || r.texto_principal || '').trim(),
    headline: String(r.headline || r.titulo || '').trim().slice(0, 60),
    description: String(r.description || r.descricao || '').trim(),
  };
}

/** Extrai os dados de um veículo do texto de uma página (sites sem leitor próprio). */
export async function extractVehicle(pageText) {
  const r = await complete({
    system: 'Você extrai dados de anúncios de veículos. Responda só com JSON. Use null quando o dado não estiver no texto.',
    prompt: `Texto da página:\n${pageText}\n\nDevolva {"title": "marca modelo versão ano", "brand", "model", "version", "year", "km": "45.000", "price": número em reais sem pontos, "color", "fuel", "transmission", "options": [até 12 opcionais], "description": "observações do anúncio"}`,
    maxTokens: 4000,
  });
  if (typeof r.price === 'string') r.price = Number(r.price.replace(/[^\d,]/g, '').replace(',', '.')) || null;
  return r;
}

/** Com imagens das páginas de um design do Canva, aponta quais mostram o veículo (Claude ou modelo local com visão). */
export async function matchCanvaPages({ vehicleTitle, pages }) {
  const r = await complete({
    system: 'Você analisa artes de anúncios de veículos. Responda só com JSON.',
    prompt: `As imagens a seguir são páginas de um design do Canva, na ordem: ${pages.map((p) => `página ${p.index}`).join(', ')}.
Quais páginas são a arte do veículo "${vehicleTitle}"? Considere marca, modelo, versão e ano escritos na arte.
Devolva {"pages": [números das páginas], "confidence": "alta|media|baixa"}. Se nenhuma, {"pages": []}.`,
    images: pages.map((p) => ({ mediaType: p.mediaType, base64: p.base64 })),
    maxTokens: 2000,
    effort: 'low',
  });
  return { pages: (r.pages || []).map(Number).filter(Number.isFinite), confidence: r.confidence || 'baixa' };
}

/**
 * Foto de capa pela visão do Claude: recebe a folha de contato numerada (miniaturas da pasta do carro) e devolve o
 * índice da foto em 3/4 de frente com o carro inteiro (e o painel da loja ao fundo), ou null.
 */
export async function pickCoverPhoto({ sheet, count, store }) {
  const text = await complete({
    system: 'Você escolhe a foto principal de anúncios de carros. Responda só com o número pedido.',
    prompt: `A imagem é uma folha de contato com ${count} fotos de um carro, numeradas de 0 a ${count - 1} (número no canto superior esquerdo).
Escolha o índice da foto em 3/4 frontal, com o carro inteiro${store ? ` e o painel ${store} visível ao fundo` : ' e o painel/letreiro da loja visível ao fundo, se houver'}.
Evite traseira, lateral pura, interior, detalhes (roda, painel do carro) e fotos em que o carro esteja cortado.
Responda só o número.`,
    images: [{ mediaType: 'image/jpeg', base64: sheet.toString('base64') }],
    json: false,
    maxTokens: 2000,
    effort: 'low',
  });
  const n = Number(String(text).match(/\d+/)?.[0]);
  return Number.isInteger(n) && n >= 0 && n < count ? n : null;
}
