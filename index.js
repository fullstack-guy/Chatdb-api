require("dotenv").config();

const fastify = require("fastify")({ logger: true });
const cors = require("@fastify/cors");
const { clerkPlugin, getAuth } = require("@clerk/fastify");

fastify.register(cors, {
  origin: "*",
});

/**
 * Register the Clerk plugin globally.
 * By default, Clerk will initialise using the API keys from the environment if found.
 *
 * If you prefer to pass the keys to the plugin explicitly, see `src/using-runtime-keys.ts`
 * If you prefer to register the plugin for specific routes only, see `src/authenticating-specific-routes.ts`
 */
fastify.register(clerkPlugin);

// Custom middleware to check Clerk user authentication
// We need to make sure that the Next.js app is sending the right headers from Clerk
fastify.addHook("preHandler", async (request, reply) => {
  console.log(request);
  // const { userId } = getAuth(request);
  // if (!userId) {
  //     return reply.code(403).send("Unauthorized");
  // }
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

fastify.post("/api/db/preview", require("./api/db/preview"));
fastify.post("/api/db/query", require("./api/db/query"));

const port = 8000;

const start = async () => {
  try {
    await fastify.listen({ port: port });
    fastify.log.info(`Server running on http://localhost:${port}/`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
