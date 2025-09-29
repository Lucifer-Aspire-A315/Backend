// src/routes/bankAdmin.js
const express = require('express');
const router = express.Router();
const bankAdminController = require('../controllers/bankAdminController');
const authMiddleware = require('../middleware/auth');

// ADMIN-only endpoints for bank management
router.post('/', authMiddleware.authenticate, authMiddleware.authorize(['ADMIN']), bankAdminController.create);
router.put('/:id', authMiddleware.authenticate, authMiddleware.authorize(['ADMIN']), bankAdminController.update);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorize(['ADMIN']), bankAdminController.remove);

module.exports = router;
