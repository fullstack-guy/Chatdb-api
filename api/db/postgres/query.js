const { BasisTheory } = require("@basis-theory/basis-theory-js");
const { getAuth } = require("@clerk/fastify");
const { createClient } = require("@supabase/supabase-js");
const { getDatabaseStringFromUUID } = require("../../../utils/database");
const { createPool } = require("../../../utils/pool");
const { Logtail } = require("@logtail/node");
const { validateQuery } = require("../prompt")

const logtail = new Logtail(process.env.LOGTAIL_SOURCE_TOKEN);

const handler = async (request, reply) => {
  const { query, database_uuid } = request.body;

  if (!query || !database_uuid) {
    reply.status(400).send({ error: "No query or database uuid provided" });
    return;
  }

  // Validate the SQL query using the validateQuery function
  const validationResult = validateQuery(query);

  if (!validationResult.valid) {
    reply.status(400).send({ error: validationResult.error });
    return;
  }

  const auth = getAuth(request);
  const token = await auth.getToken({ template: "supabase" });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  try {
    const { data, error } = await getDatabaseStringFromUUID(supabase, database_uuid);

    if (error) {
      reply.status(400).send({ error: error.message });
      return;
    }

    const bt = await new BasisTheory().init(process.env.PRIVATE_BASIS_THEORY_KEY);
    const connectionStringObject = await bt.tokens.retrieve(data.database_string);
    const connection_string = "postgresql://" + connectionStringObject.data;

    const pool = await createPool("postgres", connection_string);

    if (validateQuery(query).valid) {
      try {

        const result = await pool.query(query);
        console.log("Query Result:", result);

        // Get the column names from the first row in the result
        const columns = Object.keys(result.rows[0]);

        // Generate an array of arrays, where each inner array represents a row
        const rows = result.rows.map((row) => columns.map((column) => row[column]));

        // Construct the response
        return reply.status(200).send({
          sql: query,
          data: {
            columns,
            rows,
          },
        });
      } catch (err) {
        console.error(err)
        reply.status(400).send({ "error": "Sorry, that query wasn't valid!" });
      }
    } else {
      console.log(validateQuery(sql), sql)
      reply.status(400).send({ "error": "Sorry, that query wasn't valid!" });
    }


  } catch (e) {
    logtail.error("An unexpected error occurred in the handler.", {
      errorMessage: e.message,
      stack: e.stack,
      request: {
        method: request.raw.method,
        url: request.raw.url,
        payload: request.body,
      },
    });

    await logtail.flush();

    console.error("Error:", e);
    reply.status(500).send({
      status: "error",
      message: `An unexpected error occurred: ${e.message}`,
    });
  }
};

module.exports = handler;
