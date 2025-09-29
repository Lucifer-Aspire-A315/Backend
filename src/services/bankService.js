exports.createBank = async ({ name, loanTypeIds }) => {
  return prisma.bank.create({
    data: {
      name,
      loanTypes: loanTypeIds && Array.isArray(loanTypeIds)
        ? { connect: loanTypeIds.map(id => ({ id })) }
        : undefined,
    },
    include: { loanTypes: { select: { id: true, name: true } } },
  });
};

exports.updateBank = async (id, { name, loanTypeIds }) => {
  return prisma.bank.update({
    where: { id },
    data: {
      name,
      loanTypes: loanTypeIds && Array.isArray(loanTypeIds)
        ? { set: loanTypeIds.map(id => ({ id })) }
        : undefined,
    },
    include: { loanTypes: { select: { id: true, name: true } } },
  });
};

exports.deleteBank = async (id) => {
  return prisma.bank.delete({ where: { id } });
};
// src/services/bankService.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getBanks = async ({ loanTypeId }) => {
  const select = { id: true, name: true };
  if (loanTypeId) {
    // Filter banks that offer the given loan type
    return prisma.bank.findMany({
      where: {
        loanTypes: {
          some: { id: loanTypeId },
        },
      },
      select,
    });
  }
  // Return all banks
  return prisma.bank.findMany({ select });
};

exports.getLoanTypes = async ({ bankId }) => {
  const select = { id: true, name: true };
  if (bankId) {
    // Filter loan types offered by the given bank
    return prisma.loanType.findMany({
      where: {
        banks: {
          some: { id: bankId },
        },
      },
      select,
    });
  }
  // Return all loan types
  return prisma.loanType.findMany({ select });
};
