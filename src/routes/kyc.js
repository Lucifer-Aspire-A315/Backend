const express = require('express');
const kycController = require('../controllers/kycController');
const router = express.Router();

// Customer/Merchant routes
router.post('/upload-url', kycController.generateUploadUrl);
router.post('/complete-upload', kycController.completeUpload);
// On-behalf routes (Merchant for their customers; Banker/Admin for any)
router.post('/on-behalf/upload-url', kycController.generateUploadUrlOnBehalf);
router.post('/on-behalf/complete-upload', kycController.completeUploadOnBehalf);
router.get('/status', kycController.getStatus);
router.get('/required', kycController.getRequired);

// Banker routes
router.get('/pending', kycController.getPendingForReview);
router.get('/:kycDocId/review', kycController.getForReview);
router.post('/:kycDocId/verify', kycController.verify);

module.exports = router;
