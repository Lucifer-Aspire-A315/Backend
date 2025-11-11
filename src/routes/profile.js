const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const auth = require('../middleware/auth');

router.get('/', auth.authenticate, profileController.getProfile);
router.put('/', auth.authenticate, profileController.updateProfile);

module.exports = router;
