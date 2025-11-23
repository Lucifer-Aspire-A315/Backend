const express = require('express');
const router = express.Router();
const adminUserController = require('../controllers/adminUserController');
const { authenticate, authorize } = require('../middleware/auth');

// All routes require ADMIN role
router.use(authenticate);
router.use(authorize(['ADMIN']));

router.get('/', adminUserController.listUsers);
router.put('/:id/status', adminUserController.updateUserStatus);

module.exports = router;
