require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Import routes and middleware
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth'); // ✅ New import
const uploadRoutes = require('./routes/uploads');
const loanRoutes = require('./routes/loan');
const kycRoutes = require('./routes/kyc');
const notificationRoutes = require('./routes/notifications');
const dashboardRoutes = require('./routes/dashboard');
const { loggerMiddleware } = require('./middleware/logger');
const correlationId = require('./middleware/correlationId');
const { metricsMiddleware, metricsHandler } = require('./middleware/metrics');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Winston logger instance
const { logger } = require('./middleware/logger');

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:8080'],
    credentials: true,
  }),
);

// Correlation ID must come early
app.use(correlationId);

// Logging middleware
morgan.token('id', (req) => req.id);
app.use(
  morgan('combined', {
    stream: {
      write: (message) =>
        logger.info('Morgan', { message: message.trim(), correlationId: undefined }),
    },
  }),
);
app.use(loggerMiddleware);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Metrics middleware (after body parsing so route is set)
app.use(metricsMiddleware);

// API versioning prefix logging
app.use('/api/v1', (req, res, next) => {
  logger.info('API Request', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
  });
  next();
});

// ROUTES - Add auth routes
app.use('/api/v1/health', healthRoutes);
app.get('/api/v1/metrics', metricsHandler);
app.use('/api/v1/auth', authRoutes); // 
app.use('/api/v1/uploads', uploadRoutes);
app.use('/api/v1/loan', loanRoutes);

app.use('/api/v1/loan-types', require('./routes/loanType'));
app.use('/api/v1/banks', require('./routes/bank'));
app.use('/api/v1/admin/banks', require('./routes/bankAdmin'));
app.use('/api/v1/kyc', kycRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/profile', require('./routes/profile'));

// Catch-all 404 for /api/v1 routes
app.use('/api/v1', (req, res, next) => {
  notFound(req, res, next);
});

// Global error handler (must be LAST)
app.use(errorHandler);

const startServer = async () => {
  try {
    // Validate critical environment variables in production
    const validateEnv = () => {
      if (process.env.NODE_ENV !== 'production') return;

      const required = ['DATABASE_URL', 'JWT_SECRET', 'FRONTEND_URL'];
      const missing = required.filter((k) => !process.env[k]);
      if (missing.length) {
        logger.error('Missing required environment variables', { missing });
        process.exit(1);
      }

      // Email provider: require either RESEND_API_KEY+EMAIL_FROM or SMTP settings
      const hasResend = !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
      const hasSmtp =
        !!process.env.SMTP_HOST &&
        !!process.env.SMTP_USER &&
        !!process.env.SMTP_PASS &&
        !!(process.env.SMTP_FROM || process.env.EMAIL_FROM);
      if (!hasResend && !hasSmtp) {
        const msg =
          'No email provider configured. Set RESEND_API_KEY and EMAIL_FROM, or SMTP_HOST/SMTP_USER/SMTP_PASS and SMTP_FROM.';
        logger.error(msg);
        process.exit(1);
      }
    };
    validateEnv();
    // Test DB connection via Prisma
    const prisma = require('./lib/prisma');
    await prisma.$connect();

    logger.info('Database Connection', {
      status: 'connected',
      provider: 'PostgreSQL',
      database: 'rn_fintech',
    });
    logger.info('Database connected successfully', {
      tables: ['User', 'Loan', 'KYCDocument', 'Notification', 'AuditLog'],
    });

    // keep the shared prisma client connected for the app lifetime

    // Start server
    const server = app.listen(PORT, 'localhost', () => {
      logger.info('Server Started', {
        port: PORT,
        environment: process.env.NODE_ENV,
        baseUrl: `http://localhost:${PORT}/api/v1`,
      });
      logger.info('Server URLs', {
        base: `http://localhost:${PORT}/api/v1`,
        health: `/api/v1/health`,
        authSignup: `/api/v1/auth/signup`,
        authLogin: `/api/v1/auth/login`,
        logs: './logs/combined.log',
      });
    });

    // Graceful shutdown helper
    const gracefulShutdown = (signal) => {
      return async () => {
        try {
          logger.info('Shutdown initiated', { signal });
          // stop accepting new connections
          server.close(async (err) => {
            if (err) {
              logger.error('Error closing server during shutdown', { error: err.message });
              process.exit(1);
            }
            try {
              await prisma.$disconnect();
              logger.info('Prisma disconnected');
            } catch (discErr) {
              logger.warn('Error disconnecting Prisma', { error: discErr.message });
            }
            logger.info('Server closed, exiting process');
            logger.info('Process terminated');
            process.exit(0);
          });

          // Force exit if shutdown hangs
          setTimeout(() => {
            logger.error('Forcing process exit after timeout');
            process.exit(1);
          }, 10000).unref();
        } catch (error) {
          logger.error('Graceful shutdown failed', { error: error.message });
          process.exit(1);
        }
      };
    };

    process.on('SIGTERM', gracefulShutdown('SIGTERM'));
    process.on('SIGINT', gracefulShutdown('SIGINT'));
    process.on('SIGUSR2', gracefulShutdown('SIGUSR2'));

    // Handle unexpected errors
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception', { error: err.stack || err.message });
      // attempt a graceful shutdown
      gracefulShutdown('uncaughtException')();
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection', {
        reason: (reason && (reason.stack || reason.message)) || reason,
      });
      // attempt a graceful shutdown
      gracefulShutdown('unhandledRejection')();
    });
  } catch (error) {
    logger.error('Server Startup Failed', {
      error: error.message,
      code: error.code,
    });
    logger.error('❌ Failed to start server', { error: error && (error.stack || error.message) });
    process.exit(1);
  }
};

startServer();

module.exports = app;
