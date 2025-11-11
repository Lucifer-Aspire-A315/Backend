const Joi = require('joi');

const signupCustomerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .required(),
  phone: Joi.string()
    .pattern(/^[6-9]\d{9}$/)
    .required(),
  password: Joi.string().min(8).required(),
  address: Joi.string().max(255).optional().allow(''),
  pincode: Joi.string()
    .pattern(/^\d{6}$/)
    .optional()
    .allow(''),
  role: Joi.string().valid('CUSTOMER').required(),
});

const signupMerchantSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .required(),
  phone: Joi.string()
    .pattern(/^[6-9]\d{9}$/)
    .required(),
  password: Joi.string().min(8).required(),
  businessName: Joi.string().min(2).max(100).required(),
  gstNumber: Joi.string().max(20).optional().allow(''),
  address: Joi.string().max(255).optional().allow(''),
  pincode: Joi.string()
    .pattern(/^\d{6}$/)
    .optional()
    .allow(''),
  role: Joi.string().valid('MERCHANT').required(),
});

const signupBankerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .required(),
  phone: Joi.string()
    .pattern(/^[6-9]\d{9}$/)
    .required(),
  password: Joi.string().min(8).required(),
  bankId: Joi.string().uuid().required(),
  branch: Joi.string().max(100).required(),
  pincode: Joi.string()
    .pattern(/^\d{6}$/)
    .required(),
  employeeId: Joi.string().max(50).optional().allow(''),
  role: Joi.string().valid('BANKER').required(),
});

const validationSchemas = {
  signupCustomer: signupCustomerSchema,
  signupMerchant: signupMerchantSchema,
  signupBanker: signupBankerSchema,

  login: Joi.object({
    email: Joi.string()
      .email({ tlds: { allow: false } })
      .required()
      .messages({
        'string.email': 'Please enter a valid email address',
        'any.required': 'Email is required',
      }),
    password: Joi.string().min(8).required().messages({
      'string.min': 'Password must be at least 8 characters long',
      'any.required': 'Password is required',
    }),
  }),

  // Loan schemas
  loanApply: Joi.object({
    typeId: Joi.string().uuid().required().messages({
      'string.uuid': 'Invalid loan type ID',
      'any.required': 'Loan type ID is required',
    }),
    amount: Joi.number().min(1000).max(5000000).required().messages({
      'number.min': 'Loan amount must be at least ₹1,000',
      'number.max': 'Loan amount cannot exceed ₹50,00,000',
      'any.required': 'Loan amount is required',
    }),
    merchantId: Joi.string().uuid().optional().allow(null).messages({
      'string.uuid': 'Invalid merchant ID format',
    }),
    purpose: Joi.string().max(500).optional().messages({
      'string.max': 'Purpose must be less than 500 characters',
    }),
  }),

  loanStatus: Joi.object({
    status: Joi.string().valid('APPROVED', 'REJECTED').required().messages({
      'any.only': 'Status must be APPROVED or REJECTED',
      'any.required': 'Status is required',
    }),
    notes: Joi.string().max(1000).optional().messages({
      'string.max': 'Notes must be less than 1000 characters',
    }),
  }),

  // KYC schemas
  kycUploadUrl: Joi.object({
    docType: Joi.string()
      .valid('ID_PROOF', 'ADDRESS_PROOF', 'PAN_CARD', 'BANK_STATEMENT')
      .required()
      .messages({
        'any.only':
          'Document type must be one of: ID_PROOF, ADDRESS_PROOF, PAN_CARD, BANK_STATEMENT',
        'any.required': 'Document type is required',
      }),
  }),
  kycOnBehalfUploadUrl: Joi.object({
    targetUserId: Joi.string().uuid().required().messages({
      'string.uuid': 'Invalid target user ID',
      'any.required': 'targetUserId is required',
    }),
    docType: Joi.string()
      .valid('ID_PROOF', 'ADDRESS_PROOF', 'PAN_CARD', 'BANK_STATEMENT')
      .required(),
  }),

  kycCompleteUpload: Joi.object({
    kycDocId: Joi.string().uuid().required().messages({
      'string.uuid': 'Invalid KYC document ID',
      'any.required': 'KYC document ID is required',
    }),
    publicId: Joi.string().required().messages({
      'any.required': 'Public ID is required',
    }),
    fileSize: Joi.number().integer().min(1).required().messages({
      'number.integer': 'File size must be an integer',
      'number.min': 'File size must be greater than 0',
      'any.required': 'File size is required',
    }),
    contentType: Joi.string()
      .valid('image/jpeg', 'image/png', 'application/pdf')
      .required()
      .messages({
        'any.only': 'Content type must be one of: image/jpeg, image/png, application/pdf',
        'any.required': 'Content type is required',
      }),
  }),

  kycVerify: Joi.object({
    status: Joi.string().valid('VERIFIED', 'REJECTED').required().messages({
      'any.only': 'Status must be VERIFIED or REJECTED',
      'any.required': 'Status is required',
    }),
    notes: Joi.string().max(1000).allow('').optional().messages({
      'string.max': 'Notes must be less than 1000 characters',
    }),
  }),

  // Admin: LoanType schemas
  loanTypeCreate: Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    code: Joi.string().trim().max(50).optional().allow(null, ''),
    description: Joi.string().max(500).optional().allow('', null),
    schema: Joi.object().unknown(true).optional(),
    bankIds: Joi.array().items(Joi.string().uuid()).optional(),
  }),

  loanTypeUpdate: Joi.object({
    name: Joi.string().trim().min(2).max(100).optional(),
    code: Joi.string().trim().max(50).optional().allow(null, ''),
    description: Joi.string().max(500).optional().allow('', null),
    schema: Joi.object().unknown(true).optional(),
    bankIds: Joi.array().items(Joi.string().uuid()).optional(),
  }).min(1),
};

const validate = (schema, data) => {
  try {
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const validationError = new Error('Validation failed');
      validationError.name = 'ValidationError';
      validationError.isJoi = true;
      validationError.status = 400;
      validationError.validationErrors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      throw validationError;
    }

    return value;
  } catch (error) {
    if (!error.isJoi) {
      throw error;
    }
    throw error;
  }
};

const validateLoan = (schema, data) => validate(schema, data);
const validateKYC = (schema, data) => validate(schema, data);

module.exports = {
  validationSchemas,
  signupCustomerSchema,
  signupMerchantSchema,
  signupBankerSchema,
  validate,
  validateLoan,
  validateKYC,
};
