const crypto = require('crypto');

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getTokenExpiry(hours = 1) {
  const now = new Date();
  now.setHours(now.getHours() + hours);
  return now;
}

function hashToken(token) {
  if (!token) return null;
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  generateToken,
  getTokenExpiry,
  hashToken,
};
