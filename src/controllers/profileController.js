const { logger } = require('../middleware/logger');
const prisma = require('../lib/prisma');
const { validate, validationSchemas } = require('../utils/validation');

// Helper: get profile model and fields by role
function getProfileConfig(role) {
  if (role === 'CUSTOMER') return { model: 'customerProfile', fields: ['address', 'pincode'] };
  if (role === 'MERCHANT')
    return {
      model: 'merchantProfile',
      fields: ['businessName', 'gstNumber', 'address', 'pincode'],
    };
  if (role === 'BANKER')
    return { model: 'bankerProfile', fields: ['bankId', 'branch', 'pincode', 'employeeId'] };
  throw new Error('Invalid role');
}

exports.getProfile = async (req, res, next) => {
  try {
    const { user } = req;
    const { model } = getProfileConfig(user.role);
    // Fetch user base info
    const userData = await prisma.user.findUnique({
      where: { id: user.userId || user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!userData) return res.status(404).json({ success: false, message: 'User not found' });
    // Fetch profile
    const profile = await prisma[model].findUnique({ where: { userId: user.userId || user.id } });
    if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });
    res.json({ success: true, data: { user: userData, profile } });
  } catch (err) {
    next(err);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { user } = req;
    const { model, fields } = getProfileConfig(user.role);
    // Only allow updates to allowed fields
    const updateData = {};
    for (const field of fields) {
      if (req.body[field] !== undefined) updateData[field] = req.body[field];
    }
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }
    const profile = await prisma[model].update({
      where: { userId: user.userId || user.id },
      data: updateData,
    });
    logger.info('Profile updated', {
      userId: user.userId || user.id,
      role: user.role,
      fields: Object.keys(updateData),
    });
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
};
