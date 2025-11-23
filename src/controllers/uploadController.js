const prisma = require('../lib/prisma');
const { logger } = require('../middleware/logger');
const documentService = require('../services/documentService');

class UploadController {
  // Generate signature for client-side upload
  async getUploadSignature(req, res, next) {
    try {
      const { public_id, folder } = req.query;
      const config = documentService.generateUploadSignature(folder, public_id);
      res.json(config);
    } catch (err) {
      logger.error('Upload sign failed', { error: err && err.message });
      next(err);
    }
  }

  // Register a file uploaded to Cloudinary and link it to a loan
  async registerLoanDocument(req, res, next) {
    try {
      const userId = req.user && req.user.userId;
      const { loanId } = req.params;
      const { publicId, secureUrl, filename, fileType, bytes, type } = req.body;

      if (!publicId || !secureUrl) {
        const err = new Error('publicId and secureUrl are required');
        err.status = 400;
        return next(err);
      }

      // Verify loan exists
      const loan = await prisma.loan.findUnique({ where: { id: loanId } });
      if (!loan) {
        const err = new Error('Loan not found');
        err.status = 404;
        return next(err);
      }

      // Authorization: allow merchant (owner), applicant (customer), banker, or admin
      const allowed = [loan.merchantId, loan.applicantId, loan.bankerId];
      const isAllowed = req.user && (req.user.role === 'ADMIN' || allowed.includes(userId));
      if (!isAllowed) {
        const err = new Error('Not authorized to add documents to this loan');
        err.status = 403;
        return next(err);
      }

      const doc = await documentService.registerLoanDocument(loanId, userId, {
        publicId,
        secureUrl,
        filename,
        fileType,
        bytes,
        type
      });

      res.status(201).json({ success: true, document: doc });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new UploadController();
