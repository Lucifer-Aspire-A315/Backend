const prisma = require('../lib/prisma');
const { logger } = require('../middleware/logger');

class UploadController {
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

      const doc = await prisma.document.create({
        data: {
          loanId,
          publicId,
          secureUrl,
          url: secureUrl,
          filename: filename || null,
          fileType: fileType || null,
          bytes: bytes ? Number(bytes) : null,
          uploaderId: userId,
          type: type || 'attachment',
        },
      });

      logger.info('Loan document registered', { loanId, documentId: doc.id, uploaderId: userId });
      res.status(201).json({ success: true, document: doc });
    } catch (err) {
      logger.error('registerLoanDocument failed', { error: err && err.message });
      next(err);
    }
  }
}

module.exports = new UploadController();
