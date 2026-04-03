// Load environment variables first
require('dotenv').config();

// Import routes and middleware
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const { prisma } = require('./lib/prisma');
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
const { logger } = require('./middleware/logger');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

function parseAllowedOrigins() {
  const rawOrigins = process.env.FRONTEND_ORIGINS || process.env.FRONTEND_URL || '';
  const parsed = rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (parsed.length > 0) {
    return parsed;
  }

  return process.env.NODE_ENV === 'production'
    ? []
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:54046', 'http://localhost:50369'];
}

const allowedOrigins = parseAllowedOrigins();

function isDevelopmentLocalOrigin(origin) {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin) {
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  return isDevelopmentLocalOrigin(origin);
}

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      const error = new Error('Origin not allowed by CORS');
      error.status = 403;
      callback(error);
    },
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
app.use('/api/v1/customer-links', require('./routes/customerLinks'));
app.use('/api/v1/kyc', kycRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/admin/users', require('./routes/adminUsers'));
app.use('/api/v1/profile', require('./routes/profile'));

// Catch-all 404 for /api/v1 routes
app.use('/api/v1', (req, res, next) => {
  notFound(req, res, next);
});

app.use(errorHandler);

const startServer = async () => {
  try {
    const validateEnv = () => {
      if (process.env.NODE_ENV !== 'production') return;

      const required = [
        'DATABASE_URL',
        'JWT_SECRET',
        'JWT_REFRESH_SECRET',
        'FRONTEND_ORIGINS',
        'CLOUDINARY_CLOUD_NAME',
        'CLOUDINARY_API_KEY',
        'CLOUDINARY_API_SECRET',
        'CLOUDINARY_KYC_FOLDER',
      ];
      const missing = required.filter((k) => !process.env[k]);
      if (missing.length) {
        logger.error('Missing required environment variables', { missing });
        process.exit(1);
      }

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

      if (!process.env.REDIS_URL) {
        logger.warn(
          'REDIS_URL is not configured in production. Rate-limits and lockouts will fall back to in-memory storage.',
        );
      }
    };
    validateEnv();
    // Test DB connection via Prisma
    await prisma.$connect();

    logger.info('Database Connection', {
      status: 'connected',
      provider: 'PostgreSQL',
      databaseUrlConfigured: !!process.env.DATABASE_URL,
    });
    logger.info('Database connected successfully', {
      tables: ['User', 'Loan', 'KYCDocument', 'Notification', 'AuditLog'],
    });


    // Start server
    const server = app.listen(PORT, HOST, () => {
      logger.info('Server Started', {
        port: PORT,
        host: HOST,
        environment: process.env.NODE_ENV,
        baseUrl: `${HOST === '0.0.0.0' ? 'http://localhost' : `http://${HOST}`}:${PORT}/api/v1`,
      });
      logger.info('Server URLs', {
        base: `${HOST === '0.0.0.0' ? 'http://localhost' : `http://${HOST}`}:${PORT}/api/v1`,
        health: `/api/v1/health`,
        authSignup: `/api/v1/auth/signup`,
        authLogin: `/api/v1/auth/login`,
        logs: './logs/combined.log',
        allowedOrigins,
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
    logger.error('Failed to start server', { error: error && (error.stack || error.message) });
    process.exit(1);
  }
};

startServer();

module.exports = app;
