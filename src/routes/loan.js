const express = require('express');
const loanController = require('../controllers/loanController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Apply for loan (MERCHANT only)
router.post('/apply', authorize(['MERCHANT']), loanController.applyForLoan);

// Get single loan
router.get('/:id', loanController.getLoan);

// List loans
router.get('/', loanController.listLoans);

// Assign banker (BANKER/ADMIN only)
router.post('/:id/assign', authorize(['BANKER', 'ADMIN']), loanController.assignBanker);

// Approve loan (BANKER only)
router.post('/:id/approve', authorize(['BANKER']), loanController.approveLoan);

// Reject loan (BANKER only)
router.post('/:id/reject', authorize(['BANKER']), loanController.rejectLoan);

// Disburse loan (BANKER only)
router.post('/:id/disburse', authorize(['BANKER']), loanController.disburseLoan);

// Cancel loan (MERCHANT/CUSTOMER)
router.post('/:id/cancel', authorize(['MERCHANT', 'CUSTOMER']), loanController.cancelLoan);

module.exports = router;
