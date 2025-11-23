const prisma = require('../lib/prisma');
const cloudinary = require('cloudinary').v2;
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../middleware/logger');
const emailSender = require('../utils/emailSender');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

class KYCService {
  /**
   * Generate pre-signed URL for document upload to Cloudinary
   */
  async generateUploadUrl(userId, docType) {
    try {
      const allowedTypes = ['ID_PROOF', 'ADDRESS_PROOF', 'PAN_CARD', 'BANK_STATEMENT'];
      if (!allowedTypes.includes(docType)) {
        const error = new Error('Invalid document type');
        error.status = 400;
        throw error;
      }

      // Create unique public ID
  // We keep a structured publicId (without the root folder) so full path becomes
  // <folder>/<userId>/<docType>/<uuid-timestamp>
  const structuredPublicId = `${userId}/${docType}/${uuidv4()}-${Date.now()}`;

      // Generate Cloudinary signature for secure upload
      const timestamp = Math.round(new Date().getTime() / 1000);
      const folder = process.env.CLOUDINARY_KYC_FOLDER;
      const signature = cloudinary.utils.api_sign_request(
        {
          timestamp,
          public_id: structuredPublicId,
          folder,
        },
        process.env.CLOUDINARY_API_SECRET,
      );

      // Create KYC record (pending upload)
  const kycDoc = await this.createKYCDocument(userId, docType, 'UPLOADING', structuredPublicId);

      logger.info('Cloudinary Upload URL Generated', {
        userId,
        docType,
        kycDocId: kycDoc.id,
        publicId: structuredPublicId,
      });

      return {
        uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/auto/upload`,
        kycDocId: kycDoc.id,
        publicId: structuredPublicId,
        signature,
        timestamp,
        apiKey: process.env.CLOUDINARY_API_KEY,
        folder,
        expectedFinalUrl: `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/${folder}/${structuredPublicId}`,
        instructions: `Upload your ${this.getDocTypeName(docType)} (Max 5MB, JPG/PNG/PDF)`,
      };
    } catch (error) {
      logger.error('Generate Upload URL Failed', {
        userId,
        docType,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Generate upload URL on behalf of another user, with permission checks
   */
  async generateUploadUrlOnBehalf(actorUserId, actorRole, targetUserId, docType) {
    // BANKER/ADMIN can act on behalf of any user; MERCHANT only for their customers
    if (actorRole === 'MERCHANT') {
      const target = await prisma.user.findUnique({
        where: { id: targetUserId },
        include: { customerProfile: { include: { merchant: true } }, merchantProfile: true },
      });
      if (!target || target.role !== 'CUSTOMER') {
        const error = new Error('Target user not found or not a customer');
        error.status = 404;
        throw error;
      }
      const merchantProfile = await prisma.merchantProfile.findUnique({ where: { userId: actorUserId } });
      if (!merchantProfile || target.customerProfile?.merchantId !== merchantProfile.id) {
        const error = new Error('You are not authorized to upload KYC for this customer');
        error.status = 403;
        throw error;
      }
    } else if (actorRole !== 'BANKER' && actorRole !== 'ADMIN') {
      const error = new Error('Not authorized to upload on behalf');
      error.status = 403;
      throw error;
    }

    return this.generateUploadUrl(targetUserId, docType);
  }

  /**
   * Create KYC document record
   */
  async createKYCDocument(userId, type, status = 'PENDING', publicId = null) {
    try {
      const folder = process.env.CLOUDINARY_KYC_FOLDER;
      const kycDoc = await prisma.kYCDocument.create({
        data: {
          type,
          url: publicId
            ? `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/${folder}/${publicId}`
            : null,
          status,
          userId,
        },
        select: {
          id: true,
          type: true,
          url: true,
          status: true,
          userId: true,
          createdAt: true,
        },
      });

      logger.info('KYC Document Created', {
        kycDocId: kycDoc.id,
        userId,
        type,
        status,
      });

      return kycDoc;
    } catch (error) {
      logger.error('Create KYC Document Failed', {
        userId,
        type,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Complete document upload (update metadata)
   */
  async completeUpload(kycDocId, publicId, fileSize, contentType) {
    try {
      // Fetch doc first to verify ownership/state and reconstruct publicId
      const existingDoc = await prisma.kYCDocument.findUnique({ where: { id: kycDocId } });
      if (!existingDoc) {
        const error = new Error('KYC document not found');
        error.status = 404;
        throw error;
      }

      // Enforce publicId structure to prevent IDOR/Path Traversal
      const expectedPublicId = `${existingDoc.userId}/${existingDoc.type}/${existingDoc.id}`;
      if (publicId !== expectedPublicId) {
        logger.warn('Mismatch in publicId during completion', {
          provided: publicId,
          expected: expectedPublicId,
          kycDocId,
        });
        // Force the correct publicId
        publicId = expectedPublicId;
      }

      // Validate file
      if (fileSize > parseInt(process.env.KYC_MAX_FILE_SIZE || '5242880')) {
        const error = new Error('File size exceeds 5MB limit');
        error.status = 413;
        throw error;
      }

      const allowedTypes = (
        process.env.KYC_ALLOWED_TYPES || 'image/jpeg,image/png,application/pdf'
      ).split(',');
      if (!allowedTypes.includes(contentType)) {
        const error = new Error('Invalid file type. Only JPG, PNG, PDF allowed');
        error.status = 415;
        throw error;
      }

      // Update KYC document
      const folder = process.env.CLOUDINARY_KYC_FOLDER;
      const kycDoc = await prisma.kYCDocument.update({
        where: { id: kycDocId },
        data: {
          url: `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/${folder}/${publicId}`,
          status: 'PENDING',
          verifiedBy: null,
        },
        select: {
          id: true,
          type: true,
          url: true,
          status: true,
          userId: true,
        },
      });

      // Create audit log
      await this.createKYCAuditLog(
        kycDocId,
        'DOCUMENT_UPLOADED',
        null,
        `File uploaded: ${fileSize} bytes, ${contentType}`,
      );

      logger.info('KYC Upload Completed', {
        kycDocId,
        publicId,
        fileSize,
        contentType,
      });

      return kycDoc;
    } catch (error) {
      logger.error('Complete Upload Failed', {
        kycDocId,
        publicId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Complete upload on behalf with permission checks
   */
  async completeUploadOnBehalf(actorUserId, actorRole, kycDocId, publicId, fileSize, contentType) {
    const kycDoc = await prisma.kYCDocument.findUnique({ where: { id: kycDocId } });
    if (!kycDoc) {
      const error = new Error('KYC document not found');
      error.status = 404;
      throw error;
    }
    if (actorRole === 'MERCHANT') {
      const target = await prisma.user.findUnique({
        where: { id: kycDoc.userId },
        include: { customerProfile: true },
      });
      const merchantProfile = await prisma.merchantProfile.findUnique({ where: { userId: actorUserId } });
      if (!merchantProfile || target?.customerProfile?.merchantId !== merchantProfile.id) {
        const error = new Error('You are not authorized to complete KYC for this customer');
        error.status = 403;
        throw error;
      }
    } else if (actorRole !== 'BANKER' && actorRole !== 'ADMIN') {
      const error = new Error('Not authorized to complete upload on behalf');
      error.status = 403;
      throw error;
    }

    return this.completeUpload(kycDocId, publicId, fileSize, contentType);
  }

  /**
   * Get KYC documents for user
   */
  async getUserKYCDocuments(userId, status = null) {
    try {
      const whereClause = { userId };
      if (status) {
        whereClause.status = status;
      }

      const documents = await prisma.kYCDocument.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          url: true,
          status: true,
          createdAt: true,
          verifiedBy: true,
        },
      });

      // Enrich with document type names
      const enrichedDocs = documents.map((doc) => ({
        ...doc,
        docTypeName: this.getDocTypeName(doc.type),
        isPending: doc.status === 'PENDING',
        needsResubmission: doc.status === 'REJECTED',
      }));

      logger.info('KYC Documents Retrieved', {
        userId,
        count: documents.length,
        pending: enrichedDocs.filter((d) => d.isPending).length,
      });

      return enrichedDocs;
    } catch (error) {
      logger.error('Get User KYC Failed', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get pending KYC documents for banker review
   */
  async getPendingKYCForReview(bankerId, limit = 20) {
    try {
      const documents = await prisma.kYCDocument.findMany({
        where: {
          status: 'PENDING',
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });

      const enrichedDocs = documents.map((doc) => ({
        ...doc,
        userFullName: doc.user.name,
        userRole: doc.user.role,
        daysPending: Math.floor((new Date() - new Date(doc.createdAt)) / (1000 * 60 * 60 * 24)),
      }));

      logger.info('Pending KYC Retrieved for Review', {
        bankerId,
        count: documents.length,
      });

      return enrichedDocs;
    } catch (error) {
      logger.error('Get Pending KYC Failed', {
        bankerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Verify/reject KYC document (Banker only)
   */
  async verifyKYCDocument(kycDocId, status, bankerId, notes = '') {
    try {
      const validStatuses = ['VERIFIED', 'REJECTED'];
      if (!validStatuses.includes(status)) {
        const error = new Error('Status must be VERIFIED or REJECTED');
        error.status = 400;
        throw error;
      }

      // Update document status
      const kycDoc = await prisma.kYCDocument.update({
        where: { id: kycDocId },
        data: {
          status,
          verifiedBy: status === 'VERIFIED' ? bankerId : null,
        },
        select: {
          id: true,
          type: true,
          status: true,
          userId: true,
          url: true,
          user: {
            select: {
              email: true,
              name: true,
            },
          },
        },
      });

      // Create audit log
      const action = status === 'VERIFIED' ? 'KYC_VERIFIED' : 'KYC_REJECTED';
      await this.createKYCAuditLog(kycDocId, action, bankerId, notes);

      // Create Notification
      await prisma.notification.create({
        data: {
          userId: kycDoc.userId,
          type: 'KYC_UPDATE',
          message: `Your ${this.getDocTypeName(kycDoc.type)} document has been ${status}. ${notes ? `Reason: ${notes}` : ''}`,
        },
      });

      // Send Email
      if (kycDoc.user && kycDoc.user.email) {
        emailSender.sendKYCStatusEmail(
          kycDoc.user.email,
          kycDoc.user.name,
          this.getDocTypeName(kycDoc.type),
          status,
          notes
        ).catch(err => logger.error('Failed to send KYC email', { error: err.message }));
      }

      logger.info('KYC Document Verified', {
        kycDocId,
        status,
        bankerId,
        userId: kycDoc.userId,
        notes: notes.substring(0, 100),
      });

      // After updating one doc, recompute user's overall KYC readiness and sync related loans
      await this.syncLoansKYCStatus(kycDoc.userId);

      return {
        kycDoc,
        action,
        message:
          status === 'VERIFIED' ? 'Document verified successfully' : `Document rejected: ${notes}`,
      };
    } catch (error) {
      logger.error('Verify KYC Document Failed', {
        kycDocId,
        bankerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get KYC document details for review
   */
  async getKYCForReview(kycDocId) {
    try {
      const document = await prisma.kYCDocument.findUnique({
        where: { id: kycDocId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              role: true,
            },
          },
        },
      });

      if (!document) {
        const error = new Error('KYC document not found');
        error.status = 404;
        throw error;
      }

      return {
        ...document,
        docTypeName: this.getDocTypeName(document.type),
        isOverdue:
          document.status === 'PENDING' &&
          Math.floor((new Date() - new Date(document.createdAt)) / (1000 * 60 * 60 * 24)) > 3,
      };
    } catch (error) {
      logger.error('Get KYC for Review Failed', {
        kycDocId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Create KYC audit log
   */
  async createKYCAuditLog(kycDocId, action, actorId, details = '') {
    try {
      await prisma.kYCAuditLog.create({
        data: {
          kycDocId,
          action,
          actorId,
          details,
        },
      });
      
      logger.debug('KYC Audit Event', {
        kycDocId,
        action,
        actorId,
        details,
      });
    } catch (error) {
      logger.error('KYC Audit Log Failed', {
        kycDocId,
        action,
        error: error.message,
      });
      // Don't throw - audit shouldn't break main flow
    }
  }

  /**
   * Check if user's KYC is complete for their role (and optional loan type)
   * Returns summary with completion status and missing document types
   */
  async isKYCComplete(userId, userRole, loanType = null) {
    // Fetch submitted documents and required doc types
    const [documents, required] = await Promise.all([
      this.getUserKYCDocuments(userId),
      Promise.resolve(this.getRequiredDocuments(userRole, loanType)),
    ]);

    const verifiedTypes = new Set(
      documents.filter((d) => d.status === 'VERIFIED').map((d) => d.type),
    );

    const requiredTypes = required.map((r) => r.type);
    const missingTypes = requiredTypes.filter((t) => !verifiedTypes.has(t));

    const percentComplete =
      requiredTypes.length > 0
        ? Math.round(((requiredTypes.length - missingTypes.length) / requiredTypes.length) * 100)
        : 0;

    return {
      complete: missingTypes.length === 0 && requiredTypes.length > 0,
      missingTypes,
      percentComplete,
      requiredTypes,
      verifiedCount: requiredTypes.length - missingTypes.length,
    };
  }

  /**
   * Get document type display name
   */
  getDocTypeName(type) {
    const typeNames = {
      ID_PROOF: 'Government ID (Aadhaar/Passport)',
      ADDRESS_PROOF: 'Address Proof (Utility Bill/Bank Statement)',
      PAN_CARD: 'PAN Card',
      BANK_STATEMENT: 'Bank Statement (Last 6 months)',
    };
    return typeNames[type] || type;
  }

  /**
   * Get required documents based on user role and loan type
   */
  getRequiredDocuments(userRole, loanType = null) {
    const baseRequirements = {
      CUSTOMER: ['ID_PROOF', 'ADDRESS_PROOF', 'PAN_CARD'],
      MERCHANT: ['ID_PROOF', 'ADDRESS_PROOF', 'PAN_CARD', 'BANK_STATEMENT'],
      BANKER: [], // Bankers don't submit KYC
    };

    let requirements = baseRequirements[userRole] || [];

    // Add loan-type specific requirements
    if (loanType) {
      const loanSpecific = {
        BUSINESS: ['BANK_STATEMENT'],
        VEHICLE: ['ADDRESS_PROOF'],
        EQUIPMENT: ['BANK_STATEMENT'],
      };
      requirements = [...new Set([...requirements, ...(loanSpecific[loanType] || [])])];
    }

    return requirements.map((type) => ({
      type,
      displayName: this.getDocTypeName(type),
      isRequired: true,
      status: 'NOT_STARTED',
    }));
  }

  /**
   * Sync KYC status on all open loans for a given user
   */
  async syncLoansKYCStatus(userId) {
    // Fetch user role to compute requirements
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user) return;

    const readiness = await this.isKYCComplete(userId, user.role);

    const newKycStatus = readiness.complete ? 'VERIFIED' : readiness.missingTypes.length > 0 ? 'PENDING' : 'PENDING';

    await prisma.loan.updateMany({
      where: {
        applicantId: userId,
        status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
      },
      data: {
        kycStatus: newKycStatus,
      },
    });
  }
}

module.exports = new KYCService();
