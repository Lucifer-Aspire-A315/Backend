const { PrismaClient } = require('@prisma/client');
const { logger } = require('../middleware/logger');

const prisma = new PrismaClient();

class LoanTypeService {
  /**
   * Create a new loan type
   */
  async createLoanType({ name, description, bankIds }) {
    try {
      const data = {
        name,
        description,
        banks: bankIds && Array.isArray(bankIds)
          ? { connect: bankIds.map(id => ({ id })) }
          : undefined,
      };
      const loanType = await prisma.loanType.create({
        data,
        include: { banks: true },
      });
      logger.info('LoanType Created', { id: loanType.id, name: loanType.name });
      return loanType;
    } catch (error) {
      logger.error('Create LoanType Failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get all loan types
   */
  async getAllLoanTypes() {
    try {
      const loanTypes = await prisma.loanType.findMany({
        orderBy: { name: 'asc' },
      });
      return loanTypes;
    } catch (error) {
      logger.error('Get All LoanTypes Failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get loan type by ID
   */
  async getLoanTypeById(id) {
    try {
      const loanType = await prisma.loanType.findUnique({
        where: { id },
      });
      return loanType;
    } catch (error) {
      logger.error('Get LoanType By ID Failed', { id, error: error.message });
      throw error;
    }
  }

  /**
   * Update loan type
   */
  async updateLoanType(id, { name, description, bankIds }) {
    try {
      const data = {
        name,
        description,
        banks: bankIds && Array.isArray(bankIds)
          ? { set: bankIds.map(id => ({ id })) }
          : undefined,
      };
      const loanType = await prisma.loanType.update({
        where: { id },
        data,
        include: { banks: true },
      });
      logger.info('LoanType Updated', { id });
      return loanType;
    } catch (error) {
      logger.error('Update LoanType Failed', { id, error: error.message });
      throw error;
    }
  }

  /**
   * Delete loan type
   */
  async deleteLoanType(id) {
    try {
      await prisma.loanType.delete({
        where: { id },
      });
      logger.info('LoanType Deleted', { id });
      return { id };
    } catch (error) {
      logger.error('Delete LoanType Failed', { id, error: error.message });
      throw error;
    }
  }
}

module.exports = new LoanTypeService();
