const { BasisTheory } = require("@basis-theory/basis-theory-js");
const { createClient } = require("@supabase/supabase-js");
const { getDatabaseStringFromUUID } = require("../../../utils/database");
const { createPool, getPool } = require("../../../utils/pool");  // Make sure this supports MySQL
const { getAuth } = require("@clerk/fastify");
const { Logtail } = require("@logtail/node");

const logtail = new Logtail(process.env.LOGTAIL_SOURCE_TOKEN);

const handler = async (request, reply) => {
    try {
        const { database_uuid, table_name, pageNumber, where_clause, order_by } = request.body;
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

        const { data, error } = await getDatabaseStringFromUUID(supabase, database_uuid);

        if (error) {
            console.error("Error fetching database string:", error);
            reply.status(400).send({ error: error.message });
            return;
        }

        const { database_string } = data;
        const offset = (pageNumber - 1) * 500;

        const bt = await new BasisTheory().init(process.env.PRIVATE_BASIS_THEORY_KEY);
        const connectionStringObject = await bt.tokens.retrieve(database_string);

        const connection_string = "mysql://" + connectionStringObject.data;

        await createPool("mysql", connection_string);
        const pool = getPool("mysql", connection_string);

        let query = `SELECT * FROM ${table_name}`;
        let params = [];

        if (where_clause) {
            query += ` WHERE ${where_clause.statement}`;
            params = [...params, ...where_clause.values];
        }

        if (order_by) {
            query += ` ORDER BY ${order_by}`;
        }

        query += ` LIMIT ?`;
        params.push(500);

        if (offset) {
            query += ` OFFSET ?`;
            params.push(offset);
        }

        const [rows] = await pool.query(query, params);
        reply.status(200).send(rows);
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
