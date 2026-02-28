const { prisma } = require('../lib/prisma');
const { logger } = require('../middleware/logger');
const { hashToken } = require('../utils/emailVerification');
const { verifyResource } = require('../utils/cloudinary');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

class LoanService {
  normalizeAssignmentRequests(metadata) {
    const current = metadata && typeof metadata === 'object' ? { ...metadata } : {};
    if (Array.isArray(current.assignmentRequests)) return current.assignmentRequests;
    if (current.assignmentRequest && typeof current.assignmentRequest === 'object') {
      return [current.assignmentRequest];
    }
    return [];
  }
  /**
   * Apply for a loan (new comprehensive implementation)
   */
  async applyForLoan(data, actorId, actorRole) {
    const { applicant = {}, loanTypeId, amount, tenorMonths, metadata = {}, documents = [] } = data;

    logger.info('Applying for loan', { actorId, actorRole, loanTypeId, amount });

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
    let merchantId = null;

    if (actorRole === 'CUSTOMER') {
      // Customers can only apply for themselves.
      if (applicant.type && !['customer', 'self'].includes(applicant.type)) {
        const error = new Error('Customers can only apply for themselves');
        error.status = 400;
        throw error;
      }
      customerId = actorId;
    } else if (actorRole === 'MERCHANT') {
      merchantId = actorId;
      const applicantType = applicant.type || 'merchant';

      // Handle merchant applicant type
      if (applicantType === 'merchant') {
        customerId = null;
      } else if (applicantType === 'existing') {
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
      } else if (applicantType === 'new') {
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
    } else {
      const error = new Error('Only merchants or customers can apply for loans');
      error.status = 400;
      throw error;
    }

    // Verify documents exist in Cloudinary AND belong to the uploader
    if (documents.length > 0) {
      const verificationPromises = documents.map(async (doc) => {
        const publicId = doc.public_id || doc.publicId;
        if (!publicId) return false;

        // Ownership check: publicId must start with actorId (uploader) OR customerId (beneficiary)
        const isActorDoc = publicId.startsWith(actorId);
        const isCustomerDoc = customerId && publicId.startsWith(customerId);

        if (!isActorDoc && !isCustomerDoc) {
          logger.warn('Document ownership mismatch', { publicId, actorId, customerId });
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
          applicantId: customerId || actorId,
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
            uploaderId: actorId,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          entityType: 'LOAN',
          entityId: newLoan.id,
          action: 'LOAN_APPLIED',
          actorId,
        },
      });

      return newLoan;
    });

    logger.info('Loan application created', {
      loanId: loan.id,
      actorId,
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
    const bankerCanViewUnassigned =
      userRole === 'BANKER' && !loan.bankerId && ['SUBMITTED', 'UNDER_REVIEW'].includes(loan.status);
    const hasAccess =
      userRole === 'ADMIN' ||
      loan.merchantId === userId ||
      loan.applicantId === userId ||
      loan.bankerId === userId ||
      bankerCanViewUnassigned;

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
      // Bankers can see assigned-to-me and all unassigned active-stage loans.
      where.OR = [
        { bankerId: userId },
        {
          bankerId: null,
          status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
        },
      ];
    }
    // ADMIN sees all

    if (status) where.status = status;
    if (merchantId) where.merchantId = merchantId;
    if (bankerId) where.bankerId = bankerId;

    const skip = (page - 1) * limit;
    let loans = [];
    let total = 0;

    const include = {
      loanType: true,
      merchant: { select: { id: true, name: true, email: true } },
      applicant: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          customerProfile: { select: { pincode: true } },
          merchantProfile: { select: { pincode: true } },
        },
      },
      banker: { select: { id: true, name: true, email: true } },
    };

    if (userRole === 'BANKER') {
      const banker = await prisma.bankerProfile.findUnique({ where: { userId } });
      const bankerPincode = banker?.pincode || null;

      const all = await prisma.loan.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include,
      });

      const ranked = all
        .map((loan) => {
          const applicantPincode =
            loan.applicant?.customerProfile?.pincode ||
            loan.applicant?.merchantProfile?.pincode ||
            null;
          const isPincodeMatch = !!bankerPincode && !!applicantPincode && applicantPincode === bankerPincode;
          let rank = 3;
          if (isPincodeMatch && loan.bankerId === null) rank = 0;
          else if (loan.bankerId === userId) rank = 1;
          else if (loan.bankerId === null) rank = 2;
          return { loan, rank };
        })
        .sort((a, b) => {
          if (a.rank !== b.rank) return a.rank - b.rank;
          return new Date(b.loan.createdAt).getTime() - new Date(a.loan.createdAt).getTime();
        })
        .map((x) => x.loan);

      total = ranked.length;
      loans = ranked.slice(skip, skip + limit);
    } else {
      const [rows, count] = await Promise.all([
        prisma.loan.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include,
        }),
        prisma.loan.count({ where }),
      ]);
      loans = rows;
      total = count;
    }

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
      const metadata = loan.metadata && typeof loan.metadata === 'object' ? { ...loan.metadata } : {};
      const requests = this.normalizeAssignmentRequests(metadata).map((r) => {
        if (r && r.bankerId === bankerId && r.status === 'PENDING') {
          return {
            ...r,
            status: 'APPROVED',
            decisionBy: assignedBy,
            decisionAt: new Date().toISOString(),
            decisionNotes: 'Assigned by admin',
          };
        }
        if (r && r.status === 'PENDING') {
          return {
            ...r,
            status: 'AUTO_CANCELLED',
            decisionBy: assignedBy,
            decisionAt: new Date().toISOString(),
            decisionNotes: 'Already assigned to another banker',
          };
        }
        return r;
      });
      metadata.assignmentRequests = requests;

      const updated = await tx.loan.update({
        where: { id: loanId },
        data: {
          bankerId,
          status: 'UNDER_REVIEW',
          metadata,
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

  async requestAssignment(loanId, bankerId, note, proposedInterestRate) {
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        applicant: { select: { id: true, name: true } },
        merchant: { select: { id: true, name: true } },
      },
    });

    if (!loan) {
      const error = new Error('Loan not found');
      error.status = 404;
      throw error;
    }
    if (loan.bankerId) {
      const error = new Error('Loan is already assigned to a banker');
      error.status = 400;
      throw error;
    }
    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(loan.status)) {
      const error = new Error('Loan is not open for assignment requests');
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

    const metadata = loan.metadata && typeof loan.metadata === 'object' ? { ...loan.metadata } : {};
    const requests = this.normalizeAssignmentRequests(metadata);
    const existingRequest = requests.find((r) => r && r.bankerId === bankerId && r.status === 'PENDING');
    if (existingRequest) {
      const error = new Error('A pending assignment request already exists');
      error.status = 409;
      throw error;
    }

    requests.push({
      bankerId,
      bankerName: banker.name,
      note: note || '',
      proposedInterestRate: Number(proposedInterestRate),
      status: 'PENDING',
      requestedAt: new Date().toISOString(),
    });
    metadata.assignmentRequests = requests;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.loan.update({
        where: { id: loanId },
        data: { metadata },
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
          action: 'BANKER_ASSIGNMENT_REQUESTED',
          actorId: bankerId,
          details: note || '',
        },
      });
      return row;
    });

    const notificationService = require('./notificationService');
    if (loan.applicantId) {
      await notificationService.createNotification(
        loan.applicantId,
        'BANKER_ASSIGNMENT_REQUEST',
        `${banker.name} requested assignment for your loan.`,
      );
    }
    if (loan.merchantId && loan.merchantId !== loan.applicantId) {
      await notificationService.createNotification(
        loan.merchantId,
        'BANKER_ASSIGNMENT_REQUEST',
        `${banker.name} requested assignment for loan ${loan.id.slice(0, 8)}.`,
      );
    }

    return updated;
  }

  async assignmentDecision(loanId, actorId, actorRole, targetBankerId, approve, notes) {
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        applicant: { select: { id: true, name: true } },
        merchant: { select: { id: true, name: true } },
      },
    });

    if (!loan) {
      const error = new Error('Loan not found');
      error.status = 404;
      throw error;
    }

    const isOwner = loan.applicantId === actorId || loan.merchantId === actorId || actorRole === 'ADMIN';
    if (!isOwner) {
      const error = new Error('Not authorized to decide assignment request');
      error.status = 403;
      throw error;
    }

    const metadata = loan.metadata && typeof loan.metadata === 'object' ? { ...loan.metadata } : {};
    const requests = this.normalizeAssignmentRequests(metadata);
    const requestIndex = requests.findIndex(
      (r) => r && r.bankerId === targetBankerId && r.status === 'PENDING',
    );
    if (requestIndex === -1) {
      const error = new Error('No pending assignment request found');
      error.status = 400;
      throw error;
    }
    const request = requests[requestIndex];

    const updatedRequest = {
      ...request,
      status: approve ? 'APPROVED' : 'REJECTED',
      decisionBy: actorId,
      decisionAt: new Date().toISOString(),
      decisionNotes: notes || '',
    };
    requests[requestIndex] = updatedRequest;
    if (approve) {
      for (let i = 0; i < requests.length; i += 1) {
        if (i === requestIndex) continue;
        const r = requests[i];
        if (r && r.status === 'PENDING') {
          requests[i] = {
            ...r,
            status: 'AUTO_CANCELLED',
            decisionBy: actorId,
            decisionAt: new Date().toISOString(),
            decisionNotes: 'Already assigned to another banker',
          };
        }
      }
    }
    metadata.assignmentRequests = requests;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.loan.update({
        where: { id: loanId },
        data: {
          bankerId: approve ? request.bankerId : null,
          status: approve && loan.status === 'SUBMITTED' ? 'UNDER_REVIEW' : loan.status,
          interestRate: approve ? request.proposedInterestRate : loan.interestRate,
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
          action: approve ? 'BANKER_ASSIGNMENT_APPROVED' : 'BANKER_ASSIGNMENT_REJECTED',
          actorId,
          details: notes || '',
        },
      });
      return row;
    });

    const notificationService = require('./notificationService');
    if (request.bankerId) {
      await notificationService.createNotification(
        request.bankerId,
        approve ? 'BANKER_ASSIGNMENT_APPROVED' : 'BANKER_ASSIGNMENT_REJECTED',
        approve
          ? `Your assignment request for loan ${loan.id.slice(0, 8)} was approved.`
          : `Your assignment request for loan ${loan.id.slice(0, 8)} was rejected.`,
      );
    }

    if (approve) {
      const cancelled = requests.filter(
        (r) => r && r.bankerId !== request.bankerId && r.status === 'AUTO_CANCELLED',
      );
      for (const c of cancelled) {
        await notificationService.createNotification(
          c.bankerId,
          'BANKER_ASSIGNMENT_CANCELLED',
          `Loan ${loan.id.slice(0, 8)} has been assigned to another banker.`,
        );
      }
    }

    return updated;
  }

  /**
   * Approve loan
   */
  async approveLoan(loanId, bankerId, notes, interestRate) {
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        applicant: { select: { id: true, role: true, name: true, email: true } },
        loanType: { select: { id: true, name: true, code: true, requiredDocuments: true } },
        documents: {
          select: {
            id: true,
            type: true,
            fileType: true,
            filename: true,
            url: true,
            secureUrl: true,
          },
        },
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

    const effectiveInterestRate = Number(interestRate || loan.interestRate || 0);
    if (!effectiveInterestRate || effectiveInterestRate <= 0) {
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

    // If profile KYC is incomplete, allow approval when equivalent required docs
    // are already uploaded on this loan and can be manually reviewed in loan detail.
    let kycSatisfiedByLoanDocs = false;
    if (!kyc.complete) {
      const loanDocTypes = new Set(
        (loan.documents || [])
          .map((d) => (d.type || d.fileType || '').toString().trim().toUpperCase())
          .filter((v) => v.length > 0),
      );

      const missingTypes = (kyc.missingTypes || [])
        .map((t) => t.toString().trim().toUpperCase())
        .filter((t) => t.length > 0);

      const stillMissing = missingTypes.filter((t) => !loanDocTypes.has(t));
      kycSatisfiedByLoanDocs = stillMissing.length === 0 && missingTypes.length > 0;
    }

    if (!kyc.complete && !kycSatisfiedByLoanDocs) {
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
          interestRate: effectiveInterestRate,
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
          details: `Rate: ${effectiveInterestRate}%, KYC: ${
            kyc.complete ? 'PROFILE_VERIFIED' : 'LOAN_DOCUMENTS_VERIFIED'
          }, Notes: ${notes || ''}`,
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
