const loanService = require('../services/loanService');
const { logger } = require('../middleware/logger');

/**
 * Search existing customers for merchant loan applications
 */
async function searchExistingCustomers(req, res, next) {
  try {
    const actorId = req.user.userId;
    const actorRole = req.user.role;
    const search = req.query.search?.toString() ?? '';
    const limit = parseInt(req.query.limit, 10) || 20;

    const users = await loanService.searchExistingCustomers(actorId, actorRole, search, limit);

    res.status(200).json({
      success: true,
      data: { users },
      message: `Found ${users.length} customer(s)`,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * List linked customers for the authenticated merchant
 */
async function listLinkedCustomers(req, res, next) {
  try {
    const actorId = req.user.userId;
    const actorRole = req.user.role;
    const search = req.query.search?.toString() ?? '';
    const limit = parseInt(req.query.limit, 10) || 50;

    const users = await loanService.listLinkedCustomers(actorId, actorRole, search, limit);

    res.status(200).json({
      success: true,
      data: { users },
      message: `Found ${users.length} linked customer(s)`,
    });
  } catch (error) {
    next(error);
  }
}

async function listMerchantLinkRequests(req, res, next) {
  try {
    const actorId = req.user.userId;
    const actorRole = req.user.role;
    const status = req.query.status?.toString() ?? null;
    const limit = parseInt(req.query.limit, 10) || 50;

    const requests = await loanService.listMerchantLinkRequests(
      actorId,
      actorRole,
      status,
      limit,
    );

    res.status(200).json({
      success: true,
      data: { requests },
      message: `Found ${requests.length} merchant link request(s)`,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Link an existing customer account to the authenticated merchant
 */
async function linkExistingCustomer(req, res, next) {
  try {
    const actorId = req.user.userId;
    const actorRole = req.user.role;
    const email = req.body?.email?.toString() ?? '';

    if (!email.trim()) {
      const error = new Error('Customer email is required');
      error.status = 400;
      return next(error);
    }

    const request = await loanService.createLinkRequest(actorId, actorRole, email);

    res.status(200).json({
      success: true,
      data: request,
      message: 'Customer approval request sent',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Unlink a customer account from the authenticated merchant
 */
async function unlinkExistingCustomer(req, res, next) {
  try {
    const actorId = req.user.userId;
    const actorRole = req.user.role;
    const customerId = req.params.customerId?.toString() ?? '';

    if (!customerId) {
      const error = new Error('Customer ID is required');
      error.status = 400;
      return next(error);
    }

    const customer = await loanService.unlinkExistingCustomer(actorId, actorRole, customerId);

    res.status(200).json({
      success: true,
      data: customer,
      message: 'Customer unlinked successfully',
    });
  } catch (error) {
    next(error);
  }
}

async function listCustomerLinkRequests(req, res, next) {
  try {
    const customerId = req.user.userId;
    const status = req.query.status?.toString() ?? 'PENDING';
    const limit = parseInt(req.query.limit, 10) || 50;

    const requests = await loanService.listCustomerLinkRequests(customerId, status, limit);

    res.status(200).json({
      success: true,
      data: { requests },
      message: `Found ${requests.length} customer link request(s)`,
    });
  } catch (error) {
    next(error);
  }
}

async function decideCustomerLinkRequest(req, res, next) {
  try {
    const customerId = req.user.userId;
    const requestId = req.params.id;
    const decision = req.body?.decision?.toString() ?? '';

    if (!['approve', 'reject'].includes(decision)) {
      const error = new Error('decision must be approve or reject');
      error.status = 400;
      return next(error);
    }

    const request = await loanService.decideLinkRequestByCustomer(
      customerId,
      requestId,
      decision,
    );

    res.status(200).json({
      success: true,
      data: request,
      message: decision === 'approve' ? 'Link request approved' : 'Link request rejected',
    });
  } catch (error) {
    next(error);
  }
}

async function getCustomerLinkRequestByToken(req, res, next) {
  try {
    const token = req.query.token?.toString() ?? '';
    if (!token) {
      const error = new Error('token is required');
      error.status = 400;
      return next(error);
    }

    const request = await loanService.getLinkRequestByToken(token);
    res.status(200).json({
      success: true,
      data: request,
    });
  } catch (error) {
    next(error);
  }
}

async function decideCustomerLinkRequestByToken(req, res, next) {
  try {
    const token = req.body?.token?.toString() ?? '';
    const decision = req.body?.decision?.toString() ?? '';

    if (!token) {
      const error = new Error('token is required');
      error.status = 400;
      return next(error);
    }
    if (!['approve', 'reject'].includes(decision)) {
      const error = new Error('decision must be approve or reject');
      error.status = 400;
      return next(error);
    }

    const request = await loanService.decideLinkRequestByToken(token, decision);
    res.status(200).json({
      success: true,
      data: request,
      message: decision === 'approve' ? 'Link request approved' : 'Link request rejected',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Apply for a loan
 */
async function applyForLoan(req, res, next) {
  try {
    const actorId = req.user.userId;
    const actorRole = req.user.role;
    const loanData = req.body;

    const loan = await loanService.applyForLoan(loanData, actorId, actorRole);

    logger.info('Loan application submitted', { loanId: loan.id, actorId, actorRole });
    res.status(201).json({
      success: true,
      data: loan,
      message: 'Loan application submitted successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get loan by ID
 */
async function getLoan(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    const loan = await loanService.getLoanById(id, userId, userRole);

    res.status(200).json({
      success: true,
      data: loan,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * List loans with filters
 */
async function listLoans(req, res, next) {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    const filters = {
      status: req.query.status,
      merchantId: req.query.merchantId,
      customerId: req.query.customerId,
      bankerId: req.query.bankerId,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
    };

    const result = await loanService.listLoans(filters, userId, userRole);

    res.status(200).json({
      success: true,
      data: result.loans,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Assign banker to loan (BANKER/ADMIN only)
 */
async function assignBanker(req, res, next) {
  try {
    const { id } = req.params;
    const { bankerId } = req.body;
    const assignedBy = req.user.userId;

    if (!bankerId) {
      const error = new Error('Banker ID required');
      error.status = 400;
      return next(error);
    }

    const loan = await loanService.assignBanker(id, bankerId, assignedBy);

    res.status(200).json({
      success: true,
      data: loan,
      message: 'Banker assigned successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Request assignment (BANKER only)
 */
async function requestAssignment(req, res, next) {
  try {
    const { id } = req.params;
    const bankerId = req.user.userId;
    const { note, proposedInterestRate } = req.body || {};

    if (!proposedInterestRate || Number(proposedInterestRate) <= 0) {
      const error = new Error('proposedInterestRate must be greater than 0');
      error.status = 400;
      return next(error);
    }

    const loan = await loanService.requestAssignment(id, bankerId, note, Number(proposedInterestRate));

    res.status(200).json({
      success: true,
      data: loan,
      message: 'Assignment request submitted',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Approve/reject assignment request (CUSTOMER/MERCHANT/ADMIN)
 */
async function assignmentDecision(req, res, next) {
  try {
    const { id } = req.params;
    const actorId = req.user.userId;
    const actorRole = req.user.role;
    const { approve, notes, bankerId } = req.body || {};

    if (typeof approve !== 'boolean') {
      const error = new Error('approve (boolean) is required');
      error.status = 400;
      return next(error);
    }
    if (!bankerId) {
      const error = new Error('bankerId is required');
      error.status = 400;
      return next(error);
    }

    const loan = await loanService.assignmentDecision(
      id,
      actorId,
      actorRole,
      bankerId,
      approve,
      notes,
    );

    res.status(200).json({
      success: true,
      data: loan,
      message: approve ? 'Assignment request approved' : 'Assignment request rejected',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Approve loan (BANKER only)
 */
async function approveLoan(req, res, next) {
  try {
    const { id } = req.params;
    const { notes, interestRate } = req.body;
    const bankerId = req.user.userId;

    const loan = await loanService.approveLoan(id, bankerId, notes, interestRate);

    res.status(200).json({
      success: true,
      data: loan,
      message: 'Loan approved successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Reject loan (BANKER only)
 */
async function rejectLoan(req, res, next) {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const bankerId = req.user.userId;

    if (!notes) {
      const error = new Error('Rejection reason required');
      error.status = 400;
      return next(error);
    }

    const loan = await loanService.rejectLoan(id, bankerId, notes);

    res.status(200).json({
      success: true,
      data: loan,
      message: 'Loan rejected',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Disburse loan (BANKER only)
 */
async function disburseLoan(req, res, next) {
  try {
    const { id } = req.params;
    const { referenceId, notes } = req.body;
    const bankerId = req.user.userId;

    if (!referenceId) {
      const error = new Error('Transaction reference ID is required');
      error.status = 400;
      return next(error);
    }

    const loan = await loanService.disburseLoan(id, bankerId, referenceId, notes);

    res.status(200).json({
      success: true,
      data: loan,
      message: 'Loan disbursed successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Cancel loan (Applicant/Merchant)
 */
async function cancelLoan(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.userId;

    const loan = await loanService.cancelLoan(id, userId, reason);

    res.status(200).json({
      success: true,
      data: loan,
      message: 'Loan cancelled successfully',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  searchExistingCustomers,
  listLinkedCustomers,
  listMerchantLinkRequests,
  linkExistingCustomer,
  unlinkExistingCustomer,
  listCustomerLinkRequests,
  decideCustomerLinkRequest,
  getCustomerLinkRequestByToken,
  decideCustomerLinkRequestByToken,
  applyForLoan,
  getLoan,
  listLoans,
  assignBanker,
  requestAssignment,
  assignmentDecision,
  approveLoan,
  rejectLoan,
  disburseLoan,
  cancelLoan,
};
