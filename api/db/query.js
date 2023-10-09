const { BasisTheory } = require("@basis-theory/basis-theory-js");
const { getAuth } = require("@clerk/fastify");
const { createClient } = require("@supabase/supabase-js");
const { getDatabaseStringFromUUID } = require("../../utils/database");
const { createPool } = require("../../utils/pool");
const { Logtail } = require("@logtail/node");
const { Parser } = require("node-sql-parser");

const logtail = new Logtail(process.env.LOGTAIL_SOURCE_TOKEN);
const parser = new Parser();

const handler = async (request, reply) => {
  const { query, database_uuid } = request.body;

  if (!query || !database_uuid) {
    reply.status(400).send({ error: "No query or database uuid provided" });
    return;
  }

  // Parse the SQL query to AST
  const ast = parser.astify(query);

  // Check if AST is an array (multiple queries) or a single object
  if (Array.isArray(ast)) {
    res.status(400).json({ error: "Multiple queries are not allowed" });
    return;
  } else if (ast.type !== "select") {
    res.status(400).json({ error: "Only SELECT queries are allowed" });
    return;
  }

  const auth = getAuth(request);
  const token = await auth.getToken({ template: "supabase" });

  const supabase = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  try {
    const { data, error } = await getDatabaseStringFromUUID(
      supabase,
      database_uuid
    );

    if (error) {
      reply.status(400).send({ error: error.message });
      return;
    }

    const bt = await new BasisTheory().init(
      process.env.NEXT_PRIVATE_BASIS_THEORY_KEY
    );
    const connectionStringObject = await bt.tokens.retrieve(
      data.database_string
    );
    const connection_string = "postgres://" + connectionStringObject.data;

    const pool = await createPool(connection_string);

    const result = await pool.query(query);

    // Extracting columns and rows in the desired format
    const columns = result.fields.map((field) => field.name);
    const rows = result.rows.map((row) => columns.map((column) => row[column]));

    return reply.status(200).send({
      sql: query,
      data: {
        columns,
        rows,
      },
    });
  } catch (e) {
    // Log the error and additional context
    logtail.error("An unexpected error occurred in the handler.", {
      errorMessage: e.message,
      stack: e.stack,
      request: {
        method: request.raw.method,
        url: request.raw.url,
        payload: request.body,
      },
    });
    // Ensure logs are flushed before replying
    await logtail.flush();

    console.error("Error:", e);
    reply.status(500).send({
      status: "error",
      message: `An unexpected error occurred: ${e.message}`,
    });
  }
};

module.exports = handler;
