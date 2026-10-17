// Persistência simples em arquivos JSON dentro de data/ (fora do controle de versão).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

function filePath(name) {
  return path.join(config.dataDir, name);
}

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath(name), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

function writeJson(name, data) {
  const target = filePath(name);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, target);
}

export const settings = {
  get() {
    return readJson('settings.json', {});
  },
  update(patch) {
    const next = { ...this.get(), ...patch };
    writeJson('settings.json', next);
    return next;
  },
};

export function listUsers() {
  return readJson('users.json', []);
}

export function findUser(username) {
  const wanted = String(username || '').trim().toLowerCase();
  return listUsers().find((u) => u.username.toLowerCase() === wanted) || null;
}

export function saveUser(user) {
  const users = listUsers().filter((u) => u.username.toLowerCase() !== user.username.toLowerCase());
  users.push(user);
  writeJson('users.json', users);
}

/** Coleção simples de documentos com id, guardada em data/<nome>.json. */
export function collection(name) {
  const file = `${name}.json`;
  return {
    list() {
      return readJson(file, []);
    },
    get(id) {
      return this.list().find((d) => d.id === id) || null;
    },
    insert(doc) {
      const now = new Date().toISOString();
      const item = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...doc };
      writeJson(file, [...this.list(), item]);
      return item;
    },
    update(id, patch) {
      let updated = null;
      const items = this.list().map((d) => {
        if (d.id !== id) return d;
        updated = { ...d, ...(typeof patch === 'function' ? patch(d) : patch), id, updatedAt: new Date().toISOString() };
        return updated;
      });
      if (updated) writeJson(file, items);
      return updated;
    },
    remove(id) {
      const items = this.list();
      const next = items.filter((d) => d.id !== id);
      writeJson(file, next);
      return next.length !== items.length;
    },
  };
}

export const uploadsDir = path.join(config.dataDir, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

let sessionSecret;
export function getSessionSecret() {
  if (sessionSecret) return sessionSecret;
  if (process.env.SESSION_SECRET) return (sessionSecret = process.env.SESSION_SECRET);
  const stored = readJson('secret.json', null);
  if (stored?.sessionSecret) return (sessionSecret = stored.sessionSecret);
  sessionSecret = crypto.randomBytes(48).toString('base64url');
  writeJson('secret.json', { sessionSecret });
  return sessionSecret;
}
