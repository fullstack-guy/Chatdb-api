const { BasisTheory } = require("@basis-theory/basis-theory-js");
const { getDatabaseStringFromUUID } = require("../../utils/database");
const { createClient } = require("@supabase/supabase-js");
const { getAuth } = require("@clerk/fastify");
const { createPool } = require("../../utils/pool");
const { extractBearerFromRequest } = require("../../utils/auth");

function simplifyDataType(dataType) {
  // TODO: Strong typing dataType
  const dataTypeMapping = {
    "character varying": "text",
    "timestamp without time zone": "timestamp",
  };

  return dataTypeMapping[dataType] || dataType;
}

const handler = async (request, reply) => {
  let { connection_string, database_uuid } = request.body;

  if (database_uuid) {
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
    const { data, error } = await getDatabaseStringFromUUID(
      supabase,
      database_uuid
    );

    if (error) {
      console.error("Error fetching database string token:", error);
      reply.status(400).send({ error: error.message });
      return;
    }
    const bt = await new BasisTheory().init(
      process.env.PRIVATE_BASIS_THEORY_KEY
    );

    const connectionStringObject = await bt.tokens.retrieve(
      data.database_string
    );
    connection_string = "postgres://" + connectionStringObject.data;
  }

  const pool = await createPool(connection_string);

  try {
    const client = await pool.connect();

    const excludedSchemas = ["information_schema", "pg_catalog"];
    const { rows: schemaRows } = await client.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN (${excludedSchemas
        .map((_, i) => "$" + (i + 1))
        .join(",")});`,
      excludedSchemas
    );

    const databaseInfo = {};

    for (const schemaRow of schemaRows) {
      const schema = schemaRow.schema_name;
      databaseInfo[schema] = {};

      const { rows: tableRows } = await client.query(
        "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = $1;",
        [schema]
      );

      for (const tableRow of tableRows) {
        const table = tableRow.tablename;
        databaseInfo[schema][table] = {};

        const { rows: columnRows } = await client.query(
          `
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_name = $1 AND table_schema = $2;`,
          [table, schema]
        );

        for (const columnRow of columnRows) {
          databaseInfo[schema][table][columnRow.column_name] = {
            type: simplifyDataType(columnRow.data_type),
            nullable: columnRow.is_nullable === "YES",
          };
        }

        const { rows: foreignKeyRows } = await client.query(
          `
          SELECT 
            kcu.column_name, 
            ccu.table_schema AS foreign_table_schema,
            ccu.table_name AS foreign_table_name, 
            ccu.column_name AS foreign_column_name 
          FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1 AND tc.table_schema = $2
          `,
          [table, schema]
        );

        for (const foreignKeyRow of foreignKeyRows) {
          if (!databaseInfo[schema][table].foreignKeys) {
            databaseInfo[schema][table].foreignKeys = [];
          }
          databaseInfo[schema][table].foreignKeys.push({
            column: foreignKeyRow.column_name,
            foreignTableSchema: foreignKeyRow.foreign_table_schema,
            foreignTable: foreignKeyRow.foreign_table_name,
            foreignColumn: foreignKeyRow.foreign_column_name,
          });
        }
      }
    }

    client.release();
    reply.status(200).send(databaseInfo);
  } catch (e) {
    console.error(e);
    reply.status(500).send(e);
  }
};

module.exports = handler;
