const express = require('express');
const loanController = require('../controllers/loanController');
const { authenticate, authorize } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.get('/token', authLimiter, loanController.getCustomerLinkRequestByToken);
router.post('/token/decision', authLimiter, loanController.decideCustomerLinkRequestByToken);

router.get(
  '/me',
  authenticate,
  authorize(['CUSTOMER']),
  loanController.listCustomerLinkRequests,
);
router.post(
  '/:id/decision',
  authenticate,
  authorize(['CUSTOMER']),
  loanController.decideCustomerLinkRequest,
);

module.exports = router;
