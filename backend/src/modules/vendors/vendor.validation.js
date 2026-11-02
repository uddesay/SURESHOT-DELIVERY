const Joi = require('joi');

const gstin = Joi.string().pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
  .message('GSTIN must be a valid 15-character GST identification number');
const pan = Joi.string().pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
  .message('PAN must be a valid 10-character permanent account number');
const ifsc = Joi.string().pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/).message('IFSC must be a valid 11-character bank code');

const addressFields = {
  name: Joi.string().max(120).required(),
  line1: Joi.string().max(255).required(),
  city: Joi.string().max(80).required(),
  state: Joi.string().max(80).required(),
  postalCode: Joi.string().pattern(/^[A-Za-z0-9 -]{3,12}$/).required(),
  country: Joi.string().length(2).uppercase(),
  contactPhone: Joi.string().pattern(/^\+?[1-9]\d{7,14}$/),
};

const bankAccountFields = {
  accountHolder: Joi.string().min(2).max(120).required(),
  accountNumber: Joi.string().pattern(/^[0-9]{9,18}$/).required().messages({ 'string.pattern.base': 'Account number must be 9-18 digits' }),
  ifsc: ifsc.required(),
  bankName: Joi.string().min(2).max(120).required(),
  isPrimary: Joi.boolean(),
};

module.exports = {
  register: {
    body: Joi.object({
      storeName: Joi.string().min(2).max(120).trim().required(),
      description: Joi.string().max(2000).allow(''),
      supportEmail: Joi.string().email().max(255),
      supportPhone: Joi.string().pattern(/^\+?[1-9]\d{7,14}$/),
      gstin,
      pan,
      businessType: Joi.string().valid('individual', 'proprietorship', 'partnership', 'llp', 'private_limited', 'public_limited'),
      warehouse: Joi.object(addressFields),
      bankAccount: Joi.object(bankAccountFields),
    }),
  },
  updateProfile: {
    body: Joi.object({
      storeName: Joi.string().min(2).max(120).trim(),
      description: Joi.string().max(2000).allow(''),
      logoUrl: Joi.string().uri().max(2048),
      bannerUrl: Joi.string().uri().max(2048),
      supportEmail: Joi.string().email().max(255),
      supportPhone: Joi.string().pattern(/^\+?[1-9]\d{7,14}$/),
    }).min(1),
  },
  addBankAccount: { body: Joi.object(bankAccountFields) },
  addWarehouse: { body: Joi.object(addressFields) },
  submitKycDocument: {
    body: Joi.object({
      docType: Joi.string().valid('gst_certificate', 'pan_card', 'aadhaar', 'bank_proof', 'address_proof', 'other').required(),
      fileUrl: Joi.string().uri().max(2048).required(),
    }),
  },

  adminList: {
    query: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      status: Joi.string().pattern(/^(pending|under_review|approved|rejected|suspended)(,(pending|under_review|approved|rejected|suspended))*$/),
      q: Joi.string().max(120),
    }),
  },
  idParam: { params: Joi.object({ id: Joi.string().uuid().required() }) },
  docIdParam: { params: Joi.object({ docId: Joi.string().uuid().required() }) },
  reject: {
    params: Joi.object({ id: Joi.string().uuid().required() }),
    body: Joi.object({ reason: Joi.string().min(5).max(1000).required() }),
  },
  reviewKycDocument: {
    params: Joi.object({ docId: Joi.string().uuid().required() }),
    body: Joi.object({
      status: Joi.string().valid('approved', 'rejected').required(),
      rejectionReason: Joi.string().max(1000).when('status', { is: 'rejected', then: Joi.required() }),
    }),
  },
  bankAccountIdParam: { params: Joi.object({ bankAccountId: Joi.string().uuid().required() }) },
};
