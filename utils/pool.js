const { Pool } = require("pg");

let pool;

const createPool = async (connectionString) => {
  if (!pool) {
    pool = new Pool({
      max: 20,
      idleTimeoutMillis: 30000,
      connectionString: connectionString,
    });
  }
  return pool;
};

const getPool = () => {
  if (!pool) {
    throw new Error("Pool has not been created yet.");
  }
  return pool;
};

module.exports = { createPool, getPool };
