const dashboardService = require('../services/dashboardService');

class DashboardController {
  async getDashboard(req, res, next) {
    try {
      const { role, id } = req.user;
      let data = {};

      switch (role) {
        case 'ADMIN':
          data = await dashboardService.getAdminStats();
          break;
        case 'BANKER':
          data = await dashboardService.getBankerStats(id);
          break;
        case 'MERCHANT':
          data = await dashboardService.getMerchantStats(id);
          break;
        case 'CUSTOMER':
          data = await dashboardService.getCustomerStats(id);
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
