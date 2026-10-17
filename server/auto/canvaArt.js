// Criação de arte nova no Canva quando o carro não tem página pronta no design do cliente.
// O cliente tem um "design-modelo" (1 página de feed e, se quiser, 1 de stories) com campos de dados do
// Autofill (ex.: NOME, PRECO, KM, ANO, FOTO). A esteira preenche os campos com os dados do carro e as
// fotos da pasta do carro no Drive (nunca do site) e o Canva gera um design novo, que é exportado.
import { fmtPrice } from '../../shared/esteira.js';
import { autofillFromTemplate, templateDataset, uploadAsset } from './canvaConnect.js';
import { downloadFile } from './drive.js';
import { artValues, composePhoto, LAYOUTS } from './artRender.js';
import { carMask, isFullCar } from './carMask.js';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Regras para reconhecer o campo pelo nome (em ordem: a primeira que bate vence).
// Valores entram "crus": o modelo deixa "R$", ",00", "ANO" e "KM" como texto fixo, com o estilo dele.
// Para o texto completo, nomeie o campo com _COMPLETO (ex.: PRECO_COMPLETO → "R$ 88.900").
const TEXT_RULES = [
  { key: 'priceFull', test: /pre[cç]o.?completo|valor.?completo/, label: 'Preço com R$' },
  { key: 'kmFull', test: /km.?completo/, label: 'KM com "km"' },
  { key: 'nameFull', test: /nome.?completo|titulo.?completo/, label: 'Nome completo' },
  { key: 'price', test: /pre[cç]o|valor|price/, label: 'Preço (só o número)' },
  { key: 'km', test: /\bkm\b|quilometr|kilomet|rodado/, label: 'KM (só o número)' },
  { key: 'year', test: /\bano\b|year|modelo_ano|ano_modelo/, label: 'Ano' },
  { key: 'version', test: /vers[aã]o|version/, label: 'Versão' },
  { key: 'brand', test: /marca|brand|montadora/, label: 'Marca' },
  { key: 'color', test: /\bcor\b|color/, label: 'Cor' },
  { key: 'transmission', test: /cambio|transmiss/, label: 'Câmbio' },
  { key: 'fuel', test: /combust|fuel/, label: 'Combustível' },
  { key: 'options', test: /opcion|destaque|itens|equipa/, label: 'Opcionais' },
  { key: 'name', test: /nome|carro|veiculo|titulo|title|oferta|modelo|model/, label: 'Marca e modelo' },
];

const fmtKm = (km) => {
  const n = Number(String(km || '').replace(/\D/g, ''));
  return n ? `${n.toLocaleString('pt-BR')} km` : '';
};

function valueFor(key, v, name) {
  const a = artValues(v);
  switch (key) {
    case 'priceFull': return v.price ? fmtPrice(v.price) : '';
    case 'kmFull': return fmtKm(v.km);
    case 'nameFull': return name;
    case 'price': return a.price;
    case 'km': return a.km;
    case 'year': return a.year;
    case 'version': return a.version;
    case 'brand': return v.brand || '';
    case 'color': return v.color || '';
    case 'transmission': return v.transmission || '';
    case 'fuel': return v.fuel || '';
    case 'options': return (v.options || []).slice(0, 4).join(' • ');
    default: return a.title;
  }
}

/**
 * Liga cada campo do modelo a um dado do carro. Devolve o plano (o que vai em cada campo) sem chamar o Canva,
 * para mostrar na tela de Fontes e para a montagem.
 */
export function planFields(dataset, v, name) {
  const fields = Object.entries(dataset || {});
  const text = [];
  const images = [];
  const skipped = [];
  for (const [field, def] of fields) {
    if (def.type === 'image') { images.push(field); continue; }
    if (def.type !== 'text') { skipped.push({ field, reason: `tipo ${def.type} não suportado` }); continue; }
    const rule = TEXT_RULES.find((r) => r.test.test(norm(field)));
    if (!rule) { skipped.push({ field, reason: 'nome do campo não reconhecido' }); continue; }
    text.push({ field, key: rule.key, label: rule.label, value: v ? valueFor(rule.key, v, name) : null });
  }
  // Campos de imagem em ordem natural (FOTO, FOTO2, FOTO 3…): recebem as fotos do Drive na mesma ordem.
  images.sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  return { text, images, skipped };
}

/** Lê o design-modelo e explica como os campos serão preenchidos (para a verificação em Fontes). */
export async function templateCheck(template) {
  const dataset = await templateDataset(template);
  const plan = planFields(dataset, null, null);
  return {
    fields: Object.keys(dataset).length,
    text: plan.text.map(({ field, label }) => ({ field, label })),
    images: plan.images,
    skipped: plan.skipped,
  };
}

/**
 * Foto do Drive já no formato do quadro (feed 4:5), com o carro inteiro na área de baixo e parede limpa em cima.
 * Sem isso o Canva amplia a foto horizontal até encher o quadro vertical e corta o carro.
 */
async function framedPhoto(buffer) {
  const { default: sharp } = await import('sharp');
  const mask = await carMask(buffer);
  const framed = await composePhoto(sharp, buffer, LAYOUTS.vitrine.feed, undefined, isFullCar(mask) ? mask : null);
  return sharp(framed).jpeg({ quality: 90 }).toBuffer();
}

/**
 * Cria a arte do carro no Canva a partir do design-modelo.
 * drivePhotos: fotos da pasta do carro no Drive ({ id, name }), a primeira é a principal.
 */
export async function createCanvaArt({ template, vehicle, name, drivePhotos = [] }) {
  const dataset = await templateDataset(template);
  if (!Object.keys(dataset).length) {
    throw Object.assign(new Error('O modelo do Canva não tem campos de dados. Abra o modelo no Canva › Apps › "Preenchimento automático de dados", crie os campos (NOME, PRECO, KM, ANO, FOTO) e publique como modelo de marca.'), { status: 400 });
  }
  const plan = planFields(dataset, vehicle, name);
  if (plan.images.length && !drivePhotos.length) {
    throw Object.assign(new Error(`Sem fotos de ${name} na pasta do Drive do cliente — a arte nova usa só fotos do Drive.`), { status: 400 });
  }
  const data = {};
  for (const t of plan.text) if (t.value) data[t.field] = { type: 'text', text: t.value };
  const used = [];
  for (const [i, field] of plan.images.entries()) {
    const photo = drivePhotos[i] || drivePhotos[0];
    const assetId = await uploadAsset(await framedPhoto(await downloadFile(photo.id)), `${name} ${i + 1}`);
    data[field] = { type: 'image', asset_id: assetId };
    used.push(photo.name);
  }
  const design = await autofillFromTemplate(template, data, `${name} · ETP`);
  return { design, filled: plan.text.filter((t) => t.value).map((t) => t.field).concat(plan.images), skipped: plan.skipped, photos: used };
}
