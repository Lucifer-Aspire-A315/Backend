const prisma = require('../lib/prisma');
const { logger } = require('../middleware/logger');
const documentService = require('../services/documentService');

class UploadController {
  // Generate signature for client-side upload
  async getUploadSignature(req, res, next) {
    try {
      const userId = req.user.userId;
      const { folder = 'misc', filename } = req.query;
      
      // Enforce ownership: public_id MUST start with userId
      // We generate a unique ID here to ensure no collisions and enforce structure
      // Structure: {userId}/{folder}/{timestamp}-{random}
      const timestamp = Math.floor(Date.now() / 1000);
      const random = Math.random().toString(36).substring(2, 10);
      const public_id = `${userId}/${folder}/${timestamp}-${random}`;

      const config = documentService.generateUploadSignature(null, public_id); // folder is part of public_id in this strategy or we pass folder separately?
      // Cloudinary allows folder in public_id OR as separate param. 
      // If we put slashes in public_id, it implies folders.
      // Let's pass folder=null to generateSignature so it doesn't double-folder, 
      // but we need to check how generateSignature handles it.
      
      // Actually, let's look at documentService.
      
      res.json({ ...config, public_id });
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
