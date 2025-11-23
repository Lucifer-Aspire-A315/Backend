const adminUserService = require('../services/adminUserService');

class AdminUserController {
  async listUsers(req, res, next) {
    try {
      const { role, status, search, page, limit } = req.query;
      const result = await adminUserService.listUsers({
        role,
        status,
        search,
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

  async updateUserStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      if (!['ACTIVE', 'SUSPENDED', 'PENDING', 'REJECTED'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status',
        });
      }

      const user = await adminUserService.updateUserStatus(id, status, req.user.userId);
      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AdminUserController();
