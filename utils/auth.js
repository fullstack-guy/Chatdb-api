function extractBearerFromRequest(request) {
  const authHeader = request.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    // Extract the token (remove "Bearer " from the beginning)
    const token = authHeader.slice(7);
    return token;
  }

  return null; // Return null if no valid Bearer token found
}

module.exports = { extractBearerFromRequest };
