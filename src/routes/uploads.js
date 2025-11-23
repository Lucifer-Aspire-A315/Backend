const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const uploadController = require('../controllers/uploadController');

// POST /api/v1/uploads/loan/:loanId/register
router.post('/loan/:loanId/register', auth.authenticate, uploadController.registerLoanDocument);

// GET /api/v1/uploads/sign?public_id=...&folder=...
router.get('/sign', auth.authenticate, uploadController.getUploadSignature);

module.exports = router;
