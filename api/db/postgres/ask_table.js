const { BasisTheory } = require("@basis-theory/basis-theory-js");
const { createClient } = require("@supabase/supabase-js");
const { getDatabaseStringFromUUID } = require("../../../utils/database");
const { createPool, getPool } = require("../../../utils/pool");
const { getAuth } = require("@clerk/fastify");
const { Logtail } = require("@logtail/node");
const { createPrompt, generateSqlQuery, validateQuery } = require("../prompt");

const logtail = new Logtail(process.env.LOGTAIL_SOURCE_TOKEN);

const getCreateTableStatement = async (pool, fullTableName) => {
  const [tableSchema, tableName] = fullTableName.split(".");

  const query = `
    SELECT column_name, data_type, character_maximum_length
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE table_schema = $1 AND table_name = $2
  `;

  console.log(
    `Executing query: ${query} with parameters: schema=${tableSchema}, table=${tableName}`
  ); // Debugging line

  const { rows } = await pool.query(query, [tableSchema, tableName]);

  if (rows.length === 0) {
    return "No columns found for the given table name";
  }

  const columnDefinitions = rows
    .map((row) => {
      let columnDefinition = `${
        row.column_name
      } ${row.data_type.toUpperCase()}`;
      if (row.character_maximum_length) {
        columnDefinition += `(${row.character_maximum_length})`;
      }
      return columnDefinition;
    })
    .join(",\n\t");

  return `CREATE TABLE ${fullTableName} (\n\t${columnDefinitions}\n);`;
};

const handler = async (request, reply) => {
  try {
    const { database_uuid, table_name, question } = request.body;

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

    if (!database_uuid || !table_name) {
      reply.status(400).send({
        status: "error",
        message: "Missing database uuid or table name",
      });
      return;
    }

    const { data, error } = await getDatabaseStringFromUUID(
      supabase,
      database_uuid
    );

    if (error) {
      reply.status(400).send({ error: error.message });
      return;
    }

    const { database_string } = data;

    const bt = await new BasisTheory().init(
      process.env.PRIVATE_BASIS_THEORY_KEY
    );
    const connectionStringObject = await bt.tokens.retrieve(database_string);
    const decryptedDatabaseString = "postgres://" + connectionStringObject.data;

    await createPool("postgres", decryptedDatabaseString);
    const pool = getPool("postgres", decryptedDatabaseString);

    const createTableStatement = await getCreateTableStatement(
      pool,
      table_name
    );

    const prompt = createPrompt([createTableStatement], question);
    const sql = await generateSqlQuery(prompt);
    console.log(sql);

    if (validateQuery(sql).valid) {
      try {
        let result = await pool.query(sql);
        console.log("Query Result:", result); // Debugging line

        // Get the column names from the first row in the result
        let columns = Object.keys(result.rows[0]);

        // Generate an array of arrays, where each inner array represents a row
        let rows = result.rows.map((row) =>
          columns.map((column) => row[column])
        );

        // Construct the response
        return reply.status(200).send({
          sql: sql,
          data: {
            columns,
            rows,
          },
        });
      } catch (err) {
        // Use the new createPrompt function to append the error message and problematic SQL query
        const appendedPrompt = createPrompt(
          [createTableStatement],
          question,
          err.message,
          sql
        );

        // Regenerate the SQL query with the new appendedPrompt
        const fixedSQL = await generateSqlQuery(appendedPrompt);
        console.log("Fixed SQL:", fixedSQL);

        // Validate and attempt the query again (you might want to limit retries)
        if (validateQuery(fixedSQL).valid) {
          try {
            result = await pool.query(fixedSQL);

            // Get the column names from the first row in the result
            columns = Object.keys(result.rows[0]);

            // Generate an array of arrays, where each inner array represents a row
            rows = result.rows.map((row) =>
              columns.map((column) => row[column])
            );

            // Construct the response
            return reply.status(200).send({
              sql: fixedSQL,
              data: {
                columns,
                rows,
              },
            });
          } catch (secondErr) {
            reply
              .status(500)
              .send({
                error: `An unexpected error occurred: ${secondErr.message}`,
              });
          }
        } else {
          console.log("Invalid Query: ", fixedSQL);
          reply.status(400).send({ error: "Sorry, that query wasn't valid!" });
        }
      }
    } else {
      console.log(validateQuery(sql), sql);
      reply.status(400).send({ error: "Sorry, that query wasn't valid!" });
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

    reply.status(500).send({
      status: "error",
      message: `An unexpected error occurred: ${e.message}`,
    });
  }
};

module.exports = handler;
