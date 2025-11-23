const loanService = require('../services/loanService');
const { logger } = require('../middleware/logger');

/**
 * Apply for a loan
 */
async function applyForLoan(req, res, next) {
  try {
    const merchantId = req.user.userId;
    const loanData = req.body;

    const loan = await loanService.applyForLoan(loanData, merchantId);

    logger.info('Loan application submitted', { loanId: loan.id, merchantId });
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
 * Approve loan (BANKER only)
 */
async function approveLoan(req, res, next) {
  try {
    const { id } = req.params;
    const { notes, interestRate } = req.body;
    const bankerId = req.user.userId;

    if (!interestRate) {
      const error = new Error('Interest rate is required for approval');
      error.status = 400;
      return next(error);
    }

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
  applyForLoan,
  getLoan,
  listLoans,
  assignBanker,
  approveLoan,
  rejectLoan,
  disburseLoan,
  cancelLoan,
};
