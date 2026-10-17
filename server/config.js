import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

const env = process.env;

export const config = {
  port: Number(env.PORT || 3010),
  host: env.HOST || '127.0.0.1',
  dataDir: path.resolve(ROOT, env.DATA_DIR || 'data'),
  distDir: path.join(ROOT, 'web', 'dist'),
  cookieSecure: env.COOKIE_SECURE === 'true',
  timezone: env.TIMEZONE || 'America/Sao_Paulo',
  cacheTtlSeconds: Number(env.CACHE_TTL_SECONDS || 300),
  meta: {
    token: env.META_ACCESS_TOKEN || '',
    apiVersion: env.META_API_VERSION || 'v26.0',
    appId: env.META_APP_ID || '',
    appSecret: env.META_APP_SECRET || '',
  },
};
