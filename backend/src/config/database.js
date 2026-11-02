const knex = require('knex');
const knexConfig = require('../../knexfile');
const config = require('./index');

const db = knex(knexConfig[config.env] || knexConfig.development);

module.exports = db;
