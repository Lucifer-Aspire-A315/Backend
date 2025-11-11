const { v4: uuidv4 } = require('uuid');

function correlationId(req, res, next) {
  const id = req.headers['x-request-id'] || uuidv4();
  req.id = id; // keep simple: attach to req.id
  res.setHeader('X-Request-Id', id);
  next();
}

module.exports = correlationId;
