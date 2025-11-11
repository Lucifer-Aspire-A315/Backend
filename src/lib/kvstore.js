// Lightweight key-value store wrapper.
// Uses Redis when REDIS_URL is set and ioredis is available; otherwise falls back to an in-memory store (dev only).
let client = null;
let isRedis = false;
const { logger } = require('../middleware/logger');

const REDIS_URL = process.env.REDIS_URL;
if (REDIS_URL) {
  try {
    const IORedis = require('ioredis');
    client = new IORedis(REDIS_URL);
    isRedis = true;
    client.on('error', (err) => {
      logger.error('Redis error', { error: err && err.message });
    });
  } catch (err) {
    // redis client lib not installed; fallback to in-memory
    logger.warn(
      'ioredis not installed or failed to load; falling back to in-memory store. Install ioredis for production use.',
    );
    client = null;
    isRedis = false;
  }
}

// In-memory fallback
const store = new Map();

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

async function incr(key, expireSec) {
  if (isRedis && client) {
    const cur = await client.incr(key);
    if (expireSec) {
      const ttl = await client.ttl(key);
      if (ttl === -1) await client.expire(key, expireSec);
    }
    return Number(cur);
  }

  const entry = store.get(key) || { v: 0, ex: 0 };
  if (!entry.ex || entry.ex < nowSeconds()) {
    entry.v = 1;
    entry.ex = expireSec ? nowSeconds() + expireSec : 0;
  } else {
    entry.v += 1;
  }
  store.set(key, entry);
  return entry.v;
}

async function get(key) {
  if (isRedis && client) {
    const v = await client.get(key);
    return v === null ? null : Number(v);
  }
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.ex && entry.ex < nowSeconds()) {
    store.delete(key);
    return null;
  }
  return entry.v;
}

async function del(key) {
  if (isRedis && client) return client.del(key);
  store.delete(key);
  return 1;
}

async function set(key, value, expireSec) {
  if (isRedis && client) {
    if (expireSec) return client.set(key, String(value), 'EX', expireSec);
    return client.set(key, String(value));
  }
  const entry = { v: Number(value), ex: expireSec ? nowSeconds() + expireSec : 0 };
  store.set(key, entry);
  return 'OK';
}

module.exports = {
  incr,
  get,
  del,
  set,
  isRedis: () => isRedis,
  client,
};
