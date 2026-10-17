// Dados de apoio para montar campanhas: páginas, Instagram, números de WhatsApp, públicos e buscas.
import { graph, MetaApiError, rawRequest } from '../meta/client.js';
import { budgetValue } from '../meta/metrics.js';
import { buildTargeting } from '../../shared/esteira.js';

const empty = () => ({ data: [] });

export async function accountAssets(accountId, { fresh } = {}) {
  const [account, pages, igAccounts, adsets, audiences] = await Promise.all([
    graph(accountId, { fields: 'id,name,currency,timezone_name,min_daily_budget,account_status' }, { fresh }),
    graph(`${accountId}/promote_pages`, {
      fields: 'id,name,picture{url},instagram_business_account{id,username,profile_picture_url},location',
      limit: 100,
    }, { all: true, fresh }).catch(() => graph(`${accountId}/promote_pages`, { fields: 'id,name', limit: 100 }, { all: true, fresh })),
    graph(`${accountId}/instagram_accounts`, { fields: 'id,username,profile_pic', limit: 100 }, { all: true, fresh }).catch(empty),
    graph(`${accountId}/adsets`, {
      fields: 'promoted_object,destination_type',
      filtering: [{ field: 'optimization_goal', operator: 'IN', value: ['CONVERSATIONS'] }],
      limit: 500,
    }, { all: true, fresh, maxPages: 4 }).catch(empty),
    graph(`${accountId}/customaudiences`, { fields: 'id,name,subtype', limit: 200 }, { all: true, fresh, maxPages: 3 }).catch(empty),
  ]);

  // O número do WhatsApp não é legível pela página com este token: aproveitamos os já usados nos conjuntos.
  const numbers = new Map();
  for (const a of adsets.data) {
    const phone = a.promoted_object?.whatsapp_phone_number;
    if (!phone) continue;
    const entry = numbers.get(phone) || { number: phone, pageId: a.promoted_object.page_id, uses: 0 };
    entry.uses += 1;
    numbers.set(phone, entry);
  }

  return {
    account: {
      id: account.id,
      name: account.name,
      currency: account.currency,
      minDailyBudget: budgetValue(account.min_daily_budget, account.currency) || 5,
    },
    pages: pages.data.map((p) => ({
      id: p.id,
      name: p.name,
      picture: p.picture?.data?.url || null,
      instagram: p.instagram_business_account
        ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username, picture: p.instagram_business_account.profile_picture_url || null }
        : null,
      location: p.location?.latitude
        ? { latitude: p.location.latitude, longitude: p.location.longitude, label: [p.location.street, p.location.city].filter(Boolean).join(', ') }
        : null,
    })),
    instagramAccounts: igAccounts.data.map((i) => ({ id: i.id, username: i.username, picture: i.profile_pic || null })),
    whatsappNumbers: [...numbers.values()].sort((a, b) => b.uses - a.uses),
    audiences: audiences.data.map((a) => ({ id: a.id, name: a.name, subtype: a.subtype })),
  };
}

const GEO_TYPES = ['country', 'region', 'city', 'subcity', 'neighborhood', 'zip', 'geo_market'];

/** Busca de locais como no Gerenciador: países, estados, cidades, distritos, bairros e CEPs (Brasil primeiro). */
export async function searchGeo(q) {
  const body = await graph('search', { type: 'adgeolocation', q, location_types: GEO_TYPES, limit: 25 }, { ttl: 3600 });
  return body.data
    .map((c) => ({ key: String(c.key), name: c.name, type: c.type, region: c.region || '', country: c.country_code || c.country_name || '', countryName: c.country_name || '' }))
    .sort((a, b) => (a.country === 'BR' ? 0 : 1) - (b.country === 'BR' ? 0 : 1) || GEO_TYPES.indexOf(a.type) - GEO_TYPES.indexOf(b.type))
    .slice(0, 14);
}

/** Lista de aparelhos aceitos pela Meta (user_device), para a segmentação por dispositivo. */
export async function listDevices() {
  const body = await graph('search', { type: 'adTargetingCategory', class: 'user_device', limit: 5000 }, { ttl: 86400 });
  return body.data.map((d) => ({ name: d.name, platform: d.platform })).filter((d) => d.platform === 'iOS' || d.platform === 'Android');
}

async function pageToken(pageId) {
  const me = await graph('me/accounts', { fields: 'id,access_token', limit: 100 }, { all: true, ttl: 1800 });
  return me.data.find((p) => p.id === pageId)?.access_token || null;
}

/** Publicações existentes da página (Facebook) e do Instagram conectado, para "Usar publicação existente". */
export async function pagePosts(pageId, instagramId) {
  const result = { facebook: [], instagram: [], notices: [] };
  const token = await pageToken(pageId);
  if (!token) {
    result.notices.push('O usuário do token não administra esta página, então as publicações dela não podem ser listadas.');
  } else {
    try {
      const body = await rawRequest(`${pageId}/published_posts`, { fields: 'id,message,created_time,full_picture,permalink_url,status_type', limit: 30 }, token);
      result.facebook = (body.data || []).filter((p) => p.full_picture).map((p) => ({
        platform: 'facebook', id: p.id, message: p.message || '', picture: p.full_picture, permalink: p.permalink_url, createdAt: p.created_time,
      }));
    } catch (err) {
      result.notices.push(`Facebook: ${err.message}`);
    }
  }
  if (instagramId) {
    try {
      const body = await rawRequest(`${instagramId}/media`, { fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp', limit: 30 }, token || undefined);
      result.instagram = (body.data || []).map((m) => ({
        platform: 'instagram', id: m.id, message: m.caption || '', picture: m.thumbnail_url || m.media_url, permalink: m.permalink, createdAt: m.timestamp, mediaType: m.media_type,
      }));
    } catch (err) {
      result.notices.push(err instanceof MetaApiError && err.kind === 'permission'
        ? 'Instagram: o token atual não tem a permissão instagram_basic, por isso os posts do Instagram não aparecem. Gere um novo token incluindo essa permissão para liberar.'
        : `Instagram: ${err.message}`);
    }
  }
  return result;
}

export async function searchInterests(q) {
  const body = await graph('search', { type: 'adinterest', q, locale: 'pt_BR', limit: 15 }, { ttl: 3600 });
  return body.data.map((i) => ({
    id: i.id,
    name: i.name,
    path: i.path || [],
    audienceLower: i.audience_size_lower_bound ?? null,
    audienceUpper: i.audience_size_upper_bound ?? null,
  }));
}

export async function estimateAudience(accountId, pageId, adset) {
  const targeting = buildTargeting(adset);
  const [estimate, sentences] = await Promise.all([
    graph(`${accountId}/delivery_estimate`, {
      optimization_goal: 'CONVERSATIONS',
      promoted_object: { page_id: pageId },
      targeting_spec: targeting,
    }, { ttl: 900 }).catch((err) => ({ error: err.message })),
    graph(`${accountId}/targetingsentencelines`, { targeting_spec: targeting }, { ttl: 900 }).catch(() => null),
  ]);
  const e = estimate?.data?.[0];
  return {
    mauLower: e?.estimate_mau_lower_bound ?? null,
    mauUpper: e?.estimate_mau_upper_bound ?? null,
    ready: e?.estimate_ready ?? null,
    error: estimate?.error || null,
    sentences: (sentences?.targetingsentencelines || []).map((s) => ({
      content: s.content,
      children: s.children || [],
    })),
  };
}
