require("dotenv").config();

const fastify = require("fastify")({ logger: true });
const cors = require("@fastify/cors");
const { Logtail } = require("@logtail/node");
const { clerkPlugin, getAuth } = require("@clerk/fastify");
const { rateLimitMiddleware } = require('./utils/ratelimiter');

const logtail = new Logtail(process.env.LOGTAIL_SOURCE_TOKEN);

// Register plugins
fastify.register(cors, { origin: "*" });
fastify.register(clerkPlugin);

// Custom middleware to check Clerk user authentication
// We need to make sure that the Next.js app is sending the right headers from Clerk
fastify.addHook("preHandler", async (request, reply) => {
  const { userId } = getAuth(request);

  // Initialize an empty payload
  let payload = {};

  // Add payload to log object only if the endpoint is not '/api/db/connect'
  if (request.raw.url !== '/api/db/connect') {
    payload = request.body;
  }

  const logObject = {
    userId: userId || "Unknown",
    endpoint: request.raw.url,
    method: request.raw.method,
    payload, // This will either be the payload or an empty object
    timestamp: new Date().toISOString(),
  };

  logtail.info(logObject);
  fastify.log.info(logObject);

  request.userId = userId; // add user id on request object
  if (!userId) {
    return reply.code(403).send("Unauthorized");
  }
});

fastify.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  async (request, body) => {
    try {
      return JSON.parse(body);
    } catch (err) {
      request.log.error(err);
      throw new Error("Invalid JSON");
    }
  }
);

// Postgres Routes with rate-limiting
fastify.post("/api/db/postgres/preview", {
  preHandler: rateLimitMiddleware(30, 60)  // 30 request per minute
}, require("./api/db/postgres/preview"));

fastify.post("/api/db/postgres/ask_table", {
  preHandler: rateLimitMiddleware(12, 60)  // 12 request per minute
}, require("./api/db/postgres/ask_table"));

fastify.post("/api/db/postgres/query", {
  preHandler: rateLimitMiddleware(30, 60)  // 30 requests per minute
}, require("./api/db/postgres/query"));

fastify.post("/api/db/postgres/connect", {
  preHandler: rateLimitMiddleware(30, 60)  // 30 requests per minute
}, require("./api/db/postgres/connect"));

const port = process.env.PORT || 8000;
const host = "RENDER" in process.env ? `0.0.0.0` : `localhost`;

const start = async () => {
  try {
    await fastify.listen({ host: host, port: port });
    fastify.log.info(`Server running on http://localhost:${port}/`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Ensure that all logs are sent to Logtail before exiting the process
process.on("beforeExit", async () => {
  await logtail.flush();
});

start();
