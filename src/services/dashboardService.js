const prisma = require('../lib/prisma');
const { logger } = require('../middleware/logger');

class DashboardService {
  /**
   * Get statistics for System Admins
   */
  async getAdminStats() {
    try {
      // 1. User Counts by Role
      const userCounts = await prisma.user.groupBy({
        by: ['role'],
        _count: { id: true },
      });

      // 2. Loan Aggregates (Volume & Count by Status)
      const loanStats = await prisma.loan.groupBy({
        by: ['status'],
        _count: { id: true },
        _sum: { amount: true },
      });

      // 3. Recent System Activity
      // Note: AuditLog does not have a direct relation to User (actor) in the schema yet,
      // so we fetch logs and then manually fetch actor names if needed, or just return IDs.
      // For now, we'll just return the logs.
      const recentActivity = await prisma.auditLog.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          loan: { select: { id: true, status: true } },
        },
      });

      // Format Data
      const users = userCounts.reduce((acc, curr) => {
        acc[curr.role] = curr._count.id;
        return acc;
      }, {});

      const loans = {
        totalVolume: 0,
        totalCount: 0,
        byStatus: {},
      };

      loanStats.forEach((stat) => {
        loans.byStatus[stat.status] = {
          count: stat._count.id,
          volume: stat._sum.amount || 0,
        };
        loans.totalCount += stat._count.id;
        loans.totalVolume += Number(stat._sum.amount || 0);
      });

      return { users, loans, recentActivity };
    } catch (error) {
      logger.error('Get Admin Stats Failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get statistics for Bankers
   */
  async getBankerStats(bankerId) {
    try {
      // 1. My Work Queue (Assigned & Pending Review)
      const myPendingCount = await prisma.loan.count({
        where: {
          bankerId,
          status: 'UNDER_REVIEW',
        },
      });

      // 2. Unassigned Pool (Available to pick up)
      const unassignedCount = await prisma.loan.count({
        where: {
          bankerId: null,
          status: 'SUBMITTED',
        },
      });

      // 3. My Performance (Approved vs Rejected)
      const myPerformance = await prisma.loan.groupBy({
        by: ['status'],
        where: { bankerId },
        _count: { id: true },
      });

      // 4. Recent Actions
      const recentActions = await prisma.loan.findMany({
        where: { bankerId },
        take: 5,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          amount: true,
          status: true,
          updatedAt: true,
          applicant: { select: { name: true } },
        },
      });

      return {
        queue: {
          myPending: myPendingCount,
          unassigned: unassignedCount,
        },
        performance: myPerformance.reduce((acc, curr) => {
          acc[curr.status] = curr._count.id;
          return acc;
        }, {}),
        recentActions,
      };
    } catch (error) {
      logger.error('Get Banker Stats Failed', { bankerId, error: error.message });
      throw error;
    }
  }

  /**
   * Get statistics for Merchants
   */
  async getMerchantStats(merchantId) {
    try {
      // 1. Application Summary
      const stats = await prisma.loan.groupBy({
        by: ['status'],
        where: { merchantId },
        _count: { id: true },
        _sum: { amount: true },
      });

      // 2. Recent Applications
      const recentApps = await prisma.loan.findMany({
        where: { merchantId },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          applicant: { select: { name: true, email: true } },
          loanType: { select: { name: true } },
        },
      });

      // Calculate Totals
      let totalApps = 0;
      let approvedApps = 0;
      let disbursedAmount = 0;
      const byStatus = {};

      stats.forEach((s) => {
        byStatus[s.status] = s._count.id;
        totalApps += s._count.id;
        if (s.status === 'APPROVED') {
          approvedApps += s._count.id;
          disbursedAmount += Number(s._sum.amount || 0);
        }
      });

      const approvalRate = totalApps > 0 ? Math.round((approvedApps / totalApps) * 100) : 0;

      return {
        summary: {
          totalApps,
          approvalRate,
          disbursedAmount,
        },
        byStatus,
        recentApps,
      };
    } catch (error) {
      logger.error('Get Merchant Stats Failed', { merchantId, error: error.message });
      throw error;
    }
  }

  /**
   * Get statistics for Customers
   */
  async getCustomerStats(customerId) {
    try {
      // 1. Active Application (Most recent)
      const activeLoan = await prisma.loan.findFirst({
        where: { applicantId: customerId },
        orderBy: { createdAt: 'desc' },
        include: {
          loanType: { select: { name: true } },
        },
      });

      // 2. Unread Notifications
      const unreadNotifications = await prisma.notification.count({
        where: {
          userId: customerId,
          status: 'unread',
        },
      });

      // 3. Loan History Summary
      const history = await prisma.loan.groupBy({
        by: ['status'],
        where: { applicantId: customerId },
        _count: { id: true },
      });

      return {
        activeLoan: activeLoan
          ? {
              id: activeLoan.id,
              type: activeLoan.loanType?.name,
              amount: activeLoan.amount,
              status: activeLoan.status,
              date: activeLoan.createdAt,
            }
          : null,
        unreadNotifications,
        history: history.reduce((acc, curr) => {
          acc[curr.status] = curr._count.id;
          return acc;
        }, {}),
      };
    } catch (error) {
      logger.error('Get Customer Stats Failed', { customerId, error: error.message });
      throw error;
    }
  }
}

module.exports = new DashboardService();
