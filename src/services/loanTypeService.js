const prisma = require('../lib/prisma');
const { logger } = require('../middleware/logger');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

class LoanTypeService {
  /**
   * Create a new loan type
   */
  async createLoanType({
    name,
    code,
    description,
    interestRate,
    minTenure,
    maxTenure,
    minAmount,
    maxAmount,
    schema,
    requiredDocuments,
    bankIds,
  }) {
    try {
      // Validate JSON Schema if provided
      if (schema && typeof schema === 'object') {
        try {
          ajv.compile(schema);
        } catch (e) {
          const error = new Error('Invalid JSON Schema provided');
          error.status = 400;
          error.details = e.message;
          throw error;
        }
      }

      const data = {
        name,
        code: code || undefined,
        description,
        interestRate,
        minTenure,
        maxTenure,
        minAmount,
        maxAmount,
        schema: schema && typeof schema === 'object' ? schema : undefined,
        requiredDocuments: requiredDocuments || [],
        banks:
          bankIds && Array.isArray(bankIds)
            ? { connect: bankIds.map((id) => ({ id })) }
            : undefined,
      };
      const loanType = await prisma.loanType.create({
        data,
        include: { banks: true },
      });
      logger.info('LoanType Created', { id: loanType.id, name: loanType.name });
      return loanType;
    } catch (error) {
      if (error.code === 'P2002') {
        const conflict = new Error('LoanType with the same unique field already exists');
        conflict.status = 409;
        throw conflict;
      }
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
      const loanType = await prisma.loanType.findUnique({ where: { id }, include: { banks: true } });
      return loanType;
    } catch (error) {
      logger.error('Get LoanType By ID Failed', { id, error: error.message });
      throw error;
    }
  }

  /**
   * Update loan type
   */
  async updateLoanType(
    id,
    {
      name,
      code,
      description,
      interestRate,
      minTenure,
      maxTenure,
      minAmount,
      maxAmount,
      schema,
      requiredDocuments,
      bankIds,
    },
  ) {
    try {
      // Validate JSON Schema if provided
      if (schema && typeof schema === 'object') {
        try {
          ajv.compile(schema);
        } catch (e) {
          const error = new Error('Invalid JSON Schema provided');
          error.status = 400;
          error.details = e.message;
          throw error;
        }
      }

      const data = {
        ...(name !== undefined ? { name } : {}),
        ...(code !== undefined ? { code } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(interestRate !== undefined ? { interestRate } : {}),
        ...(minTenure !== undefined ? { minTenure } : {}),
        ...(maxTenure !== undefined ? { maxTenure } : {}),
        ...(minAmount !== undefined ? { minAmount } : {}),
        ...(maxAmount !== undefined ? { maxAmount } : {}),
        ...(schema && typeof schema === 'object' ? { schema } : {}),
        ...(requiredDocuments !== undefined ? { requiredDocuments } : {}),
        banks:
          bankIds && Array.isArray(bankIds) ? { set: bankIds.map((id) => ({ id })) } : undefined,
      };
      const loanType = await prisma.loanType.update({
        where: { id },
        data,
        include: { banks: true },
      });
      logger.info('LoanType Updated', { id });
      return loanType;
    } catch (error) {
      if (error.code === 'P2002') {
        const conflict = new Error('LoanType with the same unique field already exists');
        conflict.status = 409;
        throw conflict;
      }
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
