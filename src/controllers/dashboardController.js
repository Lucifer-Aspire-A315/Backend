const dashboardService = require('../services/dashboardService');

class DashboardController {
  async getDashboard(req, res, next) {
    try {
      const { role, userId } = req.user;
      let data = {};

      switch (role) {
        case 'ADMIN':
          data = await dashboardService.getAdminStats();
          break;
        case 'BANKER':
          data = await dashboardService.getBankerStats(userId);
          break;
        case 'MERCHANT':
          data = await dashboardService.getMerchantStats(userId);
          break;
        case 'CUSTOMER':
          data = await dashboardService.getCustomerStats(userId);
          break;
        default:
          return res.status(400).json({
            success: false,
            message: 'Unknown role',
          });
      }

      res.json({
        success: true,
        role,
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new DashboardController();
