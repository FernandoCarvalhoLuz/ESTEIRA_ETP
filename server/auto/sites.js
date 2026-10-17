// Leitura do estoque nos sites dos clientes. Cada plataforma de revenda tem um adaptador; sites desconhecidos
// usam a leitura genérica (links de veículo + dados da página, com LLM quando configurada).

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36';

export const PLATFORMS = {
  litoralcar: 'LitoralCar',
  webmotors: 'Webmotors (site de revenda)',
  autobusiness: 'AutoBusiness',
  generic: 'Leitura genérica',
};

function siteBase(url) {
  const u = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`);
  return `${u.protocol}//${u.host}`;
}

async function fetchText(url, { cookie, method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(url, {
    method,
    redirect: 'follow',
    headers: { 'User-Agent': UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8', 'Accept-Language': 'pt-BR,pt;q=0.9', ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body,
    signal: AbortSignal.timeout(25_000),
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  const text = await res.text();
  if (!res.ok) throw new Error(`O site respondeu ${res.status} para ${url}`);
  return { text, setCookie, url: res.url };
}

const decodeEntities = (s) => String(s ?? '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');

const stripHtml = (html) => decodeEntities(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const toNumber = (v) => {
  if (v == null || v === '') return null;
  const s = String(v).replace(/[^\d,.]/g, '');
  if (!s) return null;
  // "7.300.000,00" → 7300000 | "231000.00" → 231000
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const fmtKm = (v) => {
  const n = toNumber(String(v ?? '').replace(/km/i, '').replace(/\./g, ''));
  return n != null ? n.toLocaleString('pt-BR') : '';
};
/** Preço do veículo na página: o valor "R$" mais repetido acima de R$ 1.000 (ignora entrada, parcelas etc.). */
function pagePrice(body) {
  const counts = new Map();
  for (const m of body.matchAll(/R\$\s*([\d.]+,\d{2})/g)) {
    const n = toNumber(m[1]);
    if (n && n >= 1000) counts.set(n, (counts.get(n) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? null;
}
const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|[\s/-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());

/** Descobre a plataforma do site pelo HTML da página inicial. */
export async function detectPlatform(url) {
  const base = siteBase(url);
  const { text } = await fetchText(base, { cookie: 'plataformacookiecheck=ok' });
  if (/litoralcar\.com\.br|acoes\.php|foto-resize\//i.test(text)) return { base, platform: 'litoralcar' };
  if (/plataformacookiecheck|sitewebmotors|image\.webmotors\.com\.br\/vmotors-images|\/estoque\/veiculo\/\d+\//i.test(text)) return { base, platform: 'webmotors' };
  if (/autobusiness\.com\.br|__next_f/i.test(text) && /\/veiculo\//.test(text)) return { base, platform: 'autobusiness' };
  return { base, platform: 'generic' };
}

// ---------------------------------------------------------------- LitoralCar (ex.: Q3 Motors)

async function litoralcarStock(base) {
  const page = await fetchText(`${base}/estoque`);
  const cookie = page.setCookie.map((c) => c.split(';')[0]).join('; ');
  const { text } = await fetchText(`${base}/acoes.php?acao=pegarEstoque`, {
    method: 'POST',
    cookie,
    headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: `${base}/estoque`, Origin: base, Accept: 'application/json' },
  });
  const data = JSON.parse(text);
  return (data.veiculos || []).filter((v) => v.situacao !== '0').map((v) => {
    const title = [v.marca, v.modelo, v.motor, v.versao].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const photos = (v.fotos || []).map((f) => `${base}/foto-resize/X/${v.cod_veiculo}/${data.cod_loja}/${f}`);
    return {
      id: String(v.cod_veiculo),
      title: `${titleCase(`${v.marca} ${v.modelo}`)} ${v.motor || ''} ${v.versao || ''} ${v.ano || ''}`.replace(/\s+/g, ' ').trim(),
      brand: titleCase(v.marca),
      model: titleCase(v.modelo),
      version: [v.motor, v.versao].filter(Boolean).join(' '),
      year: v.ano || '',
      km: fmtKm(v.km),
      price: v.com_valor === 'nao' ? null : toNumber(v.valor_oferta) || toNumber(v.valor),
      color: v.cor || '',
      fuel: v.combustivel || '',
      transmission: v.cambio === 'auto' ? 'Automático' : v.cambio === 'manual' ? 'Manual' : v.cambio || '',
      category: v.tipo_categoria || v.categoria || '',
      options: (v.opcionais || []).map((o) => o.descricao).filter(Boolean),
      description: (v.obs_site || v.obs || '').trim(),
      photos,
      thumb: photos[0]?.replace('/foto-resize/X/', '/foto-resize/P/') || null,
      url: `${base}/veiculo/${encodeURIComponent(title.toLowerCase().replace(/[^a-z0-9]+/gi, '-'))}/${v.cod_veiculo}`,
      addedAt: v.data_cad ? v.data_cad.replace(' ', 'T') : null,
      fullName: title,
    };
  });
}

// ---------------------------------------------------------------- Webmotors (sites de revenda; ex.: Nandi)

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? decodeEntities(m[1]) : '';
}

async function webmotorsStock(base) {
  const items = new Map();
  for (let page = 1; page <= 12; page++) {
    const url = page === 1 ? `${base}/estoque` : `${base}/estoque?pagina=${page}`;
    let text;
    try {
      ({ text } = await fetchText(url, { cookie: 'plataformacookiecheck=ok' }));
    } catch {
      break;
    }
    const before = items.size;
    const links = new Map([...text.matchAll(/href="(\/estoque\/veiculo\/(\d+)\/[^"]+)"/g)].map((m) => [m[2], `${base}${m[1]}`]));
    for (const tag of text.match(/<[^>]*data-veiculo-km[^>]*>/g) || []) {
      const id = attr(tag, 'data-veiculo');
      if (!id || items.has(id)) continue;
      const brand = titleCase(attr(tag, 'data-veiculo-marca'));
      const model = titleCase(attr(tag, 'data-veiculo-modelo'));
      const version = attr(tag, 'data-veiculo-versao');
      const year = attr(tag, 'data-veiculo-ano');
      items.set(id, {
        id,
        title: `${brand} ${model} ${titleCase(version)} ${year.split('/').pop() || ''}`.replace(/\s+/g, ' ').trim(),
        brand,
        model,
        version,
        year,
        km: fmtKm(attr(tag, 'data-veiculo-km')),
        price: toNumber(attr(tag, 'data-veiculo-preco')),
        color: '',
        fuel: attr(tag, 'data-veiculo-combustivel'),
        transmission: attr(tag, 'data-veiculo-cambio'),
        options: attr(tag, 'data-veiculo-opcionais').split(',').map((s) => s.trim()).filter(Boolean),
        description: attr(tag, 'data-veiculo-observacoes-adicionais'),
        photos: [],
        thumb: null,
        url: links.get(id) || `${base}/estoque`,
        needsDetail: true,
      });
    }
    // Miniaturas na ordem dos cards.
    if (items.size === before) break;
    if (!/pagina=\d+|class="[^"]*pagination/i.test(text)) break;
  }
  return [...items.values()];
}

async function webmotorsDetail(v) {
  const { text } = await fetchText(v.url, { cookie: 'plataformacookiecheck=ok' });
  const body = stripHtml(text);
  const price = pagePrice(body);
  const photos = [...new Set([...text.matchAll(/https:\/\/image\.webmotors\.com\.br\/vmotors-images\/[^"' )]+\.(?:webp|jpg|jpeg|png)/gi)].map((m) => m[0]))];
  const color = body.match(/Cor\s+([A-Za-zÀ-ú ]{3,20}?)\s+(?:Ano|Câmbio|Km|Portas|Combust)/)?.[1] || '';
  return { ...v, price: price || v.price, photos, thumb: photos[0] || null, color: v.color || color, needsDetail: false };
}

// ---------------------------------------------------------------- AutoBusiness (Next.js; ex.: CND Motors)

function nextPayload(html) {
  let out = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) {
    try { out += JSON.parse(`"${m[1]}"`); } catch { /* ignora pedaço inválido */ }
  }
  return out;
}

function extractArray(text, marker) {
  const start = text.indexOf(marker);
  if (start < 0) return null;
  let i = text.indexOf('[', start);
  const begin = i;
  let depth = 0;
  let inStr = false;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) break; }
  }
  try { return JSON.parse(text.slice(begin, i + 1)); } catch { return null; }
}

async function autobusinessStock(base) {
  const { text } = await fetchText(`${base}/estoque`);
  const payload = nextPayload(text);
  const data = extractArray(payload, '"data":[{"marca"') || [];
  return data.map((v) => {
    const year = v.anoModelo || v.anoFabricacao || '';
    return {
      id: String(v.idVeiculo),
      title: `${titleCase(v.marca)} ${titleCase(v.modelo)} ${v.versao || ''} ${year}`.replace(/\s+/g, ' ').trim(),
      brand: titleCase(v.marca),
      model: titleCase(v.modelo),
      version: v.versao || '',
      year: v.anoFabricacao && v.anoModelo && v.anoFabricacao !== v.anoModelo ? `${v.anoFabricacao}/${v.anoModelo}` : year,
      km: fmtKm(v.km),
      price: v.esconderPreco === '1' ? null : toNumber(v.preco),
      color: v.cor || '',
      fuel: v.combustivel || '',
      transmission: v.transmissao || '',
      category: v.categoria || '',
      options: [v.blindado === 'Sim' ? 'Blindado' : null, v.tetoSolar === 'Sim' ? 'Teto solar' : null, v.conversivel === 'Sim' ? 'Conversível' : null, v.motor ? `Motor ${v.motor}` : null, v.potencia ? `${v.potencia}` : null].filter(Boolean),
      description: String(v.observacoes || '').replace(/\r/g, '').trim(),
      photos: [],
      thumb: null,
      url: `${base}/veiculo/${v.alias}/${v.idVeiculo}`,
      needsDetail: true,
    };
  });
}

async function autobusinessDetail(v) {
  const { text } = await fetchText(v.url);
  const all = [...new Set([...text.matchAll(/https:\/\/[a-z0-9.-]+\/(?:cndmotors\/\d+|assets\/img\/albuns\/album_\d+)\/[^"' \\)]+\.(?:webp|jpg|jpeg|png)/gi)].map((m) => m[0]))];
  const own = all.filter((u) => u.includes(`A${v.id}-`));
  const photos = own.length ? own : all.slice(0, 12);
  return { ...v, photos, thumb: photos[0] || null, needsDetail: false };
}

// ---------------------------------------------------------------- Genérico

async function genericStock(base) {
  const urls = [base, `${base}/estoque`, `${base}/seminovos`, `${base}/veiculos`];
  const found = new Map();
  for (const url of urls) {
    let text;
    try { ({ text } = await fetchText(url, { cookie: 'plataformacookiecheck=ok' })); } catch { continue; }
    for (const m of text.matchAll(/href="([^"]*\/(?:veiculo|veiculos|carro|carros|seminovo|seminovos|estoque)\/[^"]*\d{3,}[^"]*)"/gi)) {
      const href = m[1].startsWith('http') ? m[1] : `${base}${m[1].startsWith('/') ? '' : '/'}${m[1]}`;
      const id = href.match(/(\d{3,})(?!.*\d{3,})/)?.[1] || href;
      if (found.has(id)) continue;
      const slug = decodeURIComponent(href.split('/').filter(Boolean).find((p) => /[a-z]-[a-z]/i.test(p)) || '');
      found.set(id, { id, title: titleCase(slug.replace(/[_-]+/g, ' ')).slice(0, 80) || `Veículo ${id}`, url: href, photos: [], thumb: null, needsDetail: true });
    }
  }
  return [...found.values()];
}

/** Leitura genérica de uma página de veículo (heurística; a LLM melhora quando configurada). */
export async function genericDetail(v, { llm } = {}) {
  const { text } = await fetchText(v.url, { cookie: 'plataformacookiecheck=ok' });
  const body = stripHtml(text);
  const og = (p) => decodeEntities(text.match(new RegExp(`<meta[^>]+property="og:${p}"[^>]+content="([^"]*)"`, 'i'))?.[1] || '');
  const photos = [...new Set([og('image'), ...[...text.matchAll(/https?:\/\/[^"' )]+\.(?:webp|jpg|jpeg)/gi)].map((m) => m[0])].filter((u) => u && !/logo|icon|favicon|banner|whatsapp/i.test(u)))].slice(0, 15);
  let out = {
    ...v,
    title: og('title') || v.title,
    price: pagePrice(body),
    km: fmtKm(body.match(/([\d.]{1,9})\s*km\b/i)?.[1]),
    year: body.match(/\b(19[89]\d|20[0-3]\d)(?:\/(19[89]\d|20[0-3]\d))?\b/)?.[0] || '',
    description: og('description'),
    photos,
    thumb: photos[0] || null,
    needsDetail: false,
  };
  if (llm) {
    const extracted = await llm(body.slice(0, 6000)).catch(() => null);
    if (extracted) out = { ...out, ...Object.fromEntries(Object.entries(extracted).filter(([, val]) => val != null && val !== '')) };
  }
  return out;
}

// ---------------------------------------------------------------- API do módulo

export async function listStock({ url, platform }) {
  const base = siteBase(url);
  switch (platform) {
    case 'litoralcar': return litoralcarStock(base);
    case 'webmotors': return webmotorsStock(base);
    case 'autobusiness': return autobusinessStock(base);
    default: return genericStock(base);
  }
}

/** Completa os dados de um veículo (fotos, preço) abrindo a página dele quando a listagem não traz tudo. */
export async function vehicleDetail(v, platform, opts = {}) {
  if (!v.needsDetail) return v;
  switch (platform) {
    case 'webmotors': return webmotorsDetail(v);
    case 'autobusiness': return autobusinessDetail(v);
    default: return genericDetail(v, opts);
  }
}
