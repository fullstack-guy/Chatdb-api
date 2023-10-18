const { RateLimiterMemory } = require('rate-limiter-flexible');

const createRateLimiter = (points, duration) => new RateLimiterMemory({ points, duration });

const rateLimitMiddleware = (points, duration) => {
    const rateLimiter = createRateLimiter(points, duration);

    return async (request, reply, done) => {
        try {
            const rateLimiterRes = await rateLimiter.consume(request.userId, 1);
            const headers = {
                "Retry-After": rateLimiterRes.msBeforeNext / 1000,
                "X-RateLimit-Limit": points,
                "X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
                "X-RateLimit-Reset": new Date(Date.now() + rateLimiterRes.msBeforeNext)
            };
            done();
        } catch (rateLimiterRes) {
            const headers = {
                "Retry-After": rateLimiterRes.msBeforeNext / 1000,
                "X-RateLimit-Limit": points,
                "X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
                "X-RateLimit-Reset": new Date(Date.now() + rateLimiterRes.msBeforeNext)
            };

            const waitTimeInSeconds = Math.ceil(rateLimiterRes.msBeforeNext / 1000);

            return reply
                .headers(headers)
                .code(429)
                .send(`Too Many Requests. Please wait ${waitTimeInSeconds} seconds before sending another request.`);
        }
    };
};

module.exports = { rateLimitMiddleware };