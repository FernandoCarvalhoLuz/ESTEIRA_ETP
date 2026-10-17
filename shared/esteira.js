// Regras da Esteira de Campanha compartilhadas entre servidor (Node) e interface (Vite):
// estrutura padrão, validação por etapa e montagem dos payloads da Marketing API.

export const STEPS = [
  { key: 'modelo', label: 'Conta e modelo', short: 'Modelo' },
  { key: 'oferta', label: 'Oferta', short: 'Oferta' },
  { key: 'destino', label: 'Destino no WhatsApp', short: 'Destino' },
  { key: 'publico', label: 'Público', short: 'Público' },
  { key: 'orcamento', label: 'Orçamento', short: 'Orçamento' },
  { key: 'criativos', label: 'Criativos', short: 'Criativos' },
  { key: 'revisao', label: 'Revisão e publicação', short: 'Revisão' },
];

export const WHATSAPP_LINK = 'https://api.whatsapp.com/send';

// Objetivos liberados — sempre com destino WhatsApp (Apps de mensagem), como no Gerenciador.
export const OBJECTIVES = [
  { key: 'OUTCOME_ENGAGEMENT', label: 'Engajamento', tag: 'ENGAJAMENTO', hint: 'Conversas no WhatsApp com o menor custo.', goals: ['CONVERSATIONS', 'LINK_CLICKS'] },
  { key: 'OUTCOME_LEADS', label: 'Leads', tag: 'LEADS', hint: 'A Meta procura pessoas com mais chance de virar contato qualificado.', goals: ['CONVERSATIONS'] },
  { key: 'OUTCOME_SALES', label: 'Vendas', tag: 'VENDAS', hint: 'A Meta procura pessoas com mais chance de comprar.', goals: ['CONVERSATIONS'] },
];
export const objectiveOf = (config) => OBJECTIVES.find((o) => o.key === config?.objective) || OBJECTIVES[0];

// Opções com os mesmos nomes usados na criação de campanha do Gerenciador de Anúncios.
export const PERFORMANCE_GOALS = [
  ['CONVERSATIONS', 'Maximizar o número de conversas'],
  ['LINK_CLICKS', 'Maximizar o número de cliques no link'],
];
export const BID_STRATEGIES = [
  ['LOWEST_COST_WITHOUT_CAP', 'Volume mais alto', 'Gasta todo o orçamento buscando o maior número de conversas.'],
  ['COST_CAP', 'Meta de custo por resultado', 'Tenta manter o custo médio por conversa perto do valor definido.'],
  ['LOWEST_COST_WITH_BID_CAP', 'Limite de lance', 'Define o lance máximo em cada leilão.'],
];
export const PLACEMENTS = [
  { key: 'facebook:feed', platform: 'facebook', position: 'feed', label: 'Feed do Facebook', group: 'Feeds' },
  { key: 'instagram:stream', platform: 'instagram', position: 'stream', label: 'Feed do Instagram', group: 'Feeds' },
  { key: 'facebook:marketplace', platform: 'facebook', position: 'marketplace', label: 'Marketplace do Facebook', group: 'Feeds' },
  { key: 'facebook:profile_feed', platform: 'facebook', position: 'profile_feed', label: 'Feed de perfil do Facebook', group: 'Feeds' },
  { key: 'instagram:profile_feed', platform: 'instagram', position: 'profile_feed', label: 'Feed de perfil do Instagram', group: 'Feeds' },
  { key: 'facebook:story', platform: 'facebook', position: 'story', label: 'Stories do Facebook', group: 'Stories e Reels' },
  { key: 'instagram:story', platform: 'instagram', position: 'story', label: 'Stories do Instagram', group: 'Stories e Reels' },
  { key: 'facebook:facebook_reels', platform: 'facebook', position: 'facebook_reels', label: 'Reels do Facebook', group: 'Stories e Reels' },
  { key: 'instagram:reels', platform: 'instagram', position: 'reels', label: 'Reels do Instagram', group: 'Stories e Reels' },
  { key: 'facebook:search', platform: 'facebook', position: 'search', label: 'Resultados de pesquisa do Facebook', group: 'Pesquisa' },
];

// Tipos de local da busca do Gerenciador (país, estado, cidade, bairro, CEP…) e o campo de targeting de cada um.
export const LOCATION_TYPES = {
  country: { label: 'País', field: 'countries' },
  region: { label: 'Estado', field: 'regions' },
  city: { label: 'Cidade', field: 'cities', radius: { min: 17, max: 80, optional: true } },
  subcity: { label: 'Distrito', field: 'subcities' },
  neighborhood: { label: 'Bairro', field: 'neighborhoods' },
  zip: { label: 'CEP', field: 'zips' },
  geo_market: { label: 'Mercado (DMA)', field: 'geo_markets' },
  place: { label: 'Local', field: 'places', radius: { min: 1, max: 80 } },
  address: { label: 'Endereço', field: 'custom_locations', radius: { min: 1, max: 80 } },
};
export const LOCATION_AUDIENCES = [
  ['home,recent', 'Pessoas que moram ou estiveram recentemente nesse local'],
  ['home', 'Pessoas que moram nesse local'],
  ['recent', 'Pessoas que estiveram recentemente nesse local'],
  ['travel_in', 'Pessoas viajando para esse local'],
];
export const CITY_RADIUS = LOCATION_TYPES.city.radius;
export const ADDRESS_RADIUS = LOCATION_TYPES.address.radius;
export const TIMEZONE_OFFSET = '-0300'; // America/Sao_Paulo (sem horário de verão desde 2019)

// Dispositivos (Gerenciador: Posicionamentos → Dispositivos e sistemas operacionais específicos).
export const DEVICE_PRESETS = [
  { key: 'iphone16', label: 'Apenas iPhone 16+', devices: ['iphone 16', 'iphone 16 plus', 'iphone 16 pro', 'iphone 16 pro max', 'iphone 16e', 'iphone 17', 'iphone 17 pro', 'iphone 17 pro max'] },
  { key: 'iphone15pro', label: 'iPhone 15 Pro+', devices: ['iphone 15 pro', 'iphone 15 pro max', 'iphone 16', 'iphone 16 plus', 'iphone 16 pro', 'iphone 16 pro max', 'iphone 16e', 'iphone 17', 'iphone 17 pro', 'iphone 17 pro max'] },
];

// Critério para sugerir uma campanha como modelo.
export const CANDIDATE_RULE = { minConversations: 15, maxRatioToAverage: 0.9 };

const REMOVED_PLACEMENTS = {
  facebook_positions: ['video_feeds'],
  instagram_positions: ['explore', 'explore_home'],
  messenger_positions: ['story'],
};

export function rid() {
  return globalThis.crypto.randomUUID();
}

export function newDevices() {
  // platforms vazio = todos os dispositivos; os '' = todos os sistemas.
  return { platforms: [], os: '', osMin: '', include: [], exclude: [] };
}

export function newAdset(name = 'TESTE 01 - ABERTO') {
  return {
    key: rid(),
    name,
    amount: 20,
    geo: { locations: [] },
    locationTypes: ['home', 'recent'],
    ageMin: 25,
    ageMax: 65,
    genders: [],
    interests: [],
    advantageAudience: false,
    customAudiences: [],
    excludedAudiences: [],
    devices: newDevices(),
    placements: 'auto', // 'auto' = Posicionamentos Advantage+; ou lista de chaves de PLACEMENTS
    extraTargeting: {},
  };
}

export function newAd() {
  // source 'new' = criar anúncio (media = feed, storyMedia = 9:16 opcional); 'existing' = usar publicação existente (post).
  // offer (opcional) = item próprio deste anúncio, usado quando a campanha tem vários carros.
  // adsetKeys (opcional) = conjuntos que recebem este anúncio; vazio = todos.
  return { key: rid(), name: '{OFERTA}', source: 'new', post: null, media: null, storyMedia: null, primaryText: '', headline: '', description: '', offer: null, adsetKeys: null };
}

export function newConfig(accountId = '') {
  return {
    accountId,
    objective: 'OUTCOME_ENGAGEMENT',
    offer: { title: '', price: '', priceValue: null, km: '', year: '' },
    naming: { campaign: '[{OFERTA}] [ENGAJAMENTO] [MENSAGEM] [WHATSAPP]' },
    destination: {
      pageId: '',
      pageName: '',
      instagramId: '',
      instagramUsername: '',
      whatsappNumber: '',
      greeting: 'Olá! Que bom ter você por aqui. Como podemos ajudar?',
      autofill: 'Olá! Tenho interesse no {oferta}. Pode me passar mais informações?',
    },
    performanceGoal: 'CONVERSATIONS',
    budget: { level: 'campaign', type: 'daily', amount: 30, startDate: null, endDate: null, bidStrategy: 'LOWEST_COST_WITHOUT_CAP', costCap: null },
    adsets: [newAdset()],
    ads: [newAd()],
    publish: { status: 'PAUSED' },
  };
}

// ---------------------------------------------------------------- Compatibilidade com rascunhos/modelos antigos

function upgradeGeo(geo) {
  if (geo?.locations) return geo;
  const locations = [];
  if (geo?.mode === 'address' && geo.address) {
    const a = geo.address;
    locations.push({ type: 'address', key: `pin:${a.latitude},${a.longitude}`, name: a.label || 'Endereço', latitude: a.latitude, longitude: a.longitude, radius: a.radius || 20 });
  } else {
    for (const c of geo?.cities || []) locations.push({ type: 'city', key: String(c.key), name: c.name, region: c.region, radius: c.radius ?? 40 });
  }
  return { locations };
}

/** Atualiza configurações salvas em versões anteriores para o formato atual (não altera o original). */
export function normalizeConfig(config) {
  if (!config) return config;
  const c = JSON.parse(JSON.stringify(config));
  c.objective ||= 'OUTCOME_ENGAGEMENT';
  c.offer = { title: '', price: '', priceValue: null, km: '', year: '', ...(c.offer || {}) };
  c.adsets = (c.adsets || []).map((a) => ({ ...newAdset(a.name), ...a, geo: upgradeGeo(a.geo), devices: { ...newDevices(), ...(a.devices || {}) } }));
  c.ads = (c.ads || []).map((ad) => ({ ...newAd(), ...ad, source: ad.source || 'new' }));
  return c;
}

// ---------------------------------------------------------------- Textos e variáveis

/** Preço como aparece nos textos: "R$ 119.900" (centavos só quando existem). */
export function fmtPrice(value) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '';
  const n = Number(value);
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function firstCity(config) {
  const locs = upgradeGeo(config.adsets?.[0]?.geo).locations;
  const city = locs.find((l) => !l.excluded && (l.type === 'city' || l.type === 'address' || l.type === 'place')) || locs.find((l) => !l.excluded);
  return city?.name || '';
}

/** Item usado nas variáveis de um anúncio: o próprio (campanha com vários carros) ou o da campanha. */
export function offerFor(config, ad) {
  return ad?.offer?.title ? ad.offer : config.offer || {};
}

export function applyPlaceholders(text, config, ad) {
  if (!text) return '';
  const o = offerFor(config, ad);
  const offer = o.title?.trim() || '';
  const price = o.price?.trim() || fmtPrice(o.priceValue);
  return text
    .replace(/\{OFERTA\}/g, offer.toUpperCase())
    .replace(/\{oferta\}/gi, offer)
    .replace(/\{preco\}|\{preço\}/gi, price)
    .replace(/\{km\}/gi, o.km ? String(o.km) : '')
    .replace(/\{ano\}/gi, o.year ? String(o.year) : '')
    .replace(/\{cidade\}/gi, firstCity(config))
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function campaignName(config) {
  return applyPlaceholders(config.naming?.campaign || '{OFERTA}', config) || 'Nova campanha';
}

export const toMinor = (amount) => Math.round(Number(amount || 0) * 100);

export function isTemplateCandidate(metrics, accountMetrics) {
  if (!metrics || !accountMetrics) return false;
  const avg = accountMetrics.costPerConversation;
  return metrics.conversations >= CANDIDATE_RULE.minConversations
    && metrics.costPerConversation != null
    && avg != null
    && metrics.costPerConversation <= avg * CANDIDATE_RULE.maxRatioToAverage;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Troca as menções ao item do modelo por variáveis ({OFERTA}/{oferta}/{preco}) para reaproveitar os textos. */
export function tokenizeText(text, offerTitle, price) {
  if (!text) return text;
  let out = text;
  const title = offerTitle?.trim();
  if (title && title.length > 2 && !/oferta/i.test(title)) {
    out = out.replace(new RegExp(escapeRe(title), 'gi'), (m) => (m === m.toUpperCase() && /[A-Z]/.test(m) ? '{OFERTA}' : '{oferta}'));
  }
  const p = price?.trim();
  if (p && p.length > 3) out = out.replace(new RegExp(escapeRe(p), 'g'), '{preco}');
  return out;
}

const GENERIC_WORDS = new Set(['FLEX', 'AUT', 'AUT.', 'MEC', 'TURBO', 'TB', 'DIESEL', 'GASOLINA', 'HÍBRIDO', 'HIBRIDO', 'COM', 'KM', 'PLUS', 'SPORT', 'CD', 'CS', '4X2', '4X4', 'V8', 'V6',
  'AUTOMATICO', 'AUTOMÁTICO', 'MANUAL', 'FLEXPOWER', 'FLEXONE', 'TOTALFLEX', 'TODOS', 'OS', 'AS', 'CARROS', 'VEICULOS', 'VEÍCULOS', 'DE', 'DA', 'DO', 'E']);

const carWords = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .split(/[^A-Z0-9.]+/).filter((w) => w.length >= 2 && !GENERIC_WORDS.has(w) && !/^(19|20)\d\d$/.test(w));

/**
 * Linhas curtas que citam o carro (ex.: "🚘 CHEVROLET MONTANA LTZ 1.2 TURBO FLEX 2025") viram {OFERTA}, mesmo
 * escritas um pouco diferente do nome do modelo. Mantém o emoji/marcador do começo da linha.
 */
export function tokenizeTitleLines(text, title) {
  const want = [...new Set(carWords(title))];
  if (!text || want.length < 2 || /oferta/i.test(title)) return text;
  return text.split('\n').map((line) => {
    if (line.length > 90 || /\{oferta\}/i.test(line)) return line;
    const have = new Set(carWords(line));
    if (want.filter((w) => have.has(w)).length / want.length < 0.6) return line;
    const lead = line.match(/^[^A-Za-zÀ-ú0-9]*/)[0];
    const body = line.slice(lead.length);
    return lead + (body === body.toUpperCase() ? '{OFERTA}' : '{oferta}');
  }).join('\n');
}

/** Palavras do item antigo que continuam nos textos depois da troca (ex.: versão escrita diferente). */
export function leftoverMentions(config, oldTitle) {
  const words = [...new Set(carWords(oldTitle).filter((w) => w.length >= 3 && !/^\d+(\.\d+)?$/.test(w)))];
  if (!words.length) return [];
  const texts = [
    config.destination?.greeting, config.destination?.autofill,
    ...config.adsets.map((a) => a.name),
    ...config.ads.flatMap((a) => [a.name, a.primaryText, a.headline, a.description]),
  ].filter(Boolean).join('\n').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  return words.filter((w) => new RegExp(`(^|[^A-Z0-9])${escapeRe(w)}([^A-Z0-9]|$)`).test(texts));
}

/**
 * Prepara a configuração de um modelo para um novo item: troca o item antigo pelas variáveis em todos os textos,
 * aplica o novo item e limpa as mídias (que eram do carro antigo). Modelos com vários carros viram um anúncio só.
 */
export function retargetConfig(config, offer) {
  const c = normalizeConfig(config);
  const oldTitle = c.offer.title;
  const oldPrice = c.offer.price;
  const tk = (t) => tokenizeText(t, oldTitle, oldPrice);
  c.naming.campaign = tk(c.naming.campaign);
  c.destination.greeting = tk(c.destination.greeting);
  c.destination.autofill = tk(c.destination.autofill);
  c.adsets = c.adsets.map((a) => ({ ...a, name: tk(a.name) }));
  const distinct = new Set(c.ads.map((a) => a.offer?.title || a.name));
  const collapsed = distinct.size > 1;
  const ads = collapsed ? [c.ads[0]] : c.ads;
  // Em modelos com vários carros, o carro de cada anúncio está no nome dele (ou em ad.offer).
  const oldCars = [oldTitle, ...ads.map((a) => a.offer?.title || (collapsed ? a.name : null))].filter(Boolean);
  const swap = (text, a) => {
    let t = tk(text);
    const car = a.offer?.title || (collapsed ? a.name : null);
    if (car) t = tokenizeText(t, car, a.offer?.price);
    for (const title of oldCars) t = tokenizeTitleLines(t, title);
    return t;
  };
  c.ads = ads.map((a) => ({
    ...a,
    key: rid(),
    name: a.offer?.title || collapsed ? '{OFERTA}' : tk(a.name),
    primaryText: swap(a.primaryText, a),
    headline: swap(a.headline, a),
    description: swap(a.description, a),
    source: 'new',
    post: null,
    media: null,
    storyMedia: null,
    offer: null,
    adsetKeys: null,
  }));
  c.destination.greeting = oldCars.reduce((t, title) => tokenizeTitleLines(tokenizeText(t, title), title), c.destination.greeting);
  c.destination.autofill = oldCars.reduce((t, title) => tokenizeText(t, title), c.destination.autofill);
  c.offer = { title: '', price: '', priceValue: null, km: '', year: '', ...offer };
  const leftovers = [...new Set(oldCars.flatMap((title) => leftoverMentions(c, title)))];
  return { config: c, leftovers, oldCars, collapsedAds: collapsed ? distinct.size : 0 };
}

// ---------------------------------------------------------------- Validação

/** Valida a configuração. Retorna { [etapa]: [mensagens] } apenas com etapas que têm problemas. */
export function validateConfig(rawConfig, ctx = {}) {
  const config = normalizeConfig(rawConfig);
  const issues = {};
  const add = (step, msg) => (issues[step] ||= []).push(msg);

  if (!config.accountId) add('modelo', 'Escolha a conta de anúncio.');

  if (!config.offer?.title?.trim()) add('oferta', 'Diga o que será anunciado (veículo ou oferta).');
  if (!config.naming?.campaign?.trim()) add('oferta', 'Defina o padrão de nome da campanha.');

  const d = config.destination || {};
  if (!d.pageId) add('destino', 'Escolha a página do Facebook.');
  if (d.whatsappNumber && !/^\d{10,15}$/.test(d.whatsappNumber)) add('destino', 'Número de WhatsApp deve ter só dígitos, com DDI e DDD (ex.: 5548999990000).');
  if (!d.greeting?.trim()) add('destino', 'Escreva a mensagem de boas-vindas.');
  if (!d.autofill?.trim()) add('destino', 'Escreva a mensagem que o cliente envia.');

  if (!config.adsets?.length) add('publico', 'Crie pelo menos um conjunto de anúncios.');
  for (const [i, a] of (config.adsets || []).entries()) {
    const label = a.name?.trim() || `Conjunto ${i + 1}`;
    if (!a.name?.trim()) add('publico', `Conjunto ${i + 1}: dê um nome.`);
    const included = a.geo.locations.filter((l) => !l.excluded);
    if (!included.length) add('publico', `${label}: adicione pelo menos um local.`);
    for (const l of a.geo.locations) {
      const r = LOCATION_TYPES[l.type]?.radius;
      if (!r) continue;
      if (r.optional && !l.radius) continue;
      if (!(l.radius >= r.min && l.radius <= r.max)) add('publico', `${label}: o raio de ${l.name} deve ficar entre ${r.min} e ${r.max} km.`);
    }
    if (a.ageMin < 18 || a.ageMax > 65 || a.ageMin > a.ageMax) add('publico', `${label}: faixa de idade inválida.`);
    if (a.advantageAudience && a.ageMin > 25) add('publico', `${label}: com público Advantage+ a idade mínima precisa ser até 25.`);
    if ((a.devices.include.length || a.devices.os) && a.devices.platforms.includes('desktop')) add('publico', `${label}: sistemas e aparelhos específicos só valem para celular.`);
    if (Array.isArray(a.placements)) {
      if (!a.placements.length) add('publico', `${label}: escolha pelo menos um posicionamento.`);
      else if (!a.placements.some((p) => p.startsWith('facebook:'))) add('publico', `${label}: a Meta exige pelo menos um posicionamento do Facebook nos posicionamentos manuais.`);
    }
  }

  const b = config.budget || {};
  const min = ctx.minDailyBudget || 5;
  if (b.level === 'campaign') {
    if (!(b.amount > 0)) add('orcamento', 'Informe o valor do orçamento.');
    else if (b.type === 'daily' && b.amount < min) add('orcamento', `O orçamento diário mínimo desta conta é R$ ${min.toFixed(2).replace('.', ',')}.`);
  } else {
    for (const a of config.adsets || []) {
      if (!(a.amount > 0)) add('orcamento', `Informe o orçamento do conjunto "${a.name}".`);
      else if (b.type === 'daily' && a.amount < min) add('orcamento', `Orçamento de "${a.name}" abaixo do mínimo (R$ ${min.toFixed(2).replace('.', ',')}).`);
    }
  }
  if (b.type === 'lifetime' && !b.endDate) add('orcamento', 'Orçamento total exige data de término.');
  if (b.startDate && b.endDate && b.endDate < b.startDate) add('orcamento', 'A data de término deve ser depois do início.');
  if (b.bidStrategy === 'COST_CAP' && !(b.costCap > 0)) add('orcamento', 'Informe a meta de custo por resultado.');
  if (b.bidStrategy === 'LOWEST_COST_WITH_BID_CAP' && !(b.costCap > 0)) add('orcamento', 'Informe o limite de lance.');

  if (!config.ads?.length) add('criativos', 'Adicione pelo menos um anúncio.');
  const adsetKeys = new Set(config.adsets.map((a) => a.key));
  for (const [i, ad] of (config.ads || []).entries()) {
    const label = `Anúncio ${i + 1}`;
    if (ad.adsetKeys?.length && !ad.adsetKeys.some((k) => adsetKeys.has(k))) add('criativos', `${label}: não está em nenhum conjunto.`);
    if (ad.source === 'existing') {
      if (!ad.post) add('criativos', `${label}: escolha a publicação existente.`);
      if (ad.post?.platform === 'instagram' && !config.destination.instagramId) add('criativos', `${label}: a página escolhida não tem Instagram conectado.`);
      continue;
    }
    if (!ad.media) add('criativos', `${label}: escolha uma imagem ou vídeo.`);
    if (ad.storyMedia && (ad.media?.kind !== 'image' || ad.storyMedia.kind !== 'image')) add('criativos', `${label}: a versão para stories só funciona com imagem no feed e no stories.`);
    if (!ad.primaryText?.trim()) add('criativos', `${label}: escreva o texto principal.`);
  }
  return issues;
}

export function isComplete(config, ctx) {
  return Object.keys(validateConfig(config, ctx)).length === 0;
}

/** Anúncios que entram em cada conjunto (respeita "1 conjunto por carro"). */
export function adsForAdset(config, adset) {
  return config.ads.filter((ad) => !ad.adsetKeys?.length || ad.adsetKeys.includes(adset.key));
}

export function totalAds(config) {
  return config.adsets.reduce((s, a) => s + adsForAdset(config, a).length, 0);
}

// ---------------------------------------------------------------- Targeting

function cleanPlacements(t) {
  for (const [field, removed] of Object.entries(REMOVED_PLACEMENTS)) {
    if (Array.isArray(t[field])) {
      t[field] = t[field].filter((p) => !removed.includes(p));
      if (!t[field].length) delete t[field];
    }
  }
}

function geoSpec(locations) {
  const spec = {};
  const push = (field, value) => (spec[field] ||= []).push(value);
  for (const l of locations) {
    const type = LOCATION_TYPES[l.type];
    if (!type) continue;
    if (l.type === 'country') push('countries', String(l.key));
    else if (l.type === 'address') push('custom_locations', { latitude: l.latitude, longitude: l.longitude, radius: l.radius, distance_unit: 'kilometer', ...(l.name ? { name: l.name } : {}) });
    else if (type.radius && l.radius) push(type.field, { key: String(l.key), radius: l.radius, distance_unit: 'kilometer' });
    else push(type.field, { key: String(l.key) });
  }
  return spec;
}

export function buildTargeting(rawAdset) {
  const adset = { ...rawAdset, geo: upgradeGeo(rawAdset.geo), devices: { ...newDevices(), ...(rawAdset.devices || {}) } };
  const t = JSON.parse(JSON.stringify(adset.extraTargeting || {}));
  const locations = adset.geo.locations;
  t.geo_locations = { ...geoSpec(locations.filter((l) => !l.excluded)), location_types: adset.locationTypes?.length ? adset.locationTypes : ['home', 'recent'] };
  const excluded = geoSpec(locations.filter((l) => l.excluded));
  if (Object.keys(excluded).length) t.excluded_geo_locations = excluded;
  else delete t.excluded_geo_locations;
  t.age_min = adset.ageMin;
  t.age_max = adset.ageMax;
  if (adset.genders?.length) t.genders = adset.genders;
  else delete t.genders;
  // flexibleExtra guarda segmentações detalhadas vindas de modelos (comportamentos etc.) que a interface não edita.
  const flexExtra = adset.flexibleExtra && Object.keys(adset.flexibleExtra).length ? adset.flexibleExtra : null;
  if (adset.interests?.length || flexExtra) {
    t.flexible_spec = [{
      ...(flexExtra || {}),
      ...(adset.interests?.length ? { interests: adset.interests.map((i) => ({ id: String(i.id), name: i.name })) } : {}),
    }];
  } else {
    delete t.flexible_spec;
  }
  if (adset.customAudiences?.length) t.custom_audiences = adset.customAudiences.map((a) => ({ id: String(a.id) }));
  else delete t.custom_audiences;
  if (adset.excludedAudiences?.length) t.excluded_custom_audiences = adset.excludedAudiences.map((a) => ({ id: String(a.id) }));
  else delete t.excluded_custom_audiences;
  t.targeting_automation = { ...(t.targeting_automation || {}), advantage_audience: adset.advantageAudience ? 1 : 0 };

  for (const key of ['device_platforms', 'user_os', 'user_device', 'excluded_user_device']) delete t[key];
  const dev = adset.devices;
  const mobileOnly = dev.os || dev.include.length || dev.exclude.length;
  const platforms = mobileOnly ? ['mobile'] : dev.platforms;
  if (platforms.length === 1) t.device_platforms = platforms;
  if (dev.os) t.user_os = [dev.osMin ? `${dev.os}_ver_${dev.osMin}_and_above` : dev.os];
  if (dev.include.length) t.user_device = dev.include;
  if (dev.exclude.length) t.excluded_user_device = dev.exclude;

  for (const key of ['publisher_platforms', 'facebook_positions', 'instagram_positions', 'messenger_positions', 'audience_network_positions']) delete t[key];
  if (Array.isArray(adset.placements) && adset.placements.length) {
    const chosen = PLACEMENTS.filter((p) => adset.placements.includes(p.key));
    t.publisher_platforms = [...new Set(chosen.map((p) => p.platform))];
    const fb = chosen.filter((p) => p.platform === 'facebook').map((p) => p.position);
    const ig = chosen.filter((p) => p.platform === 'instagram').map((p) => p.position);
    if (fb.length) t.facebook_positions = fb;
    if (ig.length) t.instagram_positions = ig;
  }
  cleanPlacements(t);
  return t;
}

/** Lê um targeting da Meta de volta para os campos da Esteira (locais, idade, dispositivos, públicos…). */
export function parseGeo(t = {}) {
  const locations = [];
  const read = (geo, excluded) => {
    for (const k of geo?.countries || []) locations.push({ type: 'country', key: k, name: k === 'BR' ? 'Brasil' : k, excluded });
    for (const [type, def] of Object.entries(LOCATION_TYPES)) {
      if (type === 'country' || type === 'address') continue;
      for (const item of geo?.[def.field] || []) {
        const km = item.radius ? Math.round(item.distance_unit === 'mile' ? item.radius * 1.609 : item.radius) : 0;
        locations.push({ type, key: String(item.key), name: item.name || item.key, region: item.region || '', radius: def.radius ? (def.radius.optional && !km ? 0 : Math.min(def.radius.max, Math.max(def.radius.min, km || def.radius.min))) : undefined, excluded });
      }
    }
    for (const c of geo?.custom_locations || []) {
      const km = Math.round(c.distance_unit === 'mile' ? c.radius * 1.609 : c.radius || 20);
      locations.push({ type: 'address', key: `pin:${c.latitude},${c.longitude}`, name: c.name || c.address_string || `${Number(c.latitude).toFixed(4)}, ${Number(c.longitude).toFixed(4)}`, latitude: c.latitude, longitude: c.longitude, radius: Math.min(80, Math.max(1, km)), excluded });
    }
  };
  read(t.geo_locations, false);
  read(t.excluded_geo_locations, true);
  return { locations };
}

export function parseDevices(t = {}) {
  const dev = newDevices();
  if (t.device_platforms?.length === 1) dev.platforms = [...t.device_platforms];
  const os = t.user_os?.[0];
  const m = os && String(os).match(/^(iOS|Android)(?:_ver_([\d.]+)_and_above)?/i);
  if (m) {
    dev.os = m[1].toLowerCase() === 'ios' ? 'iOS' : 'Android';
    dev.osMin = m[2] || '';
  }
  dev.include = [...(t.user_device || [])];
  dev.exclude = [...(t.excluded_user_device || [])];
  return dev;
}

// ---------------------------------------------------------------- Payloads

export function campaignPayload(config) {
  const b = config.budget;
  const p = {
    name: campaignName(config),
    objective: objectiveOf(config).key,
    status: 'PAUSED',
    special_ad_categories: [],
    buying_type: 'AUCTION',
  };
  if (b.level === 'campaign') {
    p.bid_strategy = b.bidStrategy;
    p[b.type === 'lifetime' ? 'lifetime_budget' : 'daily_budget'] = toMinor(b.amount);
  } else {
    p.is_adset_budget_sharing_enabled = false;
  }
  return p;
}

export function adsetPayload(config, adset, campaignId) {
  const b = config.budget;
  const d = config.destination;
  const goals = objectiveOf(config).goals;
  const p = {
    name: applyPlaceholders(adset.name.trim(), config) || adset.name.trim(),
    campaign_id: campaignId,
    status: 'ACTIVE',
    optimization_goal: goals.includes(config.performanceGoal) ? config.performanceGoal : goals[0],
    billing_event: 'IMPRESSIONS',
    destination_type: 'WHATSAPP',
    promoted_object: { page_id: d.pageId, ...(d.whatsappNumber ? { whatsapp_phone_number: d.whatsappNumber } : {}) },
    targeting: buildTargeting(adset),
  };
  if (b.startDate) p.start_time = `${b.startDate}T00:00:00${TIMEZONE_OFFSET}`;
  if (b.endDate) p.end_time = `${b.endDate}T23:59:59${TIMEZONE_OFFSET}`;
  if (b.level === 'adset') {
    p.bid_strategy = b.bidStrategy;
    p[b.type === 'lifetime' ? 'lifetime_budget' : 'daily_budget'] = toMinor(adset.amount);
  }
  if ((b.bidStrategy === 'COST_CAP' || b.bidStrategy === 'LOWEST_COST_WITH_BID_CAP') && b.costCap) p.bid_amount = toMinor(b.costCap);
  return p;
}

export function welcomeMessage(config, ad) {
  const d = config.destination;
  return JSON.stringify({
    type: 'VISUAL_EDITOR',
    version: 2,
    landing_screen_type: 'welcome_message',
    media_type: 'text',
    text_format: {
      customer_action_type: 'autofill_message',
      message: {
        text: applyPlaceholders(d.greeting, config, ad),
        autofill_message: { content: applyPlaceholders(d.autofill, config, ad) },
      },
    },
  });
}

export function adName(config, ad, index) {
  return applyPlaceholders(ad.name || '{OFERTA}', config, ad) || `Anúncio ${index + 1}`;
}

const FEED_POSITIONS = { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed', 'marketplace', 'search', 'profile_feed'], instagram_positions: ['stream', 'profile_feed'] };
const STORY_POSITIONS = { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] };
const WHATSAPP_CTA = { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP', link: WHATSAPP_LINK } };

/** Criativo com arte de feed (4:5) e de stories (9:16), no mesmo formato que o Gerenciador de Anúncios usa. */
function placementCreative(config, ad, index, media, storyMedia) {
  const d = config.destination;
  const headline = applyPlaceholders(ad.headline, config, ad);
  const description = applyPlaceholders(ad.description, config, ad);
  const labels = {
    body_label: { name: 'texto' },
    link_url_label: { name: 'link' },
    ...(headline ? { title_label: { name: 'titulo' } } : {}),
    ...(description ? { description_label: { name: 'descricao' } } : {}),
  };
  return {
    name: adName(config, ad, index),
    object_story_spec: { page_id: d.pageId, ...(d.instagramId ? { instagram_user_id: d.instagramId } : {}) },
    asset_feed_spec: {
      images: [
        { hash: media.imageHash, adlabels: [{ name: 'feed' }] },
        { hash: storyMedia.imageHash, adlabels: [{ name: 'stories' }] },
      ],
      bodies: [{ text: applyPlaceholders(ad.primaryText, config, ad), adlabels: [{ name: 'texto' }] }],
      ...(headline ? { titles: [{ text: headline, adlabels: [{ name: 'titulo' }] }] } : {}),
      ...(description ? { descriptions: [{ text: description, adlabels: [{ name: 'descricao' }] }] } : {}),
      link_urls: [{ website_url: WHATSAPP_LINK, adlabels: [{ name: 'link' }] }],
      call_to_action_types: ['WHATSAPP_MESSAGE'],
      ad_formats: ['SINGLE_IMAGE'],
      optimization_type: 'PLACEMENT',
      asset_customization_rules: [
        { customization_spec: FEED_POSITIONS, image_label: { name: 'feed' }, ...labels, priority: 1 },
        { customization_spec: STORY_POSITIONS, image_label: { name: 'stories' }, ...labels, priority: 2 },
        { customization_spec: { age_min: 13, age_max: 65 }, image_label: { name: 'feed' }, ...labels, priority: 3 },
      ],
      // Sem `is_click_to_message`: ele marca o Messenger como destino e a Meta recusa o criativo em campanha
      // de WhatsApp ("Criativo inválido para o objetivo", 1487891) — o Gerenciador manda false.
      additional_data: { page_welcome_message: welcomeMessage(config, ad) },
    },
  };
}

/**
 * `media` = { imageHash } para imagem ou { videoId, thumbnailUrl | imageHash } para vídeo.
 * `storyMedia` = { imageHash } da arte vertical (opcional, só com imagem).
 * Anúncio com publicação existente usa o post como está, com o botão do WhatsApp.
 */
export function creativePayload(config, ad, index, media, storyMedia) {
  const d = config.destination;
  if (ad.source === 'existing' && ad.post) {
    if (ad.post.platform === 'instagram') {
      return {
        name: adName(config, ad, index),
        object_id: d.pageId,
        instagram_user_id: d.instagramId,
        source_instagram_media_id: ad.post.id,
        call_to_action: WHATSAPP_CTA,
        page_welcome_message: welcomeMessage(config, ad),
      };
    }
    return { name: adName(config, ad, index), object_story_id: ad.post.id, call_to_action: WHATSAPP_CTA, page_welcome_message: welcomeMessage(config, ad) };
  }
  if (storyMedia && ad.media?.kind === 'image') return placementCreative(config, ad, index, media, storyMedia);
  const message = applyPlaceholders(ad.primaryText, config, ad);
  const headline = applyPlaceholders(ad.headline, config, ad);
  const description = applyPlaceholders(ad.description, config, ad);
  const story = { page_id: d.pageId, ...(d.instagramId ? { instagram_user_id: d.instagramId } : {}) };
  if (ad.media?.kind === 'video') {
    story.video_data = {
      video_id: media.videoId,
      ...(media.imageHash ? { image_hash: media.imageHash } : { image_url: media.thumbnailUrl }),
      message,
      ...(headline ? { title: headline } : {}),
      ...(description ? { link_description: description } : {}),
      call_to_action: WHATSAPP_CTA,
      page_welcome_message: welcomeMessage(config, ad),
    };
  } else {
    story.link_data = {
      link: WHATSAPP_LINK,
      message,
      ...(headline ? { name: headline } : {}),
      ...(description ? { description } : {}),
      image_hash: media.imageHash,
      call_to_action: WHATSAPP_CTA,
      page_welcome_message: welcomeMessage(config, ad),
    };
  }
  return { name: adName(config, ad, index), object_story_spec: story };
}

export function adPayload(config, ad, index, adsetId, creativeId) {
  return { name: adName(config, ad, index), adset_id: adsetId, creative: { creative_id: creativeId }, status: 'ACTIVE' };
}
