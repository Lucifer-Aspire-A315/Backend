const prisma = require('../lib/prisma');
const { logger } = require('../middleware/logger');

class AuditService {
  /**
   * Create an audit log entry
   * @param {Object} params
   * @param {string} params.action - Action performed (e.g., 'LOAN_CREATED', 'USER_SUSPENDED')
   * @param {string} params.actorId - ID of the user performing the action
   * @param {string} params.entityType - Type of entity (e.g., 'LOAN', 'USER', 'LOAN_TYPE')
   * @param {string} params.entityId - ID of the entity
   * @param {Object|string} [params.details] - Additional details (will be stringified if object)
   * @param {string} [params.loanId] - Optional loan ID for backward compatibility/relation
   */
  async log({ action, actorId, entityType, entityId, details, loanId }) {
    try {
      const data = {
        action,
        actorId,
        entityType,
        entityId,
        details: typeof details === 'object' ? JSON.stringify(details) : details,
      };

      if (loanId) {
        data.loanId = loanId;
      }

      await prisma.auditLog.create({ data });
      
      // We don't log the audit log creation itself to avoid loops, 
      // but we can log to file for double redundancy if needed.
    } catch (error) {
      // If audit logging fails, we should log it to the file logger but NOT throw,
      // so we don't block the main business logic.
      logger.error('Audit Log Creation Failed', { 
        action, actorId, entityType, entityId, error: error.message 
      });
    }
  }
}

module.exports = new AuditService();
