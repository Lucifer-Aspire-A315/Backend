const notificationService = require('../services/notificationService');

class NotificationController {
  async list(req, res, next) {
    try {
      const { status, page, limit } = req.query;
      const result = await notificationService.getUserNotifications(req.user.id, {
        status,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
      });
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async markRead(req, res, next) {
    try {
      const { id } = req.params;
      const notification = await notificationService.markAsRead(id, req.user.id);
      res.json({
        success: true,
        data: notification,
      });
    } catch (error) {
      next(error);
    }
  }

  async markAllRead(req, res, next) {
    try {
      const count = await notificationService.markAllAsRead(req.user.id);
      res.json({
        success: true,
        message: `Marked ${count} notifications as read`,
        count,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new NotificationController();
