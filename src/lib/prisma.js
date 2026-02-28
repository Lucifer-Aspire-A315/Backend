const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

// log database URL at runtime for debugging
console.log('prisma.js DATABASE_URL =', process.env.DATABASE_URL);
console.log('type =', typeof process.env.DATABASE_URL);

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

module.exports = { prisma };
