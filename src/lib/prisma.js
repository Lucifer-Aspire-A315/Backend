const { PrismaClient } = require('@prisma/client');

// Use a single PrismaClient instance across the app to avoid exhausting DB connections
let prisma;
if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  // In development, attach to global to support hot-reloads without creating new clients
  if (!global.__prisma) {
    global.__prisma = new PrismaClient();
  }
  prisma = global.__prisma;
}

module.exports = prisma;
