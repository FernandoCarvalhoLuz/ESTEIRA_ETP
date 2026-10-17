// Montador da Esteira Automática: lê o carro no site, aplica o padrão do cliente, busca fotos (Drive) e artes (Canva),
// escreve os textos (LLM ou texto-modelo) e entrega um card pronto para aprovação na Esteira.
import { applyPlaceholders, fmtPrice, newAd, newConfig, normalizeConfig, rid } from '../../shared/esteira.js';
import { createDraft, drafts } from '../builder/drafts.js';
import { accountAssets } from '../builder/assets.js';
import { importBuffer, mediaStore } from '../builder/media.js';
import { ensurePattern, getClient, getStock, markNewsUsed } from './clients.js';
import { vehicleDetail } from './sites.js';
import { downloadFile, findVehicleMedia } from './drive.js';
import { canvaPublic, designPages, exportPages } from './canvaConnect.js';
import { extractVehicle, llmEnabled, llmSettings, matchCanvaPages, writeAdCopy } from './llm.js';
import { artEngine, makeArt, photoStyle } from './artMaker.js';
import { rankPhotos } from './photoPick.js';

const STEPS = [
  { key: 'site', label: 'Lendo o anúncio no site' },
  { key: 'padrao', label: 'Aplicando o padrão do cliente' },
  { key: 'fotos', label: 'Buscando fotos no Drive' },
  { key: 'artes', label: 'Buscando ou criando a arte' },
  { key: 'textos', label: 'Escrevendo os textos' },
  { key: 'montagem', label: 'Montando a campanha' },
];

const jobs = new Map();

export function getJob(id) {
  return jobs.get(id) || null;
}

function step(job, key, state, detail) {
  job.steps = job.steps.map((s) => (s.key === key ? { ...s, state, detail: detail ?? s.detail } : s));
  job.updatedAt = Date.now();
}

const media = (item) => ({ kind: 'image', source: 'upload', mediaId: item.id, name: item.canva?.vehicle || item.originalName, thumbUrl: `/api/builder/media/${item.id}/file` });

/** Nome do carro para campanha e anúncio (sem "AUT."/"MEC." e com o ano-modelo). */
export function vehicleName(v) {
  const year = String(v.year || '').split('/').pop();
  const base = [v.brand, v.model, v.version].filter(Boolean).join(' ') || v.title;
  return `${base.replace(/\b(AUT|MEC|4P|2P)\.?(?=\s|$)/gi, '').replace(/\s+/g, ' ').trim()} ${year && !base.includes(year) ? year : ''}`.trim();
}

function offerOf(v) {
  return { title: vehicleName(v), price: fmtPrice(v.price), priceValue: v.price || null, km: v.km || '', year: String(v.year || '').split('/').pop() || '' };
}

/** Texto-modelo (sem LLM) com os dados do carro, no estilo do cliente (marcador, preço, fechamento). */
export function templateCopy(v, style = {}) {
  const b = style.bullet || '✔️';
  const facts = [
    v.year && `Ano ${v.year}`,
    v.km && `${v.km} km`,
    v.transmission && `Câmbio ${String(v.transmission).toLowerCase()}`,
    v.fuel,
    v.color && `Cor ${String(v.color).toLowerCase()}`,
    ...(v.options || []).slice(0, 5),
  ].filter(Boolean);
  const lines = ['{OFERTA}', '', ...facts.map((f) => `${b} ${f}`)];
  if (style.showPrice !== false && v.price) lines.push('', `💰 ${fmtPrice(v.price)}`);
  lines.push('', style.closing || '📲 Chame no WhatsApp e agende sua visita!');
  return { primaryText: lines.join('\n'), headline: '{oferta}', description: style.showPrice !== false && v.price ? '{preco}' : '' };
}

const words = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().split(/[^A-Z0-9-]+/).filter((w) => w.length >= 2 && !/^(19|20)\d\d$/.test(w));

/** Artes do Canva já importadas na biblioteca da conta que combinam com o carro (modelo precisa bater). */
function libraryArts(accountId, v) {
  const model = words(v.model);
  if (!model.length) return null;
  const arts = mediaStore.list().filter((m) => m.accountId === accountId && m.scope === 'canva' && !m.canva?.isBase);
  const score = (m) => {
    const have = new Set(words(`${m.canva?.vehicle} ${m.canva?.year}`));
    if (!model.every((w) => have.has(w))) return 0;
    const year = String(v.year || '').match(/(19|20)\d\d/g) || [];
    return 1 + (year.some((y) => have.has(y)) ? 0.5 : 0) + words(v.version).filter((w) => have.has(w)).length * 0.1;
  };
  const feed = arts.filter((m) => m.canva?.format === 'feed').map((m) => ({ m, s: score(m) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)[0]?.m;
  if (!feed) return null;
  const story = arts.find((m) => m.canva?.format === 'story' && m.canva.vehicle === feed.canva.vehicle && m.canva.year === feed.canva.year && m.canva.variant === feed.canva.variant)
    || arts.find((m) => m.canva?.format === 'story' && m.canva.vehicle === feed.canva.vehicle && m.canva.year === feed.canva.year);
  return { feed, story: story || null };
}

async function fetchBuffer(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Não foi possível baixar a imagem (${res.status}).`);
  return { buffer: Buffer.from(await res.arrayBuffer()), mime: res.headers.get('content-type') || 'image/jpeg' };
}

async function importSitePhoto(accountId, v, url, user) {
  const { buffer, mime } = await fetchBuffer(url);
  return importBuffer({ accountId, buffer, mime, originalName: `${vehicleName(v)} (site).jpg`, scope: 'site', extra: { vehicle: vehicleName(v) }, user });
}

async function importDrivePhoto(accountId, v, photo, user) {
  const buffer = await downloadFile(photo.id);
  return importBuffer({ accountId, buffer, mime: photo.mime, originalName: photo.name, scope: 'drive', extra: { vehicle: vehicleName(v) }, user });
}

/** Arte exportada do Canva e salva na pasta do carro no Drive: feed (4:5) ou stories (9:16) pela proporção. */
async function importDriveArt(accountId, v, art, user) {
  const buffer = await downloadFile(art.id);
  const { default: sharp } = await import('sharp');
  const meta = await sharp(buffer).metadata().catch(() => ({}));
  const ratio = meta.width && meta.height ? meta.height / meta.width : 1.25;
  const format = ratio > 1.5 ? 'story' : 'feed';
  return importBuffer({
    accountId,
    buffer,
    mime: art.mime,
    originalName: art.name,
    scope: 'canva',
    extra: { canva: { template: 'Drive', vehicle: vehicleName(v), year: '', format, variant: art.id.slice(-4), isBase: false, renamed: true, pairKey: `${vehicleName(v)}|drive` } },
    user,
  });
}

/** Guarda a arte nova (gerador da esteira ou Canva) como artes da conta: feed e stories. */
async function importMadeArt(accountId, made, v, user) {
  if (made.engine === 'canva') return importCanvaPages(accountId, made.design.id, await designPages(made.design.id), v, user);
  const name = vehicleName(v);
  const items = [];
  for (const img of made.images) {
    items.push(await importBuffer({
      accountId,
      buffer: img.buffer,
      mime: img.mime || 'image/jpeg',
      originalName: img.fileName || `${name} ${img.format === 'story' ? 'ST' : 'FEED'} (arte da esteira).jpg`,
      scope: 'canva',
      extra: { canva: { template: 'ETP', vehicle: name, year: '', format: img.format, variant: 'etp', isBase: false, renamed: true, pairKey: `${name}|etp` } },
      user,
    }));
  }
  return items;
}

/** Exporta páginas do design do Canva e guarda como artes da conta (feed/stories pela proporção). */
export async function importCanvaPages(accountId, designId, pages, v, user) {
  const urls = await exportPages(designId, pages.map((p) => p.page));
  const items = [];
  for (const [i, url] of urls.entries()) {
    const p = pages[i] || pages[0];
    const { buffer, mime } = await fetchBuffer(url);
    items.push(await importBuffer({
      accountId,
      buffer,
      mime,
      originalName: `${vehicleName(v)} ${p.format === 'story' ? 'ST' : 'FEED'} (pág. ${p.page}).png`,
      scope: 'canva',
      extra: { canva: { template: 'Canva', vehicle: vehicleName(v), year: '', format: p.format === 'story' ? 'story' : 'feed', variant: String(p.page), isBase: false, renamed: true, pairKey: `${vehicleName(v)}|page` } },
      user,
    }));
  }
  return items;
}

function thumbToImage(url) {
  return fetchBuffer(url).then(({ buffer, mime }) => ({ mediaType: mime.split(';')[0], base64: buffer.toString('base64') }));
}

function chooseBase(pattern, mode, warnings) {
  if (!pattern) return null;
  const own = mode === 'multi' ? pattern.multi : pattern.single;
  const other = mode === 'multi' ? pattern.single : pattern.multi;
  const cost = (b) => b?.metrics?.costPerConversation ?? Infinity;
  if (own && (!other || cost(own) <= cost(other) * 1.5)) return own;
  if (other) {
    warnings.push(mode === 'multi'
      ? 'O cliente quase não usa campanhas com vários carros: usei os públicos da melhor campanha de um carro só.'
      : `Usei os públicos da melhor campanha do cliente (“${other.campaignName}”), que tem custo por conversa melhor que as de um carro só.`);
    return other;
  }
  return own;
}

/**
 * input = { accountId, accountName, mode: 'single'|'multi', structure: 'audiences'|'adsetPerCar', groupName, vehicleIds, manualTitle, user }
 */
export function startBuild(input) {
  const id = rid();
  const job = { id, input: { ...input, user: undefined }, steps: STEPS.map((s) => ({ ...s, state: 'pending', detail: null })), status: 'running', warnings: [], result: null, error: null, createdAt: Date.now(), updatedAt: Date.now() };
  jobs.set(id, job);
  for (const [k, j] of jobs) if (Date.now() - j.createdAt > 6 * 3600_000) jobs.delete(k);
  runBuild(job, input).catch((err) => {
    console.warn('[esteira-auto] falha ao montar:', err.message);
    const current = job.steps.find((s) => s.state === 'running');
    if (current) step(job, current.key, 'error', err.message);
    job.status = 'failed';
    job.error = err.message;
  });
  return job;
}

async function runBuild(job, input) {
  const { accountId, user } = input;
  const client = getClient(accountId);
  if (!client?.site?.url && client?.drive?.folderId) job.steps = job.steps.map((s) => (s.key === 'site' ? { ...s, label: 'Lendo a descrição na pasta do Drive' } : s));
  const warnings = job.warnings;
  const choices = {};

  // 1. Site
  step(job, 'site', 'running');
  let vehicles = [];
  if (input.vehicleIds?.length) {
    const stock = await getStock(accountId);
    for (const vid of input.vehicleIds) {
      const v = stock.items.find((x) => x.id === vid);
      if (!v) throw new Error(`O veículo ${vid} não está mais no estoque ${client.site?.url ? 'do site' : 'da pasta do Drive'}.`);
      step(job, 'site', 'running', v.title);
      // Carro das pastas do Drive: os dados já vêm da descrição (.docx) do cliente.
      vehicles.push(v.source === 'drive' ? v : await vehicleDetail(v, client.site.platform, { llm: llmEnabled() ? extractVehicle : null }));
    }
  } else if (input.manualTitle) {
    vehicles = [{ id: `manual-${Date.now()}`, title: input.manualTitle, brand: '', model: input.manualTitle.split(' ')[1] || input.manualTitle, version: '', photos: [], options: [] }];
    warnings.push('Carro digitado à mão: sem dados do site (KM, preço e opcionais ficam em branco).');
  }
  if (!vehicles.length) throw new Error('Escolha pelo menos um veículo.');
  step(job, 'site', 'done', vehicles.length === 1 ? `${vehicleName(vehicles[0])}${vehicles[0].price ? ` · ${fmtPrice(vehicles[0].price)}` : ''}` : `${vehicles.length} veículos`);
  for (const v of vehicles) if (!v.price) warnings.push(v.source === 'drive' ? `${vehicleName(v)}: a descrição na pasta do Drive não tem "Valor à vista".` : `${vehicleName(v)}: o site não mostra o preço.`);

  // 2. Padrão
  step(job, 'padrao', 'running', 'Lendo o histórico da conta na Meta');
  const pattern = await ensurePattern(accountId);
  const base = chooseBase(pattern, input.mode, warnings);
  let config = base ? normalizeConfig(base.config) : newConfig(accountId);
  if (!base) warnings.push('Não encontrei campanhas de WhatsApp anteriores nesta conta: usei a configuração padrão da Esteira.');
  config.accountId = accountId;
  config.objective = pattern?.objective || config.objective;
  config.budget = { ...config.budget, startDate: null, endDate: null };
  if (!config.destination.pageId) {
    const assets = await accountAssets(accountId);
    const page = assets.pages[0];
    if (page) Object.assign(config.destination, { pageId: page.id, pageName: page.name, instagramId: page.instagram?.id || '', instagramUsername: page.instagram?.username || '' });
  }
  step(job, 'padrao', 'done', base ? `Base: “${base.campaignName}”${base.metrics?.costPerConversation ? ` · R$ ${base.metrics.costPerConversation.toFixed(2).replace('.', ',')}/conversa` : ''}` : 'Configuração padrão');

  // 3. Fotos (Drive → site)
  step(job, 'fotos', 'running');
  const photoOf = new Map();
  const driveReady = Boolean(client?.drive?.folderId);
  const driveArts = new Map();
  for (const v of vehicles) {
    const name = vehicleName(v);
    choices[v.id] = { sitePhotos: (v.photos || []).slice(0, 12), drivePhotos: [], driveArts: [], driveFolder: null, canvaPages: [], designId: client?.canva?.designId || null };
    try {
      if (driveReady) {
        step(job, 'fotos', 'running', `Procurando a pasta de ${name}`);
        const found = await findVehicleMedia(client.drive.folderId, v, client.drive.resourceKey);
        // Capa = foto externa de frente em 3/4 (a 01 da pasta às vezes é o interior).
        found.photos = await rankPhotos(found.photos, { style: photoStyle(client) });
        choices[v.id].drivePhotos = found.photos;
        choices[v.id].driveArts = found.arts;
        choices[v.id].driveFolder = found.folder;
        if (found.arts.length) driveArts.set(v.id, found.arts);
        if (found.photos[0]) {
          photoOf.set(v.id, await importDrivePhoto(accountId, v, found.photos[0], user));
          continue;
        }
        if (!found.arts.length) warnings.push(found.folder ? `${name}: a pasta “${found.folder.name}” do Drive está sem fotos.` : `${name}: não achei a pasta deste carro no Drive (as subpastas devem ter o nome do carro).`);
      }
      if (v.photos?.[0]) photoOf.set(v.id, await importSitePhoto(accountId, v, v.photos[0], user));
    } catch (err) {
      warnings.push(`${name}: ${err.message}`);
    }
  }
  step(job, 'fotos', 'done', driveReady ? `${[...photoOf.values()].filter((m) => m.scope === 'drive').length} de ${vehicles.length} com foto do Drive` : 'Pasta do Drive não informada · fotos do site');

  // 4. Artes do Canva (biblioteca da conta → design conectado)
  step(job, 'artes', 'running');
  const artOf = new Map();
  const canvaReady = canvaPublic().connected && client?.canva?.designId;
  // Arte nova quando o carro não tem arte pronta: gerador próprio (ETP) ou modelo do Canva, conforme o cliente.
  const engine = artEngine(client);
  const templateReady = Boolean(engine);
  const createArt = async (v, name) => {
    try {
      step(job, 'artes', 'running', `Criando a arte de ${name} (${engine === 'canva' ? 'modelo do Canva' : 'gerador da esteira'} + fotos do Drive)`);
      const made = await makeArt({ client, vehicle: v, name, drivePhotos: choices[v.id].drivePhotos });
      const items = await importMadeArt(accountId, made, v, user);
      choices[v.id].created = { engine: made.engine, designId: made.design?.id || null, url: made.design?.url || null, photos: made.photos, photoId: made.photoId || null, pickedBy: made.pickedBy || null, ai: made.ai ?? null, skipped: made.skipped || [] };
      if (made.ai === false) warnings.push(`${name}: a ampliação do cenário com IA não rodou — o fundo saiu pelo preenchimento simples.`);
      const feed = items.find((m) => m.canva.format === 'feed') || items[0];
      artOf.set(v.id, { feed, story: items.find((m) => m.canva.format === 'story') || null });
      if (made.design?.trial?.uses_remaining != null) warnings.push(`Canva: preenchimento automático em teste — restam ${made.design.trial.uses_remaining} uso(s).`);
      return true;
    } catch (err) {
      warnings.push(`${name}: não foi possível criar a arte — ${err.message}`);
      return false;
    }
  };
  let pages = null;
  for (const v of vehicles) {
    const name = vehicleName(v);
    const arts = driveArts.get(v.id);
    if (arts?.length) {
      try {
        step(job, 'artes', 'running', `Artes de ${name} na pasta do Drive`);
        const items = [];
        for (const a of arts.slice(0, 4)) items.push(await importDriveArt(accountId, v, a, user));
        const feed = items.find((m) => m.canva.format === 'feed');
        const story = items.find((m) => m.canva.format === 'story');
        if (feed || story) { artOf.set(v.id, { feed: feed || story, story: feed ? story || null : null }); continue; }
      } catch (err) {
        warnings.push(`${name}: ${err.message}`);
      }
    }
    const lib = libraryArts(accountId, v);
    if (lib) { artOf.set(v.id, lib); continue; }
    if (!canvaReady) {
      if (templateReady) await createArt(v, name);
      continue;
    }
    try {
      pages ||= await designPages(client.canva.designId);
      choices[v.id].canvaPages = pages;
      const provider = llmSettings().provider;
      if (provider === 'claude' && llmEnabled()) {
        step(job, 'artes', 'running', `Procurando ${name} nas ${pages.length} páginas do design`);
        const withImages = [];
        for (const p of pages.filter((x) => x.thumb).slice(0, 60)) {
          try { withImages.push({ index: p.page, ...(await thumbToImage(p.thumb)) }); } catch { /* miniatura indisponível */ }
        }
        const match = await matchCanvaPages({ vehicleTitle: name, pages: withImages });
        const chosen = pages.filter((p) => match.pages.includes(p.page));
        if (chosen.length) {
          const items = await importCanvaPages(accountId, client.canva.designId, chosen, v, user);
          const feed = items.find((m) => m.canva.format === 'feed') || items[0];
          artOf.set(v.id, { feed, story: items.find((m) => m.canva.format === 'story') || null });
          continue;
        }
      }
      // Sem página pronta para o carro: cria uma nova pelo modelo (o catálogo continua disponível na revisão).
      if (templateReady && await createArt(v, name)) continue;
      warnings.push(`${name}: escolha as páginas da arte no Canva na revisão (${pages.length} páginas no design).`);
    } catch (err) {
      warnings.push(`Canva: ${err.message}`);
      if (templateReady && !artOf.has(v.id)) await createArt(v, name);
    }
  }
  const created = vehicles.filter((v) => choices[v.id].created).length;
  step(job, 'artes', 'done', `${artOf.size} de ${vehicles.length} com arte${created ? ` · ${created} criada(s) ${engine === 'canva' ? 'no Canva' : 'pela esteira'}` : ''}${canvaReady || templateReady ? '' : ' (artes da pasta do Drive e da biblioteca da conta)'}`);

  // 5. Textos
  step(job, 'textos', 'running');
  const copyOf = new Map();
  const useLlm = llmEnabled();
  for (const v of vehicles) {
    const name = vehicleName(v);
    if (v.source === 'drive' && v.description) {
      // O cliente já escreveu a descrição do anúncio no .docx da pasta do carro: vai como está.
      copyOf.set(v.id, { primaryText: v.description, headline: '{oferta}', description: v.price ? '{preco}' : '' });
      continue;
    }
    if (useLlm) {
      step(job, 'textos', 'running', `${name} · ${llmSettings().provider === 'ollama' ? 'LLM local (pode levar ~2 min)' : 'Claude'}`);
      try {
        copyOf.set(v.id, await writeAdCopy({ vehicle: { ...v, title: name }, examples: pattern?.examples || [], clientName: pattern?.accountName, showPrice: pattern?.style?.showPrice }));
        continue;
      } catch (err) {
        warnings.push(`Textos de ${name}: ${err.message} — usei o texto-modelo.`);
      }
    }
    copyOf.set(v.id, templateCopy(v, pattern?.style));
  }
  const fromDocs = vehicles.filter((v) => v.source === 'drive' && v.description).length;
  step(job, 'textos', 'done', fromDocs === vehicles.length ? 'Descrição do cliente (pasta do Drive)' : useLlm ? `Escritos pela LLM (${llmSettings().provider === 'claude' ? 'Claude' : 'local'})` : 'Texto-modelo com os dados do site');

  // 6. Montagem
  step(job, 'montagem', 'running');
  const adName = pattern?.adNamePattern || '{OFERTA}';
  const makeAd = (v) => {
    const art = artOf.get(v.id);
    const photo = photoOf.get(v.id);
    const copy = copyOf.get(v.id);
    return {
      ...newAd(),
      name: adName,
      primaryText: copy.primaryText,
      headline: copy.headline,
      description: copy.description,
      media: art ? media(art.feed) : photo ? media(photo) : null,
      storyMedia: art?.story ? media(art.story) : null,
      vehicleId: v.id,
    };
  };

  if (input.mode === 'multi') {
    config.offer = { title: (input.groupName || 'Estoque').trim(), price: '', priceValue: null, km: '', year: '' };
    config.ads = vehicles.map((v) => ({ ...makeAd(v), offer: offerOf(v) }));
    if (input.structure === 'adsetPerCar') {
      const template = config.adsets[0];
      config.adsets = config.ads.map((ad) => ({ ...JSON.parse(JSON.stringify(template)), key: rid(), name: applyPlaceholders('{OFERTA}', config, ad) }));
      config.ads.forEach((ad, i) => { ad.adsetKeys = [config.adsets[i].key]; });
    }
  } else {
    config.offer = offerOf(vehicles[0]);
    config.ads = [makeAd(vehicles[0])];
  }
  config.publish = { status: 'PAUSED' };

  const draft = createDraft({
    accountId,
    accountName: input.accountName || pattern?.accountName || '',
    config,
    origin: {
      type: 'auto',
      jobId: job.id,
      mode: input.mode,
      structure: input.mode === 'multi' ? input.structure : null,
      groupName: input.groupName || null,
      base: base ? { campaignId: base.campaignId, campaignName: base.campaignName, metrics: base.metrics } : null,
      vehicles: vehicles.map((v) => ({
        id: v.id, title: vehicleName(v), url: v.url || null, thumb: v.thumb || v.photos?.[0] || null, price: v.price || null, km: v.km || '', year: v.year || '',
        // Dados extras para criar a arte no Canva também a partir da revisão.
        brand: v.brand || '', model: v.model || '', version: v.version || '', color: v.color || '', fuel: v.fuel || '', transmission: v.transmission || '', options: (v.options || []).slice(0, 8),
        source: v.source || 'site', folderId: v.folderId || null, folderName: v.folderName || null, carName: v.carName || null, highlights: v.highlights || null,
      })),
      copySource: useLlm ? llmSettings().provider : 'template',
      warnings,
      choices,
    },
    user,
  });
  if (input.vehicleIds?.length) markNewsUsed(accountId, input.vehicleIds, draft.id);
  step(job, 'montagem', 'done', `${config.adsets.length} conjunto(s) · ${config.ads.length} anúncio(s)`);
  job.status = 'done';
  job.result = { draftId: draft.id };
}

/** Troca a mídia de um anúncio na revisão (foto do Drive/site ou páginas do Canva). */
export async function swapMedia(draftId, { adKey, slot = 'media', from, ref, user }) {
  const d = drafts.get(draftId);
  if (!d) throw Object.assign(new Error('Rascunho não encontrado.'), { status: 404 });
  const ad = d.config.ads.find((a) => a.key === adKey);
  if (!ad) throw Object.assign(new Error('Anúncio não encontrado.'), { status: 404 });
  const v = d.origin?.vehicles?.find((x) => x.id === ad.vehicleId) || { title: ad.offer?.title || d.config.offer.title };
  const vv = { ...v, brand: '', model: v.title, version: '' };
  let items = [];
  if (from === 'drive') items = [await importDrivePhoto(d.accountId, vv, ref, user)];
  else if (from === 'drive-art') items = [await importDriveArt(d.accountId, vv, ref, user)];
  else if (from === 'site') items = [await importSitePhoto(d.accountId, vv, ref, user)];
  else if (from === 'canva') items = await importCanvaPages(d.accountId, ref.designId, ref.pages, vv, user);
  else if (from === 'canva-new') {
    // Arte nova (gerador da esteira ou modelo do Canva), com as fotos do Drive encontradas na montagem.
    const client = getClient(d.accountId);
    const choice = d.origin?.choices?.[v.id] || {};
    let drivePhotos = choice.drivePhotos || [];
    if (!drivePhotos.length && client.drive?.folderId) drivePhotos = await rankPhotos((await findVehicleMedia(client.drive.folderId, v, client.drive.resourceKey)).photos, { style: photoStyle(client) });
    // Foto escolhida (ref.photoId) e textos ajustados (ref.overrides) na revisão.
    const overrides = ref?.overrides || choice.created?.overrides || {};
    const made = await makeArt({ client, vehicle: v, name: v.title, drivePhotos, overrides, photoId: ref?.photoId || null });
    items = await importMadeArt(d.accountId, made, vv, user);
    const created = { engine: made.engine, designId: made.design?.id || null, url: made.design?.url || null, photos: made.photos, photoId: made.photoId || null, pickedBy: made.pickedBy || null, ai: made.ai ?? null, overrides, skipped: made.skipped || [] };
    drafts.update(draftId, (cur) => ({ origin: { ...cur.origin, choices: { ...cur.origin.choices, [v.id]: { ...choice, created } } } }));
  } else throw Object.assign(new Error('Origem inválida.'), { status: 400 });
  const feed = items.find((m) => m.canva?.format !== 'story') || items[0];
  const story = items.find((m) => m.canva?.format === 'story');
  return drafts.update(draftId, (cur) => ({
    config: {
      ...cur.config,
      ads: cur.config.ads.map((a) => {
        if (a.key !== adKey) return a;
        if (from === 'canva' || from === 'canva-new' || from === 'drive-art') {
          if (story && !items.some((m) => m.canva?.format !== 'story')) return { ...a, source: 'new', storyMedia: media(story) };
          return { ...a, source: 'new', media: feed ? media(feed) : a.media, storyMedia: story ? media(story) : a.storyMedia };
        }
        return { ...a, source: 'new', [slot]: media(feed), ...(slot === 'media' ? { storyMedia: a.storyMedia } : {}) };
      }),
    },
  }));
}
