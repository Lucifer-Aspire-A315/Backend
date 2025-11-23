const prisma = require('../lib/prisma');
const { logger } = require('../middleware/logger');

class UserService {
  /**
   * List users with filters (Admin only)
   */
  async listUsers(filters) {
    const { role, status, search, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;
    
    const where = {};
    if (role) where.role = role;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    try {
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            status: true,
            createdAt: true,
            isEmailVerified: true,
          },
        }),
        prisma.user.count({ where }),
      ]);

      return {
        users,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error('List Users Failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Update user status (Admin only)
   */
  async updateUserStatus(userId, status) {
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: { status },
        select: { id: true, email: true, status: true },
      });
      
      logger.info('User status updated', { userId, status });
      return user;
    } catch (error) {
      logger.error('Update User Status Failed', { userId, error: error.message });
      throw error;
    }
  }
}

module.exports = new UserService();
