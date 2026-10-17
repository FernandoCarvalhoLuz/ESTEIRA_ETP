import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { findUser, getSessionSecret } from './store.js';

const COOKIE = 'esteira_session';
const SESSION_DAYS = 7;
const DUMMY_HASH = bcrypt.hashSync('esteira-dummy-password', 10);

function hmac(body) {
  return crypto.createHmac('sha256', getSessionSecret()).update(body).digest('base64url');
}

function signSession(data) {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${body}.${hmac(body)}`;
}

function verifySession(token) {
  if (!token) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const a = Buffer.from(mac);
  const b = Buffer.from(hmac(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return data.exp > Date.now() / 1000 ? data : null;
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function publicUser(user) {
  return { username: user.username, name: user.name || user.username, role: user.role || 'admin' };
}

// Limite de tentativas de login por IP (em memória).
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

function isBlocked(ip) {
  const entry = attempts.get(ip);
  if (!entry || entry.reset < Date.now()) return false;
  return entry.count >= MAX_FAILURES;
}

function registerFailure(ip) {
  const entry = attempts.get(ip);
  if (!entry || entry.reset < Date.now()) attempts.set(ip, { count: 1, reset: Date.now() + WINDOW_MS });
  else entry.count += 1;
}

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const ip = req.ip;
  if (isBlocked(ip)) {
    return res.status(429).json({ error: { message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' } });
  }
  const { username, password } = req.body || {};
  const user = findUser(username);
  const ok = await bcrypt.compare(String(password || ''), user?.passwordHash || DUMMY_HASH);
  if (!user || !ok) {
    registerFailure(ip);
    return res.status(401).json({ error: { message: 'Usuário ou senha inválidos.' } });
  }
  attempts.delete(ip);
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  res.cookie(COOKIE, signSession({ u: user.username, exp }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: SESSION_DAYS * 86400 * 1000,
    path: '/',
  });
  res.json({ user: publicUser(user) });
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  const session = verifySession(readCookie(req, COOKIE));
  const user = session && findUser(session.u);
  if (!user) return res.status(401).json({ error: { message: 'Não autenticado.' } });
  res.json({ user: publicUser(user) });
});

export function requireAuth(req, res, next) {
  const session = verifySession(readCookie(req, COOKIE));
  const user = session && findUser(session.u);
  if (!user) return res.status(401).json({ error: { message: 'Sessão expirada. Faça login novamente.' } });
  req.user = publicUser(user);
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: { message: 'Apenas administradores podem fazer isso.' } });
  next();
}
