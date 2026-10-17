// Modelos de campanha: captura de campanhas existentes na Meta e sugestões das que "deram certo".
import { graph, mapLimit, MetaApiError } from '../meta/client.js';
import { budgetValue, extract, metricsFrom, sumMetrics } from '../meta/metrics.js';
import { resolveRange } from '../meta/dates.js';
import { collection, settings } from '../store.js';
import {
  isTemplateCandidate, newAd, newAdset, newConfig, normalizeConfig, OBJECTIVES, parseDevices, parseGeo, PLACEMENTS, rid, tokenizeText,
} from '../../shared/esteira.js';

export const templates = collection('templates');

const INSIGHT_FIELDS = 'spend,impressions,reach,clicks,inline_link_clicks,actions';
const NAME_STOPWORDS = new Set(['DOM', 'ENGAJAMENTO', 'MENSAGEM', 'MENSAGENS', 'WHATSAPP', 'WPP', 'CBO', 'ABO', 'TRAFEGO', 'TRÁFEGO', 'CONVERSAO', 'CONVERSÃO', 'LEADS', 'CADASTRO', 'ESTOQUE', 'REMARKETING', 'DIRECT']);

function performanceSnapshot(m, accountAvg, range) {
  return {
    spend: m.spend,
    conversations: m.conversations,
    costPerConversation: m.costPerConversation,
    firstReplies: m.firstReplies,
    linkCtr: m.linkCtr,
    cpm: m.cpm,
    accountCostPerConversation: accountAvg,
    range,
    capturedAt: new Date().toISOString(),
  };
}

/** Separa o "veículo/oferta" do padrão de nome, ex.: "[DOM] [ONIX 2024] [ENGAJAMENTO]" → oferta ONIX 2024. */
function splitName(name) {
  const segments = [...name.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim());
  const offer = segments.find((s) => !NAME_STOPWORDS.has(s.toUpperCase()) && s.length > 2);
  if (!offer) return { offer: '', pattern: name };
  return { offer, pattern: name.replace(`[${offer}]`, '[{OFERTA}]') };
}

function parseWelcome(raw) {
  if (!raw) return null;
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const msg = data?.text_format?.message;
    if (!msg) return null;
    return { greeting: msg.text || '', autofill: msg.autofill_message?.content || '' };
  } catch {
    return null;
  }
}

export function parseTargeting(t = {}) {
  const extra = JSON.parse(JSON.stringify(t));
  const geo = t.geo_locations || {};
  const adset = newAdset();
  adset.locationTypes = geo.location_types || ['home', 'recent'];
  adset.geo = parseGeo(t);
  adset.devices = parseDevices(t);
  adset.ageMin = t.age_min || 18;
  adset.ageMax = t.age_max || 65;
  adset.genders = t.genders || [];
  adset.advantageAudience = t.targeting_automation?.advantage_audience === 1;
  adset.customAudiences = (t.custom_audiences || []).map((a) => ({ id: a.id, name: a.name || a.id }));
  adset.excludedAudiences = (t.excluded_custom_audiences || []).map((a) => ({ id: a.id, name: a.name || a.id }));

  const flexible = t.flexible_spec || [];
  adset.interests = flexible.flatMap((g) => g.interests || []).map((i) => ({ id: i.id, name: i.name }));
  const flexibleExtra = {};
  for (const group of flexible) {
    for (const [key, value] of Object.entries(group)) if (key !== 'interests') flexibleExtra[key] = value;
  }
  adset.flexibleExtra = flexibleExtra;

  if (t.publisher_platforms?.length) {
    const keys = [];
    for (const pos of t.facebook_positions || []) keys.push(`facebook:${pos}`);
    for (const pos of t.instagram_positions || []) keys.push(`instagram:${pos}`);
    adset.placements = keys.filter((k) => PLACEMENTS.some((p) => p.key === k));
    if (!adset.placements.length) adset.placements = 'auto';
  }
  for (const key of ['geo_locations', 'excluded_geo_locations', 'age_min', 'age_max', 'genders', 'flexible_spec', 'custom_audiences', 'excluded_custom_audiences', 'targeting_optimization_types',
    'publisher_platforms', 'facebook_positions', 'instagram_positions', 'messenger_positions', 'audience_network_positions', 'device_platforms', 'user_os', 'user_device', 'excluded_user_device']) {
    delete extra[key];
  }
  if (extra.targeting_automation) delete extra.targeting_automation.advantage_audience;
  adset.extraTargeting = extra;
  return adset;
}

function parseCreative(creative = {}, fallbackName) {
  const story = creative.object_story_spec || {};
  const ld = story.link_data;
  const vd = story.video_data;
  const af = creative.asset_feed_spec;
  const ad = newAd();
  ad.name = fallbackName || creative.name || ad.name;
  let welcome = null;

  const existingId = creative.source_instagram_media_id || (!ld && !vd && !af ? creative.object_story_id || creative.effective_object_story_id : null);
  if (existingId) {
    const instagram = Boolean(creative.source_instagram_media_id);
    ad.source = 'existing';
    ad.post = {
      platform: instagram ? 'instagram' : 'facebook',
      id: existingId,
      message: creative.body || '',
      picture: creative.thumbnail_url || creative.image_url || null,
      permalink: creative.instagram_permalink_url || null,
    };
    ad.primaryText = creative.body || '';
    return { ad, welcome: parseWelcome(creative.page_welcome_message), instagramId: creative.instagram_user_id || null };
  }

  if (vd) {
    ad.media = { kind: 'video', source: 'meta', videoId: vd.video_id, thumbUrl: vd.image_url || creative.thumbnail_url || null, name: creative.name };
    ad.primaryText = vd.message || '';
    ad.headline = vd.title || '';
    ad.description = vd.link_description || '';
    welcome = vd.page_welcome_message || vd.call_to_action?.value?.page_welcome_message;
  } else if (ld) {
    const child = ld.child_attachments?.[0];
    const hash = ld.image_hash || child?.image_hash;
    if (hash) ad.media = { kind: 'image', source: 'meta', hash, thumbUrl: creative.image_url || ld.picture || creative.thumbnail_url || null, name: creative.name };
    ad.primaryText = ld.message || '';
    ad.headline = ld.name || child?.name || '';
    ad.description = ld.description || child?.description || '';
    welcome = ld.page_welcome_message || ld.call_to_action?.value?.page_welcome_message;
  } else if (af) {
    ad.primaryText = af.bodies?.[0]?.text || '';
    ad.headline = af.titles?.[0]?.text || '';
    ad.description = af.descriptions?.[0]?.text || '';
    if (af.videos?.length) {
      ad.media = { kind: 'video', source: 'meta', videoId: af.videos[0].video_id, thumbUrl: af.videos[0].thumbnail_url || creative.thumbnail_url || null, name: creative.name };
    } else if (af.images?.length) {
      const labelled = (name) => af.images.find((img) => img.adlabels?.some((l) => l.name?.toLowerCase().includes(name)));
      const feed = labelled('feed') || af.images[0];
      const stories = labelled('stor');
      ad.media = { kind: 'image', source: 'meta', hash: feed.hash, thumbUrl: creative.thumbnail_url || null, name: creative.name };
      if (stories && stories.hash !== feed.hash) ad.storyMedia = { kind: 'image', source: 'meta', hash: stories.hash, thumbUrl: null, name: `${creative.name} (stories)` };
    }
    welcome = af.additional_data?.page_welcome_message;
  }
  return { ad, welcome: parseWelcome(welcome), instagramId: creative.instagram_user_id || story.instagram_user_id || null };
}

/** Busca URLs atuais das imagens (por hash) e vídeos para as miniaturas do modelo. */
async function hydrateThumbnails(accountId, ads) {
  const hashes = [...new Set(ads.flatMap((a) => [a.media, a.storyMedia]).filter((m) => m?.kind === 'image').map((m) => m.hash))];
  const videos = [...new Set(ads.filter((a) => a.media?.kind === 'video').map((a) => a.media.videoId))];
  const [imgs, vids] = await Promise.all([
    hashes.length ? graph(`${accountId}/adimages`, { hashes, fields: 'hash,url,permalink_url' }).catch(() => ({ data: [] })) : { data: [] },
    videos.length ? graph('', { ids: videos.join(','), fields: 'picture' }).catch(() => ({})) : {},
  ]);
  const byHash = new Map((imgs.data || []).map((i) => [i.hash, i.permalink_url || i.url]));
  for (const ad of ads) {
    if (ad.storyMedia && byHash.get(ad.storyMedia.hash)) ad.storyMedia.thumbUrl = byHash.get(ad.storyMedia.hash);
    if (ad.media?.kind === 'image' && byHash.get(ad.media.hash)) ad.media.thumbUrl = byHash.get(ad.media.hash);
    if (ad.media?.kind === 'video' && vids[ad.media.videoId]?.picture) ad.media.thumbUrl = vids[ad.media.videoId].picture;
  }
}

export async function captureCampaign(campaignId, { range = resolveRange({ preset: 'last_30d' }) } = {}) {
  const c = await graph(campaignId, {
    fields: [
      'name,account_id,objective,bid_strategy,daily_budget,lifetime_budget,is_adset_budget_sharing_enabled',
      'adsets.limit(50){id,name,optimization_goal,bid_strategy,bid_amount,daily_budget,lifetime_budget,destination_type,promoted_object,targeting,effective_status}',
      'ads.limit(100){id,name,adset_id,effective_status,creative{id,name,body,thumbnail_url,image_url,instagram_user_id,object_story_spec,asset_feed_spec,object_story_id,effective_object_story_id,source_instagram_media_id,instagram_permalink_url,page_welcome_message}}',
    ].join(','),
  }, { fresh: true });

  const accountId = `act_${c.account_id}`;
  const timeRange = { since: range.since, until: range.until };
  const [account, campInsights, accInsights] = await Promise.all([
    graph(accountId, { fields: 'id,name,currency' }),
    graph(`${campaignId}/insights`, { fields: INSIGHT_FIELDS, time_range: timeRange }),
    graph(`${accountId}/insights`, { fields: INSIGHT_FIELDS, time_range: timeRange }),
  ]);
  const currency = account.currency;

  const config = newConfig(accountId);
  const { offer, pattern } = splitName(c.name);
  config.offer.title = offer;
  config.naming.campaign = pattern;
  if (OBJECTIVES.some((o) => o.key === c.objective)) config.objective = c.objective;

  // Conjuntos (sem duplicar nomes) — prioriza os ativos.
  const adsetsRaw = (c.adsets?.data || []).sort((a, b) => (a.effective_status === 'ACTIVE' ? -1 : 0) - (b.effective_status === 'ACTIVE' ? -1 : 0));
  const seenAdsets = new Set();
  config.adsets = [];
  for (const a of adsetsRaw) {
    if (seenAdsets.has(a.name)) continue;
    seenAdsets.add(a.name);
    const adset = parseTargeting(a.targeting);
    adset.name = tokenizeText(a.name, offer);
    adset.amount = budgetValue(a.daily_budget || a.lifetime_budget, currency) || 20;
    config.adsets.push(adset);
  }
  if (!config.adsets.length) config.adsets = [newAdset()];

  const firstAdset = adsetsRaw[0];
  if (firstAdset?.optimization_goal === 'LINK_CLICKS') config.performanceGoal = 'LINK_CLICKS';
  config.destination.pageId = firstAdset?.promoted_object?.page_id || '';
  config.destination.whatsappNumber = firstAdset?.promoted_object?.whatsapp_phone_number || '';

  const campaignBudget = budgetValue(c.daily_budget || c.lifetime_budget, currency);
  const sampleBudgetAdset = adsetsRaw.find((a) => a.daily_budget || a.lifetime_budget);
  config.budget = {
    ...config.budget,
    level: campaignBudget ? 'campaign' : 'adset',
    type: (c.lifetime_budget || sampleBudgetAdset?.lifetime_budget) ? 'lifetime' : 'daily',
    amount: campaignBudget || 30,
    bidStrategy: c.bid_strategy || firstAdset?.bid_strategy || 'LOWEST_COST_WITHOUT_CAP',
    costCap: firstAdset?.bid_amount ? budgetValue(firstAdset.bid_amount, currency) : null,
  };
  if (config.budget.type === 'lifetime') config.budget.type = 'daily'; // datas antigas não se aplicam a uma nova campanha

  // Anúncios (o mesmo anúncio costuma se repetir em vários conjuntos).
  const seenAds = new Set();
  config.ads = [];
  let welcome = null;
  for (const ad of c.ads?.data || []) {
    if (seenAds.has(ad.name)) continue;
    seenAds.add(ad.name);
    const parsed = parseCreative(ad.creative, ad.name);
    for (const field of ['name', 'primaryText', 'headline', 'description']) parsed.ad[field] = tokenizeText(parsed.ad[field], offer);
    config.ads.push(parsed.ad);
    welcome ||= parsed.welcome;
    if (!config.destination.instagramId && parsed.instagramId) config.destination.instagramId = parsed.instagramId;
  }
  if (!config.ads.length) config.ads = [newAd()];
  if (welcome) {
    config.destination.greeting = tokenizeText(welcome.greeting, offer) || config.destination.greeting;
    config.destination.autofill = tokenizeText(welcome.autofill, offer) || config.destination.autofill;
  }
  await hydrateThumbnails(accountId, config.ads);

  if (config.destination.pageId) {
    const page = await graph(config.destination.pageId, { fields: 'name,instagram_business_account{id,username}' }).catch(() => null);
    config.destination.pageName = page?.name || '';
    if (page?.instagram_business_account && (!config.destination.instagramId || config.destination.instagramId === page.instagram_business_account.id)) {
      config.destination.instagramId = page.instagram_business_account.id;
      config.destination.instagramUsername = page.instagram_business_account.username;
    }
  }

  const metrics = metricsFrom(campInsights.data?.[0]);
  const accountMetrics = metricsFrom(accInsights.data?.[0]);
  return {
    accountId,
    accountName: account.name,
    campaignName: c.name,
    config,
    performance: performanceSnapshot(metrics, accountMetrics.costPerConversation, timeRange),
  };
}

export async function createTemplateFromCampaign(campaignId, { name, description, user, range } = {}) {
  const existing = templates.list().find((t) => t.source?.campaignId === campaignId);
  if (existing) return { template: existing, existed: true };
  const captured = await captureCampaign(campaignId, { range });
  const template = templates.insert({
    accountId: captured.accountId,
    accountName: captured.accountName,
    name: name?.trim() || captured.config.offer.title || captured.campaignName,
    description: description?.trim() || '',
    source: { type: 'campaign', campaignId, campaignName: captured.campaignName },
    performance: captured.performance,
    config: captured.config,
    usageCount: 0,
    createdBy: user?.username || null,
  });
  return { template, existed: false };
}

/** Campanhas com custo por conversa bem abaixo da média da conta (últimos 30 dias). */
export async function suggestions({ fresh } = {}) {
  const range = resolveRange({ preset: 'last_30d' });
  const timeRange = { since: range.since, until: range.until };
  const dismissed = new Set(settings.get().dismissedSuggestions || []);
  const saved = new Set(templates.list().map((t) => t.source?.campaignId).filter(Boolean));
  const { data: accounts } = await graph('me/adaccounts', { fields: 'id,name,account_status,currency', limit: 200 }, { all: true, fresh });

  const perAccount = await mapLimit(accounts.filter((a) => a.account_status === 1), 4, async (acc) => {
    try {
      const { data } = await graph(`${acc.id}/insights`, {
        level: 'campaign',
        fields: `campaign_id,campaign_name,${INSIGHT_FIELDS}`,
        time_range: timeRange,
        limit: 500,
      }, { all: true, fresh });
      const rows = data.map((r) => ({ id: r.campaign_id, name: r.campaign_name, metrics: metricsFrom(r) }));
      const accountMetrics = sumMetrics(data.map((r) => extract(r)));
      return rows
        .filter((r) => isTemplateCandidate(r.metrics, accountMetrics) && !dismissed.has(r.id) && !saved.has(r.id))
        .map((r) => ({
          accountId: acc.id,
          accountName: acc.name,
          campaignId: r.id,
          campaignName: r.name,
          spend: r.metrics.spend,
          conversations: r.metrics.conversations,
          costPerConversation: r.metrics.costPerConversation,
          accountCostPerConversation: accountMetrics.costPerConversation,
          savingsPct: (1 - r.metrics.costPerConversation / accountMetrics.costPerConversation) * 100,
        }));
    } catch (err) {
      if (err instanceof MetaApiError && err.kind === 'token') throw err;
      return [];
    }
  });

  return {
    range: timeRange,
    items: perAccount.flat().sort((a, b) => b.savingsPct - a.savingsPct),
  };
}

export function dismissSuggestion(campaignId) {
  const list = new Set(settings.get().dismissedSuggestions || []);
  list.add(campaignId);
  settings.update({ dismissedSuggestions: [...list] });
}

export function templateFromDraft(draft, { name, user }) {
  return templates.insert({
    accountId: draft.config.accountId,
    accountName: draft.accountName || '',
    name: name?.trim() || draft.config.offer.title || 'Modelo',
    description: '',
    source: { type: 'draft', draftId: draft.id, campaignId: draft.publish?.created?.campaignId || null, campaignName: draft.title },
    performance: null,
    config: normalizeConfig({ ...draft.config, ads: draft.config.ads.map((a) => ({ ...a, key: rid() })) }),
    usageCount: 0,
    createdBy: user?.username || null,
  });
}
