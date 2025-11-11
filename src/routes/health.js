const express = require('express');
const prisma = require('../lib/prisma');
const router = express.Router();

// Health check endpoint
router.get('/', async (req, res) => {
  try {
    // Quick DB ping
    await prisma.$queryRaw`SELECT 1 as healthy`;

    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      database: 'connected',
      uptime: process.uptime(),
    });

    // don't disconnect shared prisma client here
  } catch (error) {
    const { logger } = require('../middleware/logger');
    logger.error('Health check failed', { error: error && (error.message || error.stack) });
    res.status(503).json({
      status: 'error',
      message: 'Database connection failed',
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
