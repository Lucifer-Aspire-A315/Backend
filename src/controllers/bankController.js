// src/controllers/bankController.js
const bankService = require('../services/bankService');

exports.getBanks = async (req, res, next) => {
  try {
    const { loanTypeId } = req.query;
    const banks = await bankService.getBanks({ loanTypeId });
    res.json(banks);
  } catch (err) {
    next(err);
  }
};

exports.getLoanTypes = async (req, res, next) => {
  try {
    const { bankId } = req.query;
    const loanTypes = await bankService.getLoanTypes({ bankId });
    res.json(loanTypes);
  } catch (err) {
    next(err);
  }
};
