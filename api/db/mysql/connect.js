const { BasisTheory } = require("@basis-theory/basis-theory-js");
const { createClient } = require("@supabase/supabase-js");
const { getDatabaseStringFromUUID } = require("../../../utils/database");
const { createPool } = require("../../../utils/pool");
const { getAuth } = require("@clerk/fastify");
const { Logtail } = require("@logtail/node");

const logtail = new Logtail(process.env.LOGTAIL_SOURCE_TOKEN);

function simplifyDataType(dataType) {
  const dataTypeMapping = {
    varchar: "text",
    datetime: "timestamp",
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
    connection_string = "mysql://" + connectionStringObject.data;
  }

  const pool = await createPool("mysql", connection_string);

  try {
    const connection = await pool.getConnection();

    const databaseInfo = {};
    const systemDatabases = [
      "information_schema",
      "mysql",
      "sys",
      "performance_schema",
    ];

    const [databases] = await connection.query("SHOW DATABASES");
    for (const { Database: dbName } of databases) {
      if (systemDatabases.includes(dbName)) {
        continue;
      }
      databaseInfo[dbName] = {};

      const [tables] = await connection.query("SHOW TABLES");
      for (const tableRow of tables) {
        const table = Object.values(tableRow)[0];
        databaseInfo[dbName][table] = {};

        const [columns] = await connection.query(`DESCRIBE ${table}`);
        for (const { Field, Type, Null } of columns) {
          databaseInfo[dbName][table][Field] = {
            type: simplifyDataType(Type),
            nullable: Null === "YES",
          };
        }
      }
    }

    connection.release();
    console.log(databaseInfo);
    reply.status(200).send(databaseInfo);
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
    console.error(e);
    reply.status(500).send(e);
  }
};

module.exports = handler;
