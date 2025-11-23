const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

// Use a single PrismaClient instance across the app to avoid exhausting DB connections
let prisma;
if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({ adapter });
} else {
  // In development, attach to global to support hot-reloads without creating new clients
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({ adapter });
  }
  prisma = global.__prisma;
}

module.exports = prisma;
