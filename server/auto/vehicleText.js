// Dados do carro a partir da descrição do anúncio (o .docx que o cliente deixa na pasta do carro no Drive):
//   🚙✨ VOLKSWAGEN GOL 1.0 FLEX | 2023 | MANUAL      ← título: marca, modelo, versão | ano | câmbio
//   🔥 BAIXA QUILOMETRAGEM | TODO REVISADO           ← destaques
//   ✅ Motor 1.0 Flex …                              ← itens
//   💰 Valor à vista: R$ 55.900,00                    ← preço (nunca o "para trocas")
// As descrições reais variam (ano só no nome da pasta, "–" no lugar de "|", "AUT.", câmbio na 2ª linha…);
// o leitor aceita essas variações. Também escolhe os destaques da linha de detalhes da arte.

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Tira emojis e símbolos do começo da linha (🚙✨, 🔥, 👉, ✅, 💰…). */
const stripLead = (s) => clean(String(s || '').replace(/^[^\p{L}\p{N}]+/u, ''));

// Palavra que faz parte do nome do modelo (FIAT ARGO DRIVE, TIGUAN ALLSPACE, COROLLA CROSS) e não da versão.
const MODEL_SUFFIX = new Set(['DRIVE', 'ALLSPACE', 'CROSS', 'SPORTBACK', 'SPORTWAGEN', 'SKI']);
const TWO_WORD_BRANDS = ['LAND ROVER', 'ALFA ROMEO', 'ASTON MARTIN', 'ROLLS ROYCE', 'GREAT WALL', 'MERCEDES BENZ'];
const GEAR = /^(MANUAL|MEC\.?|MECANICO|AUT\.?|AUTOMATIC[OA]|AUTOMATIZAD[OA]|CVT|DSG)$/;

export function gearLabel(s) {
  const t = norm(s);
  if (/\bAUTOMATIZAD/.test(t)) return 'AUTOMATIZADO';
  if (/\bAUTOMATIC|\bAUT\b|\bAUT\.|\bCVT\b|\bDSG\b/.test(t)) return 'AUTOMÁTICO';
  if (/\bMANUAL\b|\bMEC(ANICO)?\b/.test(t)) return 'MANUAL';
  return '';
}

/** "R$ 55.900,00" a partir do texto ("Valor à vista: R$ 55.900"). Nunca usa o valor de troca. */
export function cashPrice(text) {
  const m = String(text || '').match(/valor\s+[àa]\s+vista\s*:?\s*R\$\s*([\d.]+)(?:,(\d{1,2}))?/i);
  if (!m) return null;
  const value = Number(m[1].replace(/\./g, '')) + (m[2] ? Number(m[2].padEnd(2, '0')) / 100 : 0);
  return value > 0 ? value : null;
}

// Destaques da linha de detalhes, na ordem de prioridade do padrão (no máximo 2 entram na arte).
const HIGHLIGHTS = [
  { label: 'ÚNICO DONO', re: /UNICO DONO/ },
  { label: 'BAIXA KM', re: /BAIXA (KM|QUILOMETRAGEM)|BAIXISSIMA (KM|QUILOMETRAGEM)/ },
  { label: 'PILOTO AUTOMÁTICO', re: /PILOTO AUTOMATICO/ },
  { label: 'MULTIMÍDIA', re: /MULTIMIDIA/ },
  { label: (m) => (m.includes('REVISADA') ? 'REVISADA' : 'REVISADO'), re: /REVISAD[OA]/ },
  { label: 'UTILITÁRIO', re: /UTILITARI[OA]/ },
  { label: (m) => (m.includes('COMPLETA') ? 'COMPLETA' : 'COMPLETO'), re: /\bCOMPLET[OA]\b/ },
  { label: 'ECONÔMICO', re: /ECONOMIC[OA]|ECONOMIA DE COMBUSTIVEL/ },
];

/**
 * Destaques encontrados nos textos (linha de destaques + itens ✅), já na ordem de prioridade.
 * "COMPLETO" também vale quando o carro tem ar-condicionado, direção, vidros e travas elétricas.
 */
export function highlightsOf(texts) {
  const all = norm((texts || []).join(' | '));
  const found = [];
  HIGHLIGHTS.forEach((h, i) => {
    const m = all.match(new RegExp(h.re.source, 'g'));
    if (m) found.push({ i, label: typeof h.label === 'function' ? h.label(m.join(' ')) : h.label });
  });
  const complete = HIGHLIGHTS.findIndex((h) => h.re.source.includes('COMPLET'));
  const equipped = /AR[- ]CONDICIONADO/.test(all) && /DIRECAO/.test(all) && /VIDROS? ELETRIC/.test(all) && /TRAVAS? ELETRIC/.test(all);
  if (equipped && !found.some((f) => f.i === complete)) found.push({ i: complete, label: 'COMPLETO' });
  return found.sort((a, b) => a.i - b.i).map((f) => f.label);
}

/** Separa marca, modelo e versão de "VOLKSWAGEN T-CROSS 1.0 200 TSI FLEX". */
export function splitName(name) {
  const words = clean(name).toUpperCase().split(' ').filter(Boolean);
  let brandLen = 1;
  if (TWO_WORD_BRANDS.includes(words.slice(0, 2).join(' ').replace('-', ' '))) brandLen = 2;
  const brand = words.slice(0, brandLen).join(' ');
  let modelLen = 1;
  while (words[brandLen + modelLen] && MODEL_SUFFIX.has(words[brandLen + modelLen]) && modelLen < 3) modelLen += 1;
  return {
    brand,
    model: words.slice(brandLen, brandLen + modelLen).join(' '),
    version: words.slice(brandLen + modelLen).join(' '),
  };
}

/**
 * Lê a descrição do anúncio. folderName ajuda quando falta algo no texto (ano, versão).
 * Devolve { brand, model, version, year, transmission, price, highlights, title, text }.
 */
export function parseDescription(text, { folderName = '' } = {}) {
  const lines = String(text || '').split('\n').map((l) => l.trim());
  const filled = lines.filter((l) => l && !/^[➖—–\-_=\s]+$/.test(l));
  const head = stripLead(filled[0] || '');
  const second = stripLead(filled[1] || '');
  const items = lines.filter((l) => /^✅|^✔/.test(l)).map(stripLead);

  // Título: partes separadas por "|" ou " – ".
  const parts = head.split(/\s*\|\s*|\s+[–—-]\s+/).map(clean).filter(Boolean);
  const yearIn = (s) => String(s || '').match(/\b(19[89]\d|20[0-4]\d)\b/)?.[1] || '';
  // Ano = último número de ano do título, sem contar a palavra do modelo (Peugeot 2008, Peugeot 3008…).
  const headWords = parts.join(' ').split(' ');
  const yearWords = headWords.filter((w, i) => i !== 1 && yearIn(w) === w);
  const folderYear = folderName.match(/ano\s*(\d{4})/i)?.[1] || [...folderName.matchAll(/\b(19[89]\d|20[0-4]\d)\b/g)].map((m) => m[1]).pop() || '';
  const year = yearWords.pop() || folderYear || '';
  const gearPart = parts.slice(1).map(gearLabel).find(Boolean);
  const nameWords = clean(parts[0] || head).toUpperCase().split(' ')
    .filter((w) => w !== year && !GEAR.test(norm(w)));
  // "FLEX AUTOMÁTICO" no fim do título (Voyage) ou "AUT." colado ao nome (Compass) também são câmbio.
  const gearInName = gearLabel(parts[0] || '');
  const transmission = gearPart || gearInName || gearLabel(second) || gearLabel(items.find((i) => /c[âa]mbio/i.test(i))) || '';
  const { brand, model, version: v } = splitName(nameWords.join(' '));
  let version = v;
  if (!version && folderName) {
    // Versão no nome da pasta ("Saveiro Robust 2023" → ROBUST): palavras depois do modelo, sem ano/cor/parênteses.
    const fw = clean(folderName.replace(/\(.*?\)/g, ' ')).toUpperCase().split(' ');
    const at = fw.findIndex((w) => model.split(' ').includes(w));
    if (at >= 0) version = fw.slice(at + model.split(' ').length).filter((w) => !yearIn(w) && !/^(PRETO|PRETA|BRANCO|BRANCA|PRATA|CINZA|VERMELHO|VERMELHA|AZUL|\/|ANO)$/.test(w)).join(' ');
  }
  const highlights = highlightsOf([second, ...items]);
  return {
    brand,
    model,
    version,
    year,
    transmission,
    price: cashPrice(text),
    highlights,
    title: clean(`${brand} ${model} ${version} ${year}`),
    text: String(text || '').trim(),
  };
}
