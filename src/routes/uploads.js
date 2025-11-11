const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { generateSignature, getUploadConfig } = require('../utils/cloudinary');
const { logger } = require('../middleware/logger');
const uploadController = require('../controllers/uploadController');

// POST /api/v1/uploads/loan/:loanId/register
router.post('/loan/:loanId/register', auth.authenticate, uploadController.registerLoanDocument);

// GET /api/v1/uploads/sign?public_id=...&folder=...
router.get('/sign', auth.authenticate, async (req, res, next) => {
  try {
    const { public_id, folder } = req.query;
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = generateSignature({ public_id, folder, timestamp });
    const { cloudName, apiKey } = getUploadConfig();
    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;
    res.json({ apiKey, signature, timestamp, uploadUrl, cloudName });
  } catch (err) {
    logger.error('Upload sign failed', { error: err && err.message });
    next(err);
  }
});

module.exports = router;
