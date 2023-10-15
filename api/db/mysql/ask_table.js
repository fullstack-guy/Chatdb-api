const { BasisTheory } = require("@basis-theory/basis-theory-js");
const { createClient } = require("@supabase/supabase-js");
const { getDatabaseStringFromUUID } = require("../../../utils/database");
const { createPool, getPool } = require("../../../utils/pool");
const { getAuth } = require("@clerk/fastify");
const { Logtail } = require("@logtail/node");
const { createPrompt, generateSqlQuery, validateQuery } = require("../prompt")

const logtail = new Logtail(process.env.LOGTAIL_SOURCE_TOKEN);

const handler = async (request, reply) => {
    try {
        const { database_uuid, table_name, question } = request.body;
        const [tableSchema, tableName] = table_name.split('.');
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

        const { data, error } = await getDatabaseStringFromUUID(supabase, database_uuid);

        if (error) {
            reply.status(400).send({ error: error.message });
            return;
        }

        const { database_string } = data;

        const bt = await new BasisTheory().init(process.env.PRIVATE_BASIS_THEORY_KEY);
        const connectionStringObject = await bt.tokens.retrieve(database_string);
        const decryptedDatabaseString = "mysql://" + connectionStringObject.data;

        await createPool("mysql", decryptedDatabaseString);
        const pool = getPool("mysql", decryptedDatabaseString);

        // Query to get CREATE TABLE statement
        const queryString = tableSchema
            ? `SHOW CREATE TABLE \`${tableSchema}\`.\`${tableName}\``  // If schema is provided
            : `SHOW CREATE TABLE \`${tableName}\``;  // If only table name is provided

        const [showCreate] = await pool.query(queryString);

        const createTableStatement = showCreate[0]['Create Table'];
        const prompt = createPrompt([createTableStatement], question);

        const sql = await generateSqlQuery(prompt);

        if (validateQuery(sql).valid) {
            await createPool("postgres", connection_string);
            const pool = getPool("postgres", connection_string);

            const [result] = await pool.query(query);
            reply.status(200).send({ result })
        } else {
            console.log
            reply.status(400).send({ "error": "Sorry, that query wasn't valid!" })
        }

        reply.status(200).send({ createTableStatement });
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
