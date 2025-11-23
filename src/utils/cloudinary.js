const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

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

/**
 * Verify if a resource exists in Cloudinary
 * @param {string} publicId
 * @returns {Promise<boolean>}
 */
async function verifyResource(publicId) {
  try {
    if (!publicId) return false;
    // Use the Admin API to check resource details
    // Note: This requires the API Key and Secret to be set correctly
    await cloudinary.api.resource(publicId);
    return true;
  } catch (error) {
    if (error.http_code === 404) {
      return false;
    }
    // If it's another error (e.g. auth), we might want to log it but for now assume verification failed
    console.error('Cloudinary verification error:', error.message);
    return false;
  }
}

module.exports = { generateSignature, getUploadConfig, verifyResource, cloudinary };
