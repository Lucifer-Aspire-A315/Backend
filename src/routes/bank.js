// src/routes/bank.js
const express = require('express');
const router = express.Router();
const bankController = require('../controllers/bankController');

// GET /api/banks?loanTypeId=...
router.get('/', bankController.getBanks);

// GET /api/loan-types?bankId=...
router.get('/loan-types', bankController.getLoanTypes);

module.exports = router;
