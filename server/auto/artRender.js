// Gerador de artes próprio (Modelo ETP): desenha o criativo do carro no servidor a partir de um layout por cliente.
// Diferente do preenchimento automático do Canva, aqui o código controla tudo: texto com pesos e itálico misturados,
// redução/encurtamento para caber em uma linha, faixas e caixas que acompanham o texto e a foto do Drive enquadrada.
// - artText.js: fontes e texto;  artPhoto.js: foto (enquadramento de estúdio ou cenário ampliado com IA).
import { advance, capHeight, fitList, fitRuns, runsPath } from './artText.js';
import { composePhoto, outpaintBackgrounds, outpaintPlacement, studioBackgrounds } from './artPhoto.js';
import { gearLabel, highlightsOf } from './vehicleText.js';

export { composePhoto };

// ---------------------------------------------------------------- Layouts

/**
 * Coordenadas em px da arte final; y de texto = linha de base.
 * - vitrine: medido nas artes reais da Q3 Motors. car = faixa vertical onde o carro deve ficar.
 * - prime:   medido nas artes aprovadas da Auto Prime (Gol, Mobi, HB20, Kangoo, T-Cross), desvio ≤ 3 px.
 */
export const LAYOUTS = {
  vitrine: {
    label: 'Vitrine (logo, nome, versão, faixa de ano e preço)',
    font: 'montserrat',
    colors: { text: '#000000', bar: '#E5B843' },
    output: 'jpeg',
    photoStyle: 'studio', // parede lisa de estúdio (photoPick.js)
    // Textos que dá para ajustar na revisão (chaves de artValues).
    fields: [['title', 'Nome do carro'], ['version', 'Versão'], ['year', 'Ano'], ['km', 'KM'], ['price', 'Preço (sem centavos)']],
    feed: {
      w: 1080, h: 1350,
      photo: { mode: 'studio' },
      car: { top: 470, bottom: 1085 },
      logo: { x: 74, y: 116, w: 300 },
      blocks: [
        { kind: 'text', x: 74, y: 292, maxW: 932, size: 74, minSize: 44, runs: [{ field: 'title', weight: 700 }] },
        { kind: 'text', x: 74, y: 352, maxW: 932, size: 40, minSize: 26, runs: [{ field: 'version', weight: 700 }] },
        { kind: 'bar', x: 74, y: 371, h: 62, padL: 18, padR: 18, size: 36, maxW: 932, runs: [{ text: 'ANO ', weight: 400 }, { field: 'year', weight: 700 }, { text: '  |  ', weight: 400, when: 'km' }, { field: 'km', weight: 700 }, { text: ' KM', weight: 400, when: 'km' }] },
        { kind: 'bar', x: 0, y: 1113, h: 136, padL: 85, padR: 40, minW: 733, maxW: 1000, size: 100, requires: ['price'], runs: [{ text: 'R$ ', weight: 400, scale: 0.6 }, { field: 'price', weight: 800 }, { text: ',00', weight: 400, scale: 0.6 }] },
      ],
    },
    story: {
      w: 1080, h: 1920,
      photo: { mode: 'studio' },
      car: { top: 600, bottom: 1225 },
      floorFade: { from: 1380, to: 1800 },
      logo: { x: 90, y: 292, w: 290 },
      blocks: [
        { kind: 'text', x: 90, y: 462, maxW: 900, size: 72, minSize: 44, runs: [{ field: 'title', weight: 700 }] },
        { kind: 'text', x: 90, y: 516, maxW: 900, size: 46, minSize: 28, runs: [{ field: 'version', weight: 700 }] },
        { kind: 'bar', x: 88, y: 537, h: 61, padL: 16, padR: 16, size: 40, maxW: 900, runs: [{ text: 'ANO ', weight: 400 }, { field: 'year', weight: 700 }] },
        { kind: 'bar', x: 0, y: 1255, h: 123, padL: 140, padR: 66, minW: 783, maxW: 1060, size: 110, requires: ['price'], runs: [{ text: 'R$ ', weight: 400, scale: 0.6 }, { field: 'price', weight: 800 }, { text: ',00', weight: 400, scale: 0.55 }] },
      ],
    },
  },
  prime: {
    label: 'Rodapé (Auto Prime): foto com o cenário ampliado por IA, logo, título, detalhes e caixa de preço',
    font: 'poppins',
    colors: { text: '#FFFFFF', bar: '#EE2201', barText: '#FFFFFF' },
    output: 'png',
    photoStyle: 'panel', // showroom com o painel da loja ao fundo (photoPick.js)
    fields: [['name', 'Marca e modelo (negrito)'], ['version', 'Versão (fino)'], ['details', 'Detalhes (separe com |)'], ['priceFull', 'Preço']],
    feed: {
      w: 1080, h: 1350,
      // Foto na largura 880 centralizada; sobe até a base do carro ficar em y ≤ 950 (o texto começa em ~1047).
      photo: { mode: 'outpaint', x: 100, y: -110, width: 880, baseMax: 950 },
      shade: [{ from: 780, to: 1350, exp: 1.6, color: [0, 0, 0] }],
      logo: { x: 118, y: 1047, w: 245 },
      blocks: [
        { kind: 'text', x: 117, y: 1151.5, center: true, maxW: 800, size: 47, minSize: 40, absMin: 36, shorten: 'version', runs: [{ field: 'name', weight: 700, italic: true }, { text: ' ', weight: 300, italic: true, when: 'version' }, { field: 'version', weight: 300, italic: true }] },
        { kind: 'list', x: 119, y: 1192, maxW: 840, size: 28, minSize: 24, field: 'details', keep: 2, weight: 400 },
        { kind: 'bar', x: 119, y: 1215, h: 69, padL: 11, padR: 11, minW: 332, baseline: 1264, size: 46.75, requires: ['priceFull'], runs: [{ field: 'priceFull', weight: 700 }] },
      ],
    },
    story: {
      w: 1080, h: 1920,
      // Foto na largura toda, encostada no topo; a IA estende o piso para baixo.
      photo: { mode: 'outpaint', x: 0, y: 0, width: 1080, baseMax: 1335 },
      shade: [
        { from: 0, to: 650, exp: 1.8, color: [32, 32, 32], alpha: 235, fromTop: true },
        { from: 950, to: 1920, exp: 1.6, color: [0, 0, 0] },
      ],
      logo: { x: 123, y: 1323, w: 256 },
      blocks: [
        { kind: 'text', x: 138, y: 1430.5, center: true, maxW: 840, size: 43, minSize: 37, absMin: 32, shorten: 'version', runs: [{ field: 'name', weight: 700, italic: true }, { text: ' ', weight: 300, italic: true, when: 'version' }, { field: 'version', weight: 300, italic: true }] },
        { kind: 'list', x: 138, y: 1474, maxW: 860, size: 28.5, minSize: 24, field: 'details', keep: 2, weight: 400 },
        { kind: 'bar', x: 138, y: 1509, h: 76, padL: 15, padR: 15, minW: 361, baseline: 1562, size: 48.5, requires: ['priceFull'], runs: [{ field: 'priceFull', weight: 700 }] },
      ],
    },
  },
};

// ---------------------------------------------------------------- Valores do carro

const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
const collapse = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const upper = (s) => collapse(s).toUpperCase();

/**
 * Textos do carro já no formato da arte. `overrides` (revisão) troca qualquer campo:
 * { name, version, details: [..] ou "A | B", priceFull, title, year, km, price }.
 */
export function artValues(v, overrides = {}) {
  const title = v.brand && v.model ? titleCase(`${v.brand} ${v.model}`) : titleCase(collapse(v.title).split(' ').slice(0, 2).join(' '));
  const name = v.brand && v.model ? upper(`${v.brand} ${v.model}`) : upper(collapse(v.title).split(' ').slice(0, 2).join(' '));
  // Versão sem repetir palavras do nome (ex.: "Ram Rampage Laramie" + "LARAMIE TB CD…" → "TB CD…").
  const inName = new Set(name.split(' '));
  const version = upper(v.version || collapse(v.title).split(' ').slice(2).join(' '))
    .split(' ').filter((w) => !(/^[A-ZÀ-Ü-]+$/.test(w) && inName.has(w))).join(' ');
  const year = String(v.year || '').split('/').pop();
  const km = Number(String(v.km || '').replace(/\D/g, ''));
  const highlights = v.highlights || highlightsOf([...(v.options || []), v.description || '']);
  const out = {
    title,
    name,
    version,
    year,
    km: km ? km.toLocaleString('pt-BR') : '',
    price: v.price ? Math.round(v.price).toLocaleString('pt-BR') : '',
    priceFull: v.price ? `R$ ${Number(v.price).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '',
    details: [gearLabel(v.transmission), year && `ANO ${year}`, ...highlights.slice(0, 2)].filter(Boolean),
  };
  for (const [k, val] of Object.entries(overrides || {})) {
    if (val == null || val === '') continue;
    out[k] = k === 'details' && typeof val === 'string' ? val.split('|').map((s) => collapse(s).toUpperCase()).filter(Boolean) : val;
  }
  return out;
}

// ---------------------------------------------------------------- Texto e faixas

function blocksSvg(fmt, values, colors, family) {
  const out = [];
  for (const b of fmt.blocks) {
    if (b.requires?.some((k) => !values[k])) continue;
    if (b.kind === 'list') {
      const laid = fitList(b, values, family);
      if (laid) out.push(runsPath(laid, b.x, b.y, colors.text));
      continue;
    }
    const avail = b.kind === 'bar' ? (b.maxW ? b.maxW - b.padL - b.padR - b.x : 1e9) : b.maxW;
    const laid = fitRuns(b, values, family, avail);
    if (!laid) continue;
    const cap = capHeight(laid.parts.find((p) => p.scale === 1)?.f || laid.parts[0].f);
    if (b.kind === 'text') {
      // Texto que encolheu fica centrado na mesma altura das letras do tamanho cheio.
      const y = b.center ? b.y - (cap * b.size) / 2 + (cap * laid.size) / 2 : b.y;
      out.push(runsPath(laid, b.x, y, colors.text));
    } else {
      const w = Math.max(b.minW || 0, b.padL + advance(laid.parts, laid.size) + b.padR);
      out.push(`<rect x="${b.x}" y="${b.y}" width="${Math.round(w)}" height="${b.h}" fill="${colors.bar}"/>`);
      out.push(runsPath(laid, b.x + b.padL, b.baseline ?? b.y + b.h / 2 + (cap * laid.size) / 2, colors.barText || colors.text));
    }
  }
  return out.join('\n');
}

/** Degradês por cima da foto: escurece o piso embaixo (e o teto em cima, no stories), com curva suave. */
function shadeOverlay(fmt) {
  if (!fmt.shade?.length) return null;
  const { w, h } = fmt;
  const buf = Buffer.alloc(w * h * 4);
  for (const s of fmt.shade) {
    for (let y = Math.max(0, s.from); y < Math.min(h, s.to); y++) {
      const t = (y - s.from) / (s.to - s.from);
      const a = s.fromTop ? ((s.alpha ?? 255) / 255) * (1 - t) ** s.exp : ((s.alpha ?? 255) / 255) * t ** s.exp;
      for (let x = 0; x < w; x++) {
        const k = (y * w + x) * 4;
        const prev = buf[k + 3] / 255;
        const outA = a + prev * (1 - a);
        for (let c = 0; c < 3; c++) buf[k + c] = outA ? Math.round((s.color[c] * a + buf[k + c] * prev * (1 - a)) / outA) : 0;
        buf[k + 3] = Math.round(outA * 255);
      }
    }
  }
  return { input: buf, raw: { width: w, height: h, channels: 4 }, left: 0, top: 0 };
}

// ---------------------------------------------------------------- Arte completa

/**
 * Desenha a arte nos formatos pedidos. spec = { layout, colors: { text, bar, barText }, logo: Buffer|null, photoCar }.
 * mask = recorte do carro (carMask.js) — mede o carro para o enquadramento. overrides = textos ajustados na revisão.
 * Devolve [{ format, buffer, mime, ext, ai }].
 */
export async function renderArts({ spec, vehicle, photo, mask = null, formats = ['feed', 'story'], overrides = {} }) {
  const { default: sharp } = await import('sharp');
  const layout = LAYOUTS[spec.layout || 'vitrine'];
  if (!layout) throw Object.assign(new Error(`Layout de arte desconhecido: ${spec.layout}`), { status: 400 });
  const colors = { ...layout.colors };
  for (const [k, val] of Object.entries(spec.colors || {})) if (val) colors[k] = val;
  const values = artValues(vehicle, overrides);

  // Fundos: no layout com IA, todos os formatos de uma vez (o modelo carrega uma vez só).
  const fmts = formats.map((f) => [f, layout[f]]).filter(([, f]) => f);
  const bases = new Map();
  let ai = null;
  const outpaintFmts = fmts.filter(([, f]) => f.photo?.mode === 'outpaint');
  if (outpaintFmts.length) {
    const r = await outpaintBackgrounds(sharp, photo, outpaintFmts.map(([, f]) => outpaintPlacement(f, mask)));
    outpaintFmts.forEach(([name], i) => bases.set(name, r.backgrounds[i]));
    ai = r.ai;
  }
  // Estúdio (Vitrine) com o recorte do carro: parede refeita pela IA; sem recorte, o enquadramento padrão.
  const studioFmts = fmts.filter(([name, f]) => !bases.has(name) && f.photo?.mode === 'studio' && mask);
  if (studioFmts.length) {
    const r = await studioBackgrounds(sharp, photo, studioFmts.map(([, f]) => f), mask);
    studioFmts.forEach(([name], i) => bases.set(name, r.backgrounds[i]));
    ai = r.ai;
  }
  for (const [name, f] of fmts) if (!bases.has(name)) bases.set(name, await composePhoto(sharp, photo, f, spec.photoCar, mask));

  const results = [];
  for (const [name, fmt] of fmts) {
    const layers = [];
    const shade = shadeOverlay(fmt);
    if (shade) layers.push(shade);
    if (spec.logo && fmt.logo) layers.push({ input: await sharp(spec.logo).resize({ width: fmt.logo.w }).png().toBuffer(), left: fmt.logo.x, top: fmt.logo.y });
    layers.push({ input: Buffer.from(`<svg width="${fmt.w}" height="${fmt.h}" xmlns="http://www.w3.org/2000/svg">${blocksSvg(fmt, values, colors, layout.font)}</svg>`) });
    const img = sharp(bases.get(name)).composite(layers).removeAlpha();
    const png = layout.output === 'png';
    results.push({
      format: name,
      buffer: png ? await img.png({ compressionLevel: 9 }).toBuffer() : await img.jpeg({ quality: 92 }).toBuffer(),
      mime: png ? 'image/png' : 'image/jpeg',
      ext: png ? 'png' : 'jpg',
      ai,
    });
  }
  return results;
}

/** Um formato só (compatibilidade). Devolve o buffer da imagem. */
export async function renderArt({ spec, vehicle, photo, format = 'feed', mask = null, overrides }) {
  const [r] = await renderArts({ spec, vehicle, photo, mask, formats: [format], overrides });
  return r.buffer;
}
