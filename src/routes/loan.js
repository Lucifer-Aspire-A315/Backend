const express = require('express');
const loanController = require('../controllers/loanController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.get(
  '/customers',
  authorize(['MERCHANT']),
  loanController.listLinkedCustomers,
);
router.get(
  '/customers/link-requests',
  authorize(['MERCHANT']),
  loanController.listMerchantLinkRequests,
);
// Search existing customers for merchant loan applications
router.get(
  '/customers/search',
  authorize(['MERCHANT']),
  loanController.searchExistingCustomers,
);
router.post(
  '/customers/link',
  authorize(['MERCHANT']),
  loanController.linkExistingCustomer,
);
router.delete(
  '/customers/:customerId/link',
  authorize(['MERCHANT']),
  loanController.unlinkExistingCustomer,
);

// Apply for loan (MERCHANT/CUSTOMER)
router.post('/apply', authorize(['MERCHANT', 'CUSTOMER']), loanController.applyForLoan);

// Get single loan
router.get('/:id', loanController.getLoan);

// List loans
router.get('/', loanController.listLoans);

// Assign banker (ADMIN only)
router.post('/:id/assign', authorize(['ADMIN']), loanController.assignBanker);

// Banker requests assignment
router.post('/:id/request-assignment', authorize(['BANKER']), loanController.requestAssignment);

// Applicant/Merchant approve or reject assignment request
router.post(
  '/:id/assignment-decision',
  authorize(['CUSTOMER', 'MERCHANT', 'ADMIN']),
  loanController.assignmentDecision,
);

// Approve loan (BANKER only)
router.post('/:id/approve', authorize(['BANKER']), loanController.approveLoan);

// Reject loan (BANKER only)
router.post('/:id/reject', authorize(['BANKER']), loanController.rejectLoan);

// Disburse loan (BANKER only)
router.post('/:id/disburse', authorize(['BANKER']), loanController.disburseLoan);

// Cancel loan (MERCHANT/CUSTOMER)
router.post('/:id/cancel', authorize(['MERCHANT', 'CUSTOMER']), loanController.cancelLoan);

module.exports = router;
