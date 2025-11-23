const prisma = require('../lib/prisma');
const { logger } = require('../middleware/logger');
const { hashToken } = require('../utils/emailVerification');
const { verifyResource } = require('../utils/cloudinary');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

class LoanService {
  /**
   * Apply for a loan (new comprehensive implementation)
   */
  async applyForLoan(data, merchantId) {
    const { applicant, loanTypeId, amount, tenorMonths, metadata = {}, documents = [] } = data;

    logger.info('Applying for loan', { merchantId, loanTypeId, amount });

    // Fetch loan type and validate
    const loanType = await prisma.loanType.findUnique({
      where: { id: loanTypeId },
    });

    if (!loanType) {
      const error = new Error('Loan type not found');
      error.status = 404;
      throw error;
    }

    // Validate metadata against loan type schema
    if (
      loanType.schema &&
      typeof loanType.schema === 'object' &&
      Object.keys(loanType.schema).length > 0
    ) {
      const validate = ajv.compile(loanType.schema);
      const valid = validate(metadata);
      if (!valid) {
        const error = new Error('Invalid loan metadata');
        error.status = 400;
        error.details = validate.errors;
        throw error;
      }
    }

    // Validate required documents
    if (loanType.requiredDocuments && loanType.requiredDocuments.length > 0) {
      const uploadedDocTypes = documents.map((doc) => doc.type || doc.fileType);
      const missingDocs = loanType.requiredDocuments.filter(
        (reqDoc) => !uploadedDocTypes.includes(reqDoc),
      );

      if (missingDocs.length > 0) {
        const error = new Error(`Missing required documents: ${missingDocs.join(', ')}`);
        error.status = 400;
        throw error;
      }
    }

    let customerId = null;

    // Handle applicant type
    if (applicant.type === 'merchant') {
      customerId = null;
    } else if (applicant.type === 'existing') {
      if (!applicant.customerId) {
        const error = new Error('Customer ID required for existing customer');
        error.status = 400;
        throw error;
      }

      const customer = await prisma.user.findUnique({
        where: { id: applicant.customerId },
        include: { customerProfile: true },
      });

      if (!customer || customer.role !== 'CUSTOMER') {
        const error = new Error('Customer not found');
        error.status = 404;
        throw error;
      }

      customerId = customer.id;
    } else if (applicant.type === 'new') {
      const { name, email, phone, address } = applicant.customer;

      if (!name || !email || !phone) {
        const error = new Error('Name, email, and phone required for new customer');
        error.status = 400;
        throw error;
      }

      const normalizedEmail = String(email).trim().toLowerCase();

      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (existingUser) {
        const error = new Error('Customer with this email already exists');
        error.status = 409;
        throw error;
      }

      const { generateToken, getTokenExpiry } = require('../utils/emailVerification');
      const bcrypt = require('bcryptjs');
      const token = generateToken();
      const tokenHash = hashToken(token);
      const tokenExpiry = getTokenExpiry(24);

      const tempPassword = Math.random().toString(36).slice(-8);
      const passwordHash = await bcrypt.hash(tempPassword, 12);

      const newCustomer = await prisma.user.create({
        data: {
          name,
          email: normalizedEmail,
          phone,
          passwordHash,
          role: 'CUSTOMER',
          isEmailVerified: false,
          emailVerificationToken: tokenHash,
          emailVerificationTokenExpires: tokenExpiry,
          customerProfile: {
            create: {
              address: address || null,
            },
          },
        },
        include: { customerProfile: true },
      });

      customerId = newCustomer.id;

      // Link this new customer to the applying merchant so on-behalf operations are authorized
      try {
        const merchantProfile = await prisma.merchantProfile.findUnique({ where: { userId: merchantId } });
        if (merchantProfile) {
          await prisma.customerProfile.update({
            where: { userId: newCustomer.id },
            data: { merchantId: merchantProfile.id },
          });
        }
      } catch (linkErr) {
        logger.warn('Failed to link new customer to merchant profile', {
          merchantId,
          customerId,
          error: linkErr.message,
        });
      }

      const { sendVerificationEmail } = require('../utils/emailSender');
      sendVerificationEmail(newCustomer.email, token).catch((err) =>
        logger.error('Failed to send verification email', {
          error: err.message,
          email: newCustomer.email,
        }),
      );

      logger.info('Created new customer for loan application', {
        customerId,
        email: normalizedEmail,
      });
    } else {
      const error = new Error('Invalid applicant type. Must be "merchant", "existing", or "new"');
      error.status = 400;
      throw error;
    }

    // Verify documents exist in Cloudinary AND belong to the uploader
    if (documents.length > 0) {
      const verificationPromises = documents.map(async (doc) => {
        const publicId = doc.public_id || doc.publicId;
        if (!publicId) return false;

        // Ownership check: publicId must start with merchantId (uploader) OR customerId (beneficiary)
        const isMerchantDoc = publicId.startsWith(merchantId);
        const isCustomerDoc = customerId && publicId.startsWith(customerId);

        if (!isMerchantDoc && !isCustomerDoc) {
          logger.warn('Document ownership mismatch', { publicId, merchantId, customerId });
          return false;
        }

        return verifyResource(publicId);
      });

      const results = await Promise.all(verificationPromises);
      const invalidDocs = documents.filter((_, index) => !results[index]);

      if (invalidDocs.length > 0) {
        const error = new Error(
          `Invalid documents: The following files could not be verified or do not belong to you: ${invalidDocs
            .map((d) => d.filename || d.public_id)
            .join(', ')}`,
        );
        error.status = 400;
        throw error;
      }
    }

    const loan = await prisma.$transaction(async (tx) => {
      const newLoan = await tx.loan.create({
        data: {
          loanTypeId,
          merchantId,
          applicantId: customerId || merchantId,
          amount,
          tenorMonths,
          metadata,
          status: 'SUBMITTED',
          kycStatus: 'PENDING',
        },
        include: {
          loanType: true,
          merchant: { include: { merchantProfile: true } },
          applicant: { select: { id: true, name: true, email: true } },
        },
      });

      if (documents.length > 0) {
        await tx.document.createMany({
          data: documents.map((doc) => ({
            loanId: newLoan.id,
            publicId: doc.public_id || doc.publicId,
            secureUrl: doc.secure_url || doc.secureUrl,
            url: doc.secure_url || doc.secureUrl,
            filename: doc.filename,
            fileType: doc.type || doc.fileType,
            type: doc.type || 'attachment',
            bytes: doc.bytes,
            uploaderId: merchantId,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          entityType: 'LOAN',
          entityId: newLoan.id,
          action: 'LOAN_APPLIED',
          actorId: merchantId,
        },
      });

      return newLoan;
    });

    logger.info('Loan application created', {
      loanId: loan.id,
      merchantId,
      applicantId: loan.applicantId,
    });
    return loan;
  }

  /**
   * Get loan by ID with access control
   */
  async getLoanById(loanId, userId, userRole) {
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        loanType: true,
        merchant: { include: { merchantProfile: true } },
        applicant: { select: { id: true, name: true, email: true, phone: true, role: true } },
        banker: { include: { bankerProfile: true } },
        documents: { orderBy: { createdAt: 'desc' } },
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });

    if (!loan) {
      const error = new Error('Loan not found');
      error.status = 404;
      throw error;
    }

    // Access control
    const hasAccess =
      userRole === 'ADMIN' ||
      loan.merchantId === userId ||
      loan.applicantId === userId ||
      loan.bankerId === userId;

    if (!hasAccess) {
      const error = new Error('Access denied');
      error.status = 403;
      throw error;
    }

    // Enrich with KYC readiness
  try {
      const kycService = require('./kycService');
      const loanTypeHint = loan.loanType?.code || loan.loanType?.name || null;
      const readiness = await kycService.isKYCComplete(
        loan.applicantId,
        loan.applicant.role,
        loanTypeHint,
      );
      return { ...loan, kycReadiness: readiness };
    } catch {
      return loan;
    }
  }

  /**
   * List loans with filters and pagination
   */
  async listLoans(filters, userId, userRole) {
    const { status, merchantId, bankerId, page = 1, limit = 20 } = filters;

    const where = {};

    // Role-based filtering
    if (userRole === 'MERCHANT') {
      where.merchantId = userId;
    } else if (userRole === 'CUSTOMER') {
      where.applicantId = userId;
    } else if (userRole === 'BANKER') {
      // Fetch banker's pincode to filter unassigned loans
      const banker = await prisma.bankerProfile.findUnique({ where: { userId } });
      const bankerPincode = banker?.pincode;

      where.OR = [
        { bankerId: userId }, // Assigned to me
        { 
          bankerId: null, // Unassigned
          // AND: Applicant is in my area (if pincode exists)
          ...(bankerPincode ? {
            applicant: {
              customerProfile: {
                pincode: bankerPincode
              }
            }
          } : {})
        }
      ];
    }
    // ADMIN sees all

    if (status) where.status = status;
    if (merchantId) where.merchantId = merchantId;
    if (bankerId) where.bankerId = bankerId;

    const skip = (page - 1) * limit;

    const [loans, total] = await Promise.all([
      prisma.loan.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          loanType: true,
          merchant: { select: { id: true, name: true, email: true } },
          applicant: { select: { id: true, name: true, email: true, role: true } },
          banker: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.loan.count({ where }),
    ]);

    // Enrich each loan with KYC readiness
    const kycService = require('./kycService');
    const enriched = await Promise.all(
      loans.map(async (ln) => {
        try {
          const loanTypeHint = ln.loanType?.code || ln.loanType?.name || null;
          const readiness = await kycService.isKYCComplete(
            ln.applicantId,
            ln.applicant.role,
            loanTypeHint,
          );
          return { ...ln, kycReadiness: readiness };
        } catch {
          return ln;
        }
      }),
    );

    return {
      loans: enriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Assign banker to loan
   */
  async assignBanker(loanId, bankerId, assignedBy) {
    const loan = await prisma.loan.findUnique({ where: { id: loanId } });

    if (!loan) {
      const error = new Error('Loan not found');
      error.status = 404;
      throw error;
    }

    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(loan.status)) {
      const error = new Error('Cannot assign banker to loan in current status');
      error.status = 400;
      throw error;
    }

    const banker = await prisma.user.findUnique({
      where: { id: bankerId },
      include: { bankerProfile: true },
    });

    if (!banker || banker.role !== 'BANKER') {
      const error = new Error('Banker not found');
      error.status = 404;
      throw error;
    }

    const updatedLoan = await prisma.$transaction(async (tx) => {
      const updated = await tx.loan.update({
        where: { id: loanId },
        data: {
          bankerId,
          status: 'UNDER_REVIEW',
        },
        include: {
          loanType: true,
          merchant: { select: { id: true, name: true, email: true } },
          banker: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: 'LOAN',
          entityId: loanId,
          action: 'BANKER_ASSIGNED',
          actorId: assignedBy,
        },
      });

      return updated;
    });

    logger.info('Banker assigned to loan', { loanId, bankerId, assignedBy });
    return updatedLoan;
  }

  /**
   * Approve loan
   */
  async approveLoan(loanId, bankerId, notes, interestRate) {
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        applicant: { select: { id: true, role: true, name: true, email: true } },
        loanType: { select: { id: true, name: true, code: true } },
      },
    });

    if (!loan) {
      const error = new Error('Loan not found');
      error.status = 404;
      throw error;
    }

    if (loan.status !== 'UNDER_REVIEW') {
      const error = new Error('Loan must be under review to approve');
      error.status = 400;
      throw error;
    }

    if (loan.bankerId !== bankerId) {
      const error = new Error('Only assigned banker can approve this loan');
      error.status = 403;
      throw error;
    }

    if (!interestRate || interestRate <= 0) {
      const error = new Error('Valid interest rate is required for approval');
      error.status = 400;
      throw error;
    }

    // Enforce KYC prerequisite before approval
    const kycService = require('./kycService');
    const loanTypeHint = loan.loanType?.code || loan.loanType?.name || null;
    const kyc = await kycService.isKYCComplete(
      loan.applicantId,
      loan.applicant.role,
      loanTypeHint,
    );

    if (!kyc.complete) {
      const error = new Error(
        `KYC incomplete for applicant. Missing: ${kyc.missingTypes.join(', ') || 'requirements'}`,
      );
      error.status = 400;
      error.code = 'KYC_INCOMPLETE';
      error.details = { missingTypes: kyc.missingTypes, percentComplete: kyc.percentComplete };
      throw error;
    }

    const approvedLoan = await prisma.$transaction(async (tx) => {
      const updated = await tx.loan.update({
        where: { id: loanId },
        data: {
          status: 'APPROVED',
          kycStatus: 'VERIFIED',
          interestRate: interestRate,
        },
        include: {
          loanType: true,
          merchant: { select: { id: true, name: true, email: true } },
          applicant: { select: { id: true, name: true, email: true } },
          banker: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: 'LOAN',
          entityId: loanId,
          action: 'LOAN_APPROVED',
          actorId: bankerId,
          details: `Rate: ${interestRate}%, Notes: ${notes || ''}`,
        },
      });

      return updated;
    });

    logger.info('Loan approved', { loanId, bankerId });
    this.notifyLoanApproval(approvedLoan).catch((err) =>
      logger.error('Notification failed', { error: err.message }),
    );

    return approvedLoan;
  }

  /**
   * Reject loan
   */
  async rejectLoan(loanId, bankerId, notes) {
    const loan = await prisma.loan.findUnique({ where: { id: loanId } });

    if (!loan) {
      const error = new Error('Loan not found');
      error.status = 404;
      throw error;
    }

    if (loan.status !== 'UNDER_REVIEW') {
      const error = new Error('Loan must be under review to reject');
      error.status = 400;
      throw error;
    }

    if (loan.bankerId !== bankerId) {
      const error = new Error('Only assigned banker can reject this loan');
      error.status = 403;
      throw error;
    }

    if (!notes) {
      const error = new Error('Rejection reason required');
      error.status = 400;
      throw error;
    }

    const rejectedLoan = await prisma.$transaction(async (tx) => {
      const updated = await tx.loan.update({
        where: { id: loanId },
        data: {
          status: 'REJECTED',
        },
        include: {
          loanType: true,
          merchant: { select: { id: true, name: true, email: true } },
          applicant: { select: { id: true, name: true, email: true } },
          banker: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: 'LOAN',
          entityId: loanId,
          action: 'LOAN_REJECTED',
          actorId: bankerId,
        },
      });

      return updated;
    });

    logger.info('Loan rejected', { loanId, bankerId });
    this.notifyLoanRejection(rejectedLoan, notes).catch((err) =>
      logger.error('Notification failed', { error: err.message }),
    );

    return rejectedLoan;
  }

  /**
   * Disburse loan
   */
  async disburseLoan(loanId, bankerId, referenceId, notes) {
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        applicant: { select: { id: true, role: true, name: true, email: true } },
        merchant: { select: { id: true, name: true, email: true } },
      },
    });

    if (!loan) {
      const error = new Error('Loan not found');
      error.status = 404;
      throw error;
    }

    if (loan.status !== 'APPROVED') {
      const error = new Error('Loan must be APPROVED to disburse');
      error.status = 400;
      throw error;
    }

    if (loan.bankerId !== bankerId) {
      const error = new Error('Only assigned banker can disburse this loan');
      error.status = 403;
      throw error;
    }

    if (!referenceId) {
      const error = new Error('Transaction reference ID is required for disbursement');
      error.status = 400;
      throw error;
    }

    const disbursedLoan = await prisma.$transaction(async (tx) => {
      // Update metadata with disbursement details
      const metadata = loan.metadata || {};
      metadata.disbursement = {
        referenceId,
        notes,
        disbursedAt: new Date(),
      };

      const updated = await tx.loan.update({
        where: { id: loanId },
        data: {
          status: 'DISBURSED',
          metadata,
        },
        include: {
          loanType: true,
          merchant: { select: { id: true, name: true, email: true } },
          applicant: { select: { id: true, name: true, email: true } },
          banker: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: 'LOAN',
          entityId: loanId,
          action: 'LOAN_DISBURSED',
          actorId: bankerId,
          details: `Ref: ${referenceId}`,
        },
      });

      return updated;
    });

    logger.info('Loan disbursed', { loanId, bankerId, referenceId });
    this.notifyLoanDisbursement(disbursedLoan).catch((err) =>
      logger.error('Notification failed', { error: err.message }),
    );

    return disbursedLoan;
  }

  /**
   * Cancel loan (Applicant/Merchant)
   */
  async cancelLoan(loanId, userId, reason) {
    const loan = await prisma.loan.findUnique({ where: { id: loanId } });

    if (!loan) {
      const error = new Error('Loan not found');
      error.status = 404;
      throw error;
    }

    // Check ownership
    if (loan.applicantId !== userId && loan.merchantId !== userId) {
      const error = new Error('Not authorized to cancel this loan');
      error.status = 403;
      throw error;
    }

    // Check status
    if (!['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(loan.status)) {
      const error = new Error('Cannot cancel loan in current status (must be DRAFT, SUBMITTED, UNDER_REVIEW or APPROVED)');
      error.status = 400;
      throw error;
    }

    const cancelledLoan = await prisma.$transaction(async (tx) => {
      const updated = await tx.loan.update({
        where: { id: loanId },
        data: {
          status: 'CANCELLED',
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: 'LOAN',
          entityId: loanId,
          action: 'LOAN_CANCELLED',
          actorId: userId,
          details: reason,
        },
      });

      return updated;
    });

    logger.info('Loan cancelled', { loanId, userId });
    return cancelledLoan;
  }

  /**
   * Notification helpers
   */
  async notifyLoanApproval(loan) {
    const notificationService = require('./notificationService');
    
    // Notify Applicant
    await notificationService.createNotification(
      loan.applicantId,
      'LOAN_APPROVED',
      `Your loan application for ${loan.amount} has been approved.`
    );

    // Notify Merchant (if different from applicant)
    if (loan.merchantId !== loan.applicantId) {
      await notificationService.createNotification(
        loan.merchantId,
        'LOAN_APPROVED',
        `Loan application for ${loan.applicant.name} has been approved.`
      );
    }
  }

  async notifyLoanRejection(loan, reason) {
    const notificationService = require('./notificationService');

    // Notify Applicant
    await notificationService.createNotification(
      loan.applicantId,
      'LOAN_REJECTED',
      `Your loan application has been rejected. Reason: ${reason}`
    );

    // Notify Merchant (if different from applicant)
    if (loan.merchantId !== loan.applicantId) {
      await notificationService.createNotification(
        loan.merchantId,
        'LOAN_REJECTED',
        `Loan application for ${loan.applicant.name} has been rejected.`
      );
    }
  }

  async notifyLoanDisbursement(loan) {
    const notificationService = require('./notificationService');
    const ref = loan.metadata?.disbursement?.referenceId || 'N/A';

    // Notify Applicant
    await notificationService.createNotification(
      loan.applicantId,
      'LOAN_DISBURSED',
      `Your loan of ${loan.amount} has been disbursed. Ref: ${ref}`
    );

    // Notify Merchant (if different)
    if (loan.merchantId !== loan.applicantId) {
      await notificationService.createNotification(
        loan.merchantId,
        'LOAN_DISBURSED',
        `Loan for ${loan.applicant.name} has been disbursed. Ref: ${ref}`
      );
    }
  }
}

const loanServiceInstance = new LoanService();
module.exports = loanServiceInstance;
