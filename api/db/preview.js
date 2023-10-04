const { BasisTheory } = require("@basis-theory/basis-theory-js");
const { createClient } = require("@supabase/supabase-js");
const { getDatabaseStringFromUUID } = require("../../utils/database");
const { createPool, getPool } = require("../../utils/pool");
const { getAuth } = require("@clerk/fastify");
const { extractBearerFromRequest } = require("../../utils/auth");

const handler = async (request, reply) => {
  try {
    const { database_uuid, table_name, pageNumber, where_clause, order_by } =
      request.body;
    const auth = getAuth(request);
    const token = await auth.getToken({ template: "supabase" });

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    if (!database_uuid) {
      reply.status(400).send({
        status: "error",
        message: "No database uuid provided",
      });
      return;
    }

    const { data, error } = await getDatabaseStringFromUUID(
      supabase,
      database_uuid
    );

    if (error) {
      console.error("Error fetching database string:", error);
      reply.status(400).send({ error: error.message });
      return;
    }

    const { database_string } = data;
    const offset = (pageNumber - 1) * 500;

    const bt = await new BasisTheory().init(
      process.env.PRIVATE_BASIS_THEORY_KEY
    );
    const connectionStringObject = await bt.tokens.retrieve(database_string);
    const connection_string = "postgres://" + connectionStringObject.data;

    await createPool(connection_string);
    const pool = getPool();
    const client = await pool.connect();

    let query = `SELECT * FROM ${table_name}`;
    let params = [];

    if (where_clause) {
      query += ` WHERE ${where_clause.statement}`;
      params = [...params, ...where_clause.values];
    }

    if (order_by) {
      query += ` ORDER BY ${order_by}`;
    }

    query += ` LIMIT $${params.length + 1}`;
    params.push(500);

    if (offset) {
      query += ` OFFSET $${params.length + 1}`;
      params.push(offset);
    }

    const { rows: tableData } = await client.query(query, params);

    client.release();
    reply.status(200).send(tableData);
  } catch (e) {
    console.error("Error:", e);
    reply.status(500).send({
      status: "error",
      message: `An unexpected error occurred: ${e.message}`,
    });
  }
};

module.exports = handler;
