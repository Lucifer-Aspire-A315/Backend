// src/controllers/bankAdminController.js
const bankService = require('../services/bankService');

exports.create = async (req, res, next) => {
  try {
    const { name, loanTypeIds } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Bank name is required' });
    }
    const bank = await bankService.createBank({ name, loanTypeIds });
    res.status(201).json({ success: true, data: bank });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, loanTypeIds } = req.body;
    const bank = await bankService.updateBank(id, { name, loanTypeIds });
    res.status(200).json({ success: true, data: bank });
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    await bankService.deleteBank(id);
    res.status(200).json({ success: true, message: 'Bank deleted' });
  } catch (err) {
    next(err);
  }
};
