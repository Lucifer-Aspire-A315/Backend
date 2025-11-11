// Lightweight smoke test for loanService.updateLoanStatus using a mocked prisma
const loanService = require('../src/services/loanService');

// Create a mock prisma with the methods used by updateLoanStatus and createAuditLog
const mockPrisma = {
  loan: {
    findUnique: async ({ where }) => {
      if (where.id === 'existing-loan-id') {
        return {
          id: 'existing-loan-id',
          applicantId: 'applicant-1',
          merchantId: null,
          bankerId: null,
          status: 'PENDING',
        };
      }
      return null;
    },
    update: async ({ where, data, include }) => {
      // Return a pretend updated loan object
      return {
        id: where.id,
        type: include.type
          ? { id: 'type-1', name: 'Small Business Loan', description: 'Test' }
          : null,
        applicant: include.applicant
          ? { id: 'applicant-1', name: 'Alice', email: 'alice@example.com', role: 'CUSTOMER' }
          : null,
        merchant: include.merchant ? null : null,
        auditLogs: include.auditLogs ? [] : [],
        amount: 50000,
        status: data.status,
        updatedAt: new Date(),
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
      };
    },
    count: async () => 0,
    aggregate: async () => ({ _sum: { amount: 0 } }),
    findMany: async () => [],
  },
  auditLog: {
    create: async ({ data }) => {
      console.log('Mock auditLog.create called with:', data);
      return { id: 'audit-1', ...data };
    },
  },
};

// Replace the internal prisma instance with the mock
loanService.__setPrismaForTest && loanService.__setPrismaForTest(mockPrisma);

(async () => {
  try {
    console.log('Running smoke test: updateLoanStatus APPROVED');
    const updated = await loanService.updateLoanStatus(
      'existing-loan-id',
      'APPROVED',
      'banker-1',
      'All good',
    );
    console.log('updateLoanStatus returned:', updated);
    console.log('Smoke test passed');
  } catch (err) {
    console.error('Smoke test failed:', err);
    process.exit(1);
  }
})();
