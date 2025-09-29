const express = require('express');
const LoanTypeController = require('../controllers/loanTypeController');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

// Only BANKER can create, update, delete loan types
router.post('/', authMiddleware.authenticate, authMiddleware.authorize(['BANKER']), LoanTypeController.create);
router.get('/', authMiddleware.authenticate, LoanTypeController.list);
router.get('/:id', authMiddleware.authenticate, LoanTypeController.getById);
router.put('/:id', authMiddleware.authenticate, authMiddleware.authorize(['BANKER']), LoanTypeController.update);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorize(['BANKER']), LoanTypeController.remove);

module.exports = router;
