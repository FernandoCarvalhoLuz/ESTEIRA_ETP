// Escolhe a melhor foto de capa do carro na pasta do Drive, sem IA: mede a miniatura de cada foto.
// Dois estilos de estúdio:
// - 'studio' (Q3): parede lisa ao fundo. Externa = topo liso e meio com o carro (interior, painel e roda falham);
//   entre as externas, a frente em 3/4 é a mais assimétrica e sem lanterna vermelha. Validado em Tracker, Tiguan,
//   Amarok, Nivus e Rampage.
// - 'panel' (Auto Prime): showroom com o painel preto da loja. A capa é a 3/4 de frente com o painel no alto à
//   esquerda, sempre entre as primeiras fotos da pasta (o fotógrafo começa pelas externas). Regra: entre as 6
//   primeiras (ordem do nome = ordem das fotos), sem lanterna (traseira) e assimétrica (não é a frente reta),
//   a que tem mais área escura + vermelho no canto superior esquerdo. Bateu com a foto escolhida pelo designer nas
//   5 artes aprovadas (Gol, Mobi, HB20, Kangoo, T-Cross).
// Com o Claude configurado, a escolha final é dele (folha de contato, ver contactSheet) e estas regras viram a reserva.

import { font, runsPath } from './artText.js';

const cache = new Map(); // id → medidas

async function thumbBuffer(photo) {
  if (!photo.thumb) return null;
  const res = await fetch(photo.thumb, { signal: AbortSignal.timeout(15_000) });
  return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
}

async function measure(sharp, photo, load = thumbBuffer) {
  if (cache.has(photo.id)) return cache.get(photo.id);
  try {
    const buf = await load(photo);
    if (!buf) return null;
    const m = { ...(await studioFeatures(sharp, buf)), ...(await panelFeatures(sharp, buf)) };
    cache.set(photo.id, m);
    if (cache.size > 2000) cache.delete(cache.keys().next().value);
    return m;
  } catch {
    return null;
  }
}

async function studioFeatures(sharp, buf) {
  const { data } = await sharp(buf).resize(96, 72, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => { const k = (y * 96 + x) * 3; return [data[k], data[k + 1], data[k + 2]]; };
  const L = (x, y) => { const [r, g, b] = px(x, y); return 0.299 * r + 0.587 * g + 0.114 * b; };
  const band = (y0, y1) => {
    const v = [];
    for (let y = y0; y < y1; y++) for (let x = 0; x < 96; x++) v.push(L(x, y));
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return { mean: m, std: Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) };
  };
  const top = band(0, 11);
  const mid = band(24, 56);
  let asym = 0;
  let n = 0;
  let red = 0;
  for (let y = 22; y < 60; y++) {
    for (let x = 0; x < 48; x++) { asym += Math.abs(L(x, y) - L(95 - x, y)); n++; }
    for (let x = 0; x < 96; x++) { const [r, g, b] = px(x, y); if (r > 120 && r > g * 1.7 && r > b * 1.7) red++; }
  }
  return { exterior: top.std <= 36 && mid.mean >= 75, asym: asym / n, red };
}

/** Medidas do estilo 'panel' numa miniatura em retrato (72×96). */
async function panelFeatures(sharp, buf) {
  const W = 72;
  const H = 96;
  const { data } = await sharp(buf).rotate().resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => { const k = (y * W + x) * 3; return [data[k], data[k + 1], data[k + 2]]; };
  const L = (x, y) => { const [r, g, b] = px(x, y); return 0.299 * r + 0.587 * g + 0.114 * b; };
  const isRed = ([r, g, b]) => r > 130 && r > g * 2 && r > b * 2;
  let dark = 0;
  let red = 0;
  let n = 0;
  for (let y = Math.round(H * 0.05); y < Math.round(H * 0.4); y++) {
    for (let x = 0; x < Math.round(W * 0.6); x++) { n++; if (L(x, y) < 50) dark++; if (isRed(px(x, y))) red++; }
  }
  let redMid = 0;
  let nm = 0;
  let asym = 0;
  let na = 0;
  for (let y = Math.round(H * 0.35); y < Math.round(H * 0.8); y++) {
    for (let x = 0; x < W; x++) { nm++; if (isRed(px(x, y))) redMid++; }
    for (let x = 0; x < W / 2; x++) { asym += Math.abs(L(x, y) - L(W - 1 - x, y)); na++; }
  }
  return { tlDark: dark / n, tlRed: red / n, redMid: redMid / nm, pAsym: asym / na };
}

const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { numeric: true });

/**
 * Devolve as fotos com as melhores capas primeiro. style = 'studio' (padrão) ou 'panel' (showroom com painel da loja).
 * load(photo) → Buffer troca a fonte da miniatura (padrão: photo.thumb do Drive).
 */
export async function rankPhotos(photos = [], { limit = 12, load, style = 'studio' } = {}) {
  if (photos.length < 2) return photos;
  const { default: sharp } = await import('sharp');
  if (style === 'panel') {
    const ordered = [...photos].sort(byName);
    // Nome com data e hora (ex.: "WhatsApp Image 2026-10-06 at 16.15.29") = ordem em que as fotos foram tiradas:
    // a capa está entre as 6 primeiras. Sem isso (ex.: "6958…_n.jpg", baixadas do Instagram), avalia todas.
    const timed = ordered.filter((p) => /\d{4}-\d\d-\d\d.{1,5}\d\d[.:]\d\d[.:]\d\d/.test(p.name)).length >= ordered.length * 0.8;
    const head = timed ? ordered.slice(0, 6) : ordered.slice(0, 16);
    const scored = await Promise.all(head.map(async (p) => {
      const m = await measure(sharp, p, load);
      const ok = m && m.redMid <= 0.003 && m.pAsym >= 42;
      return { p, score: ok ? m.tlDark + m.tlRed * 8 : -1 };
    }));
    const good = scored.filter((s) => s.score >= 0).sort((a, b) => b.score - a.score).map((s) => s.p);
    return [...good, ...ordered.filter((p) => !good.includes(p))];
  }
  const head = photos.slice(0, limit);
  const scored = await Promise.all(head.map(async (p, i) => {
    const m = await measure(sharp, p, load);
    const score = !m ? -1000 - i : m.exterior ? m.asym - (m.red > 15 ? 40 : 0) - i * 0.5 : -500 - i;
    return { p, score };
  }));
  const best = scored.sort((a, b) => b.score - a.score)[0];
  if (!best || best.score <= -500) return photos; // nada reconhecido como externa: mantém a ordem da pasta
  return [best.p, ...photos.filter((p) => p !== best.p)];
}

/** Folha de contato numerada (0, 1, 2…) das fotos, para a escolha pela visão do Claude. Devolve { sheet, photos }. */
export async function contactSheet(photos, { load = thumbBuffer, max = 16 } = {}) {
  const { default: sharp } = await import('sharp');
  const list = [...photos].sort(byName).slice(0, max);
  const W = 240;
  const H = 320;
  const cols = 4;
  const tiles = [];
  const used = [];
  for (const p of list) {
    const buf = await load(p).catch(() => null);
    if (!buf) continue;
    const i = used.length;
    const img = await sharp(buf).rotate().resize(W, H, { fit: 'contain', background: '#111' }).toBuffer();
    const f = font('montserrat', 800);
    const num = { parts: [{ text: String(i), f, scale: 1 }], size: 28 };
    const x = 28 - f.getAdvanceWidth(String(i), 28) / 2;
    const label = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="56" height="40" fill="#e00"/>${runsPath(num, x, 30, '#fff')}</svg>`);
    tiles.push(await sharp(img).composite([{ input: label }]).png().toBuffer());
    used.push(p);
  }
  if (!tiles.length) return null;
  const rows = Math.ceil(tiles.length / cols);
  const sheet = await sharp({ create: { width: cols * (W + 4), height: rows * (H + 4), channels: 3, background: '#000' } })
    .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * (W + 4), top: Math.floor(i / cols) * (H + 4) })))
    .jpeg({ quality: 82 }).toBuffer();
  return { sheet, photos: used };
}
