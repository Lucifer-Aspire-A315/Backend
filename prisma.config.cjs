/* eslint-disable no-undef */
require('dotenv').config();

console.log('DATABASE_URL value:', process.env.DATABASE_URL);
console.log('DATABASE_URL type :', typeof process.env.DATABASE_URL);

module.exports = {
  datasource: {
    url: url(process.env.DATABASE_URL),
  },
};