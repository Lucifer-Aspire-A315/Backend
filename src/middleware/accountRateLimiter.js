const kv = require('../lib/kvstore');
const { logger } = require('./logger');

// middleware factory: limits actions by key (usually email)
// options: { keyPrefix, windowSec, max }
function accountRateLimiter(options) {
  const { keyPrefix = 'acct', windowSec = 3600, max = 5 } = options || {};
  return async (req, res, next) => {
    try {
      // try to extract email from body or query
      const email = (req.body && req.body.email) || (req.query && req.query.email) || null;
      if (!email) return res.status(400).json({ message: 'Missing email' });

      const normalized = String(email).trim().toLowerCase();
      const key = `${keyPrefix}:${normalized}`;
      const count = await kv.incr(key, windowSec);
      if (count > max) {
        return res
          .status(429)
          .json({ message: 'Too many requests for this account. Try again later.' });
      }
      // attach remaining to request for observability
      req.rateLimit = { key, count, remaining: Math.max(0, max - count) };
      return next();
    } catch (err) {
      // On store errors, allow request (fail open) but log
      logger.error('Account rate limiter error', { error: err && err.message });
      return next();
    }
  };
}

module.exports = { accountRateLimiter };
