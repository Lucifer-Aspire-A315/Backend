const loanTypeService = require('../services/loanTypeService');
const { logger } = require('../middleware/logger');

class LoanTypeController {
  // POST /api/v1/loan-types
  static async create(req, res, next) {
    try {
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, message: 'Name is required' });
      }
      const loanType = await loanTypeService.createLoanType({ name, description });
      res.status(201).json({ success: true, data: loanType });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/loan-types
  static async list(req, res, next) {
    try {
      const loanTypes = await loanTypeService.getAllLoanTypes();
      res.status(200).json({ success: true, data: loanTypes });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/loan-types/:id
  static async getById(req, res, next) {
    try {
      const { id } = req.params;
      const loanType = await loanTypeService.getLoanTypeById(id);
      if (!loanType) {
        return res.status(404).json({ success: false, message: 'Loan type not found' });
      }
      res.status(200).json({ success: true, data: loanType });
    } catch (error) {
      next(error);
    }
  }

  // PUT /api/v1/loan-types/:id
  static async update(req, res, next) {
    try {
      const { id } = req.params;
      const { name, description } = req.body;
      const loanType = await loanTypeService.updateLoanType(id, { name, description });
      res.status(200).json({ success: true, data: loanType });
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/v1/loan-types/:id
  static async remove(req, res, next) {
    try {
      const { id } = req.params;
      await loanTypeService.deleteLoanType(id);
      res.status(200).json({ success: true, message: 'Loan type deleted' });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = LoanTypeController;
