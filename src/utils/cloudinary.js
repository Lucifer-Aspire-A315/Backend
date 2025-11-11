const crypto = require('crypto');

function buildStringToSign(params) {
  // include only non-empty params and sort keys alphabetically
  const entries = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`);
  return entries.join('&');
}

function generateSignature({ public_id, folder, timestamp }) {
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!apiSecret) throw new Error('CLOUDINARY_API_SECRET not configured');

  const params = { folder, public_id, timestamp };
  const toSign = buildStringToSign(params);
  const signature = crypto
    .createHash('sha1')
    .update(toSign + apiSecret)
    .digest('hex');
  return signature;
}

function getUploadConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  if (!cloudName || !apiKey)
    throw new Error('CLOUDINARY_CLOUD_NAME or CLOUDINARY_API_KEY not configured');
  return { cloudName, apiKey };
}

module.exports = { generateSignature, getUploadConfig };
