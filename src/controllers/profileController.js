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
    const userId = user.userId || user.id;
    
    // Select schema based on role
    let schema;
    if (user.role === 'CUSTOMER') schema = validationSchemas.updateProfileCustomer;
    else if (user.role === 'MERCHANT') schema = validationSchemas.updateProfileMerchant;
    else if (user.role === 'BANKER') schema = validationSchemas.updateProfileBanker;
    else return res.status(400).json({ success: false, message: 'Invalid role' });

    // Validate input
    const validatedData = validate(schema, req.body);

    // Separate User fields and Profile fields
    const userFields = ['name', 'avatar']; // Add 'phone' here if we allow phone updates later
    const userUpdateData = {};
    const profileUpdateData = {};

    Object.keys(validatedData).forEach((key) => {
      if (userFields.includes(key)) {
        userUpdateData[key] = validatedData[key];
      } else {
        profileUpdateData[key] = validatedData[key];
      }
    });

    if (Object.keys(userUpdateData).length === 0 && Object.keys(profileUpdateData).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    const { model } = getProfileConfig(user.role);

    // Use transaction to update both
    const [updatedUser, updatedProfile] = await prisma.$transaction([
      Object.keys(userUpdateData).length > 0
        ? prisma.user.update({
            where: { id: userId },
            data: userUpdateData,
            select: { id: true, name: true, email: true, phone: true, role: true, avatar: true },
          })
        : prisma.user.findUnique({ where: { id: userId } }),
      Object.keys(profileUpdateData).length > 0
        ? prisma[model].update({
            where: { userId: userId },
            data: profileUpdateData,
          })
        : prisma[model].findUnique({ where: { userId: userId } }),
    ]);

    logger.info('Profile updated', {
      userId,
      role: user.role,
      fields: Object.keys(validatedData),
    });

    // Create Notification
    await prisma.notification.create({
      data: {
        userId,
        type: 'PROFILE_UPDATE',
        message: 'Your profile details have been updated successfully.',
      },
    });

    res.json({ success: true, data: { user: updatedUser, profile: updatedProfile } });
  } catch (err) {
    next(err);
  }
};

exports.deleteAccount = async (req, res, next) => {
  try {
    const { user } = req;
    const userId = user.userId || user.id;

    // Check for active loans (as applicant)
    const activeLoans = await prisma.loan.findFirst({
      where: {
        applicantId: userId,
        status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'DISBURSED'] },
      },
    });

    if (activeLoans) {
      const error = new Error('Cannot delete account with active loans');
      error.status = 400;
      throw error;
    }

    // Check for active loans (as merchant or banker)
    if (user.role === 'MERCHANT' || user.role === 'BANKER') {
      // This logic might need refinement based on business rules.
      // For now, we block if they are associated with any active loan.
      const associatedLoans = await prisma.loan.findFirst({
        where: {
          OR: [{ merchantId: userId }, { bankerId: userId }],
          status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'DISBURSED'] },
        },
      });

      if (associatedLoans) {
        const error = new Error('Cannot delete account with associated active loans');
        error.status = 400;
        throw error;
      }
    }

    // Soft delete
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'DELETED' },
    });

    // Revoke all refresh tokens
    await prisma.refreshToken.updateMany({
      where: { userId: userId },
      data: { revoked: true },
    });

    logger.info('Account deleted (soft)', { userId, role: user.role });

    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (err) {
    next(err);
  }
};
