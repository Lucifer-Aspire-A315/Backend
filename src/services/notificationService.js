const prisma = require('../lib/prisma');
const { logger } = require('../middleware/logger');

class NotificationService {
  /**
   * Create a new notification for a user
   */
  async createNotification(userId, type, message) {
    try {
      const notification = await prisma.notification.create({
        data: {
          userId,
          type,
          message,
          status: 'unread',
        },
      });
      
      // TODO: If we add real-time (Socket.io), emit event here
      logger.info('Notification created', { userId, type, notificationId: notification.id });
      return notification;
    } catch (error) {
      logger.error('Create Notification Failed', { userId, error: error.message });
      // We don't throw here to prevent blocking the main flow (e.g. loan approval)
      return null;
    }
  }

  /**
   * Get notifications for a user with pagination
   */
  async getUserNotifications(userId, filters = {}) {
    const { status, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;
    const where = { userId };
    
    if (status) {
      where.status = status;
    }

    try {
      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.notification.count({ where }),
      ]);

      return {
        notifications,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error('Get Notifications Failed', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(notificationId, userId) {
    try {
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
      });

      if (!notification) {
        const error = new Error('Notification not found');
        error.status = 404;
        throw error;
      }

      if (notification.userId !== userId) {
        const error = new Error('Access denied');
        error.status = 403;
        throw error;
      }

      const updated = await prisma.notification.update({
        where: { id: notificationId },
        data: { status: 'read' },
      });

      return updated;
    } catch (error) {
      logger.error('Mark Notification Read Failed', { notificationId, error: error.message });
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId) {
    try {
      const result = await prisma.notification.updateMany({
        where: { 
          userId,
          status: 'unread' 
        },
        data: { status: 'read' },
      });

      return result.count;
    } catch (error) {
      logger.error('Mark All Read Failed', { userId, error: error.message });
      throw error;
    }
  }
}

module.exports = new NotificationService();
