const { Pool } = require("pg");
const { Logtail } = require("@logtail/node");

const logtail = new Logtail(process.env.LOGTAIL_SOURCE_TOKEN);

let pool;

const createPool = async (connectionString) => {
  if (!pool) {
    pool = new Pool({
      max: 20,
      idleTimeoutMillis: 30000,
      connectionString: connectionString,
      connectionTimeoutMillis: 5000, // terminate the connection after 15 seconds if not established
    });

    // Add error handling on the pool
    pool.on('error', (err, client) => {
      logtail.error(err)
      console.error('Unexpected error on idle client', err);
      // Optionally destroy and remove the client from the pool
      // process.exit(-1);
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
