const { Pool: PgPool } = require("pg");
const mysql = require("mysql2/promise");
const { Logtail } = require("@logtail/node");

const logtail = new Logtail(process.env.LOGTAIL_SOURCE_TOKEN);

const pools = {};

const createPgPool = (connectionString) => {
  const pool = new PgPool({
    max: 20,
    idleTimeoutMillis: 30000,
    connectionString: connectionString,
    connectionTimeoutMillis: 5000,
  });

  pool.on("connect", async (client) => {
    await client.query("SET statement_timeout TO 10000");
  });

  pool.on("error", (err, client) => {
    logtail.error(err);
    console.error("Unexpected error on idle client", err);
  });

  return pool;
};

const createMysqlPool = (connectionString) => {
  const pool = mysql.createPool({
    uri: connectionString,
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
    connectTimeout: 5000,
  });

  const originalQuery = pool.query.bind(pool);

  pool.query = (sql, values) => {
    return originalQuery(sql, values, { timeout: 10000 });  // 10 seconds timeout
  };

  return pool;
};

const createPool = async (type, connectionString) => {
  // Hash or encode your connection string to create a unique key
  // Note: You should use a proper hashing or encoding method here
  const uniqueKey = `${type}:${Buffer.from(connectionString).toString('base64')}`;

  if (!pools[uniqueKey]) {
    try {
      if (type === "postgres") {
        pools[uniqueKey] = createPgPool(connectionString);
      } else if (type === "mysql") {
        pools[uniqueKey] = createMysqlPool(connectionString);
      } else {
        throw new Error("Invalid database type");
      }
    } catch (err) {
      logtail.error("Error creating pool", { errorMessage: err.message });
      throw err;
    }
  }

  return pools[uniqueKey];
};

const getPool = (type, connectionString) => {
  const uniqueKey = `${type}:${Buffer.from(connectionString).toString('base64')}`;
  if (!pools[uniqueKey]) {
    throw new Error(`Pool for ${uniqueKey} has not been created yet.`);
  }
  return pools[uniqueKey];
};

module.exports = { createPool, getPool };
