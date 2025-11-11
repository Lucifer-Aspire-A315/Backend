const client = require('prom-client');

// Create a Registry to register the metrics
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5],
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestsTotal);

function metricsMiddleware(req, res, next) {
  const startEpoch = process.hrtime.bigint();
  const method = req.method;
  // Express 5 keeps route path in req.route after matching; fallback to URL
  let route = req.path || req.originalUrl || 'unknown';

  res.on('finish', () => {
    const diffNs = Number(process.hrtime.bigint() - startEpoch);
    const seconds = diffNs / 1e9;
    const status = String(res.statusCode);
    // Try to use matched route if available
    if (req.route && req.route.path)
      route = req.baseUrl ? `${req.baseUrl}${req.route.path}` : req.route.path;

    httpRequestDuration.labels(method, route, status).observe(seconds);
    httpRequestsTotal.labels(method, route, status).inc();
  });

  next();
}

async function metricsHandler(req, res) {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to collect metrics' });
  }
}

module.exports = { metricsMiddleware, metricsHandler };
