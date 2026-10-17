// Texto das artes: fontes (Montserrat e Poppins, com itálico), ajuste para caber e contorno em SVG.
// O texto vira caminho (path) letra por letra — não depende de fonte instalada no servidor.
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const opentype = require('opentype.js');

const FAMILIES = {
  montserrat: { weights: [400, 500, 600, 700, 800], file: (w) => `@fontsource/montserrat/files/montserrat-latin-${w}-normal.woff` },
  poppins: { weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italic: true, file: (w, it) => `@fontsource/poppins/files/poppins-latin-${w}-${it ? 'italic' : 'normal'}.woff` },
};
const fonts = new Map();

export function font(family, weight = 400, italic = false) {
  const fam = FAMILIES[family] ? family : 'montserrat';
  const spec = FAMILIES[fam];
  const w = spec.weights.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a));
  const it = Boolean(italic && spec.italic);
  const key = `${fam}-${w}-${it}`;
  if (!fonts.has(key)) {
    const buf = fs.readFileSync(new URL(`../../node_modules/${spec.file(w, it)}`, import.meta.url));
    fonts.set(key, opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
  }
  return fonts.get(key);
}

export const capHeight = (f) => (f.tables.os2?.sCapHeight || f.unitsPerEm * 0.7) / f.unitsPerEm;

/** Trechos de um bloco (texto + fonte + escala), só os que têm valor. */
export function runParts(runs, values, family) {
  return runs
    .filter((r) => (r.when ? values[r.when] : true) && (r.field ? values[r.field] : r.text))
    .map((r) => ({ text: r.field ? String(values[r.field]) : r.text, f: font(family, r.weight || 400, r.italic), scale: r.scale || 1 }));
}

export const advance = (parts, size) => parts.reduce((s, p) => s + p.f.getAdvanceWidth(p.text, size * p.scale), 0);

const FUEL = /^(FLEX|TOTALFLEX|FLEXONE|FLEXFUEL|HI-FLEX|BICOMBUSTIVEL|BICOMBUSTÍVEL|GASOLINA|ETANOL)$/;
// Motor e tração ficam sempre (1.0, 250 TSI, TURBO, 4X4…); o que sai é nome de acabamento.
const KEEP = /^(TURBO|TSI|TFSI|MSI|GDI|THP|TB|HYBRID|HIBRIDO|HÍBRIDO|ELETRICO|ELÉTRICO|DIESEL|AWD|CVT)$/;

/** Uma palavra dispensável a menos na versão (combustível, depois o acabamento mais longo), ou null se não há. */
export function shortenVersion(version) {
  const words = String(version || '').split(' ').filter(Boolean);
  const fuel = words.findIndex((w) => FUEL.test(w));
  if (fuel >= 0) {
    words.splice(fuel, 1);
    return words.join(' ');
  }
  let best = -1;
  words.forEach((w, i) => { if (/^[A-ZÀ-Ü-]{5,}$/.test(w) && !KEEP.test(w) && (best < 0 || w.length > words[best].length)) best = i; });
  if (best < 0) return null;
  words.splice(best, 1);
  return words.join(' ');
}

/**
 * Ajusta um bloco de texto para caber em `avail`, sempre numa linha só:
 * 1. reduz a fonte até `minSize`;
 * 2. se o bloco permitir (`shorten`), tira uma palavra dispensável da versão e tenta de novo do tamanho cheio
 *    (como nas artes aprovadas: "T-Cross 1.0 COMFORTLINE 200 TSI FLEX" → "1.0 200 TSI");
 * 3. sem mais o que tirar, reduz até `absMin`; por último, corta palavras do fim.
 */
export function fitRuns(block, values, family, avail) {
  let vals = values;
  const min = block.minSize ?? block.size * 0.55;
  const absMin = block.absMin ?? min;
  const step = block.step || 1;
  for (let guard = 0; guard < 16; guard++) {
    const parts = runParts(block.runs, vals, family);
    if (!parts.length) return null;
    for (let size = block.size; size >= min - 1e-9; size -= step) {
      const width = advance(parts, size);
      if (width <= avail) return { parts, size, width };
    }
    const shorter = block.shorten && vals[block.shorten] ? shortenVersion(vals[block.shorten]) : null;
    if (shorter != null) {
      vals = { ...vals, [block.shorten]: shorter };
      continue;
    }
    for (let size = min - step; size >= absMin - 1e-9; size -= step) {
      const width = advance(parts, size);
      if (width <= avail) return { parts, size, width };
    }
    if (block.shorten && vals[block.shorten]) {
      vals = { ...vals, [block.shorten]: vals[block.shorten].split(' ').slice(0, -1).join(' ') };
      continue;
    }
    let size = absMin;
    while (size > 10 && advance(parts, size) > avail) size -= 1;
    return { parts, size, width: advance(parts, size) };
  }
  return null;
}

/** Linha de itens separados ("MANUAL  |  ANO 2023  |  BAIXA KM"): tira o último item que não couber, depois reduz a fonte. */
export function fitList(block, values, family) {
  const items = [...(values[block.field] || [])].filter(Boolean);
  if (!items.length) return null;
  const f = font(family, block.weight || 400, block.italic);
  const sep = block.sep || '  |  ';
  const width = (size) => f.getAdvanceWidth(items.join(sep), size);
  while (items.length > (block.keep || 1) && width(block.size) > block.maxW) items.pop();
  let size = block.size;
  while (size > (block.minSize || block.size * 0.75) && width(size) > block.maxW) size -= 1;
  return { parts: [{ text: items.join(sep), f, scale: 1 }], size, width: width(size) };
}

/**
 * Comandos do contorno → atributo "d" do SVG. Não usamos path.toPathData() do opentype.js 2.0: ele escreve "NaN"
 * quando a coordenada tem resíduo de ponto flutuante (ex.: 303.70000000000005) e o SVG some a partir dali.
 */
const n = (v) => (Math.round(v * 100) / 100).toString();
function pathData(commands) {
  return commands.map((c) => {
    if (c.type === 'M' || c.type === 'L') return `${c.type}${n(c.x)} ${n(c.y)}`;
    if (c.type === 'Q') return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
    if (c.type === 'C') return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
    return 'Z';
  }).join('');
}

/** Contorno do texto letra por letra, com kerning entre as letras. */
function glyphsPath(f, text, x, baseline, size) {
  const scale = size / f.unitsPerEm;
  const glyphs = f.stringToGlyphs(text);
  const parts = [];
  let cx = x;
  glyphs.forEach((g, i) => {
    const d = pathData(g.getPath(cx, baseline, size).commands);
    if (d) parts.push(d);
    cx += g.advanceWidth * scale;
    if (glyphs[i + 1]) cx += (f.getKerningValue(g, glyphs[i + 1]) || 0) * scale;
  });
  return { parts, end: cx };
}

/** SVG dos trechos a partir de (x, linha de base). Um <path> por letra: juntar tudo fazia o librsvg pular letras. */
export function runsPath(laid, x, baseline, color) {
  let cx = x;
  const paths = [];
  for (const p of laid.parts) {
    const g = glyphsPath(p.f, p.text, cx, baseline, laid.size * p.scale);
    paths.push(...g.parts);
    cx = g.end;
  }
  return `<g fill="${color}">${paths.map((d) => `<path d="${d}"/>`).join('')}</g>`;
}
