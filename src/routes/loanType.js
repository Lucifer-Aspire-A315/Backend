const express = require('express');
const LoanTypeController = require('../controllers/loanTypeController');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

// Only ADMIN can create, update, delete loan types
router.post('/', authMiddleware.authenticate, authMiddleware.authorize(['ADMIN']), LoanTypeController.create);
router.get('/', authMiddleware.authenticate, LoanTypeController.list);
router.get('/:id', authMiddleware.authenticate, LoanTypeController.getById);
router.put('/:id', authMiddleware.authenticate, authMiddleware.authorize(['ADMIN']), LoanTypeController.update);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorize(['ADMIN']), LoanTypeController.remove);

module.exports = router;
