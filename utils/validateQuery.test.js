const { validateQuery } = require("../api/db/prompt");

describe("validateQuery", () => {
  test("should return valid for a single SELECT query", () => {
    const result = validateQuery("SELECT * FROM users;");
    expect(result).toEqual({ valid: true, type: "select" });
  });

  test("should return invalid for multiple queries", () => {
    const result = validateQuery("SELECT * FROM users; DROP TABLE users;");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Multiple queries are not allowed");
  });

  test("should return invalid for non-SELECT queries", () => {
    const result = validateQuery('UPDATE users SET name="John" WHERE id=1;');
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      "Only SELECT, DESCRIBE, SHOW, and EXPLAIN queries are allowed"
    );
  });

  test("should return invalid for malformed queries", () => {
    const result = validateQuery("SELECT FROM WHERE;");
    expect(result.valid).toBe(false);
    expect(typeof result.error).toBe("string");
  });

  test("should return invalid for empty queries", () => {
    const result = validateQuery("");
    expect(result.valid).toBe(false);
    expect(typeof result.error).toBe("string");
  });

  test("should return invalid for DELETE queries", () => {
    const result = validateQuery("DELETE FROM users WHERE id=1;");
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      "Only SELECT, DESCRIBE, SHOW, and EXPLAIN queries are allowed"
    );
  });

  test("should return invalid for INSERT queries", () => {
    const result = validateQuery(
      'INSERT INTO users (name, age) VALUES ("John", 30);'
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      "Only SELECT, DESCRIBE, SHOW, and EXPLAIN queries are allowed"
    );
  });

  test("should return invalid for CREATE TABLE queries", () => {
    const result = validateQuery(
      "CREATE TABLE new_users (id INT PRIMARY KEY, name TEXT);"
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      "Only SELECT, DESCRIBE, SHOW, and EXPLAIN queries are allowed"
    );
  });

  test("should return invalid for DROP TABLE queries", () => {
    const result = validateQuery("DROP TABLE users;");
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      "Only SELECT, DESCRIBE, SHOW, and EXPLAIN queries are allowed"
    );
  });

  test("should return invalid for ALTER TABLE queries", () => {
    const result = validateQuery("ALTER TABLE users ADD COLUMN email TEXT;");
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      "Only SELECT, DESCRIBE, SHOW, and EXPLAIN queries are allowed"
    );
  });

  test("should return invalid for DROP DATABASE queries", () => {
    const result = validateQuery("DROP DATABASE my_database;");
    expect(result.valid).toBe(false);
  });

  test("should return valid for SHOW queries", () => {
    const result = validateQuery("SHOW TABLES;");
    expect(result).toEqual({ valid: true, type: "show" });
  });

  test("should return valid for more complicated queries", () => {
    const result = validateQuery(
      "SELECT id, created_at, database_uuid, user_id, total_tokens, completion_tokens, prompt_tokens, total_cost, model FROM ask_queries ORDER BY created_at DESC LIMIT 10;"
    );
    expect(result).toEqual({ valid: true, type: "select" });
  });

  test("should return valid for more complicated query", () => {
    const result = validateQuery(
      "SELECT COUNT(*) AS total_queries FROM ask_queries WHERE created_at >= (CURRENT_DATE - interval '10 days');"
    );
    expect(result).toEqual({ valid: true, type: "select" });
  });

  test("should return valid for ILIKE query", () => {
    const result = validateQuery(
      "SELECT COUNT(*) FROM user_schemas WHERE title ILIKE '%SupaDB%';"
    );
    expect(result).toEqual({ valid: true, type: "select" });
  });
});
