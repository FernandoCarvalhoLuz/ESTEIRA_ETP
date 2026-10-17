import { Router } from 'express';
import { rangeFromQuery } from '../meta/dates.js';
import { breakdowns } from '../meta/breakdowns.js';
import { accountDetail, accountList, accountsOverview, campaignDetail, setStatus, topAdsets } from '../meta/service.js';

export const metaRouter = Router();

const ACCOUNT_ID = /^act_\d{5,25}$/;
const OBJECT_ID = /^\d{5,25}$/;

function badRequest(res, message) {
  return res.status(400).json({ error: { message } });
}

metaRouter.get('/accounts', async (req, res) => {
  const range = rangeFromQuery(req.query);
  res.json(await accountsOverview(range, { fresh: req.query.fresh === '1' }));
});

metaRouter.get('/accounts/:accountId', async (req, res) => {
  const { accountId } = req.params;
  if (!ACCOUNT_ID.test(accountId)) return badRequest(res, 'Conta inválida.');
  const range = rangeFromQuery(req.query);
  res.json(await accountDetail(accountId, range, { fresh: req.query.fresh === '1' }));
});

metaRouter.get('/campaigns/:campaignId', async (req, res) => {
  const { campaignId } = req.params;
  if (!OBJECT_ID.test(campaignId)) return badRequest(res, 'Campanha inválida.');
  const range = rangeFromQuery(req.query);
  res.json(await campaignDetail(campaignId, range, { fresh: req.query.fresh === '1' }));
});

metaRouter.get('/account-list', async (req, res) => {
  res.json(await accountList({ fresh: req.query.fresh === '1' }));
});

metaRouter.get('/top-adsets', async (req, res) => {
  const range = rangeFromQuery(req.query);
  res.json(await topAdsets(range, { fresh: req.query.fresh === '1' }));
});

/** Ativa ou pausa uma campanha, conjunto ou anúncio. */
metaRouter.post('/status', async (req, res) => {
  const { id, status } = req.body || {};
  if (!OBJECT_ID.test(String(id || ''))) return badRequest(res, 'Objeto inválido.');
  if (!['ACTIVE', 'PAUSED'].includes(status)) return badRequest(res, 'Status inválido.');
  res.json(await setStatus(String(id), status));
});

/** Recortes: plataforma, posicionamento, idade × gênero, dispositivo e dia × hora. */
metaRouter.get('/breakdowns', async (req, res) => {
  const scope = String(req.query.scope || 'all');
  if (scope !== 'all' && !ACCOUNT_ID.test(scope) && !OBJECT_ID.test(scope)) return badRequest(res, 'Escopo inválido.');
  const range = rangeFromQuery(req.query);
  res.json(await breakdowns(scope, range, { fresh: req.query.fresh === '1' }));
});
