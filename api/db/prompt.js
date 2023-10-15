const axios = require('axios');

function createPrompt(createStatements, userQuestion, errorMessage = null, errorSql = null) {
    let prompt = `
    ### Instructions:
    Your task is convert a question into a SQL query, given a Postgres database schema.
    Adhere to these rules:
    - **Deliberately go through the question and database schema word by word** to appropriately answer the question
    - **Use Table Aliases** to prevent ambiguity. For example, \`SELECT table1.col1, table2.col1 FROM table1 JOIN table2 ON table1.id = table2.id\`.
    - When creating a ratio, always cast the numerator as float

    ### Input:
    Generate a SQL query that answers the question \`${userQuestion}\`.
    This query will run on a database whose schema is represented in this string:
    
    ${createStatements}

    3 rows from ask_queries table:
    id	created_at	database_uuid	user_id	total_tokens	completion_tokens	prompt_tokens	total_cost
    444	2023-10-11 03:56:06.164179+00:00	521b45f6-5023-41e9-8c7c-c6a11f22ff87	user_2VuxTf8LmL70BXy57zPNcOnH6w2	2830	261	2569	0.09273
    219	2023-09-28 21:52:49.951524+00:00	db48d452-7764-4047-9e36-b10c258bb248	user_2W2k2lvkmDA8THafExuX1kKwmNC	3358	201	3157	0.10677
    245	2023-10-02 00:58:40.596654+00:00	df37e2d2-6493-440b-a576-edeef39abac9	user_2W2k2lvkmDA8THafExuX1kKwmNC	2818	162	2656	0.0894
    `;

    // Optionally append the error message and problematic SQL query
    if (errorMessage && errorSql) {
        prompt += `
        
        ${errorSql}

        --- 
        the SQL above gave this error: ${errorMessage}.
        Please fix it.

        `;
    }

    prompt += `
    ### Response:
    Based on your instructions, here is the SQL query I have generated to answer the question \`${userQuestion}\`:
    \`\`\`sql
    `;

    return prompt;
}

async function generateSqlQuery(prompt) {
    console.log(prompt)
    const url = 'https://vp1swhd6jj0og0-9100.proxy.runpod.net/v1/completions';
    const headers = {
        'Content-Type': 'application/json'
    };

    const payload = {
        model: 'defog/sqlcoder-7b',
        prompt: prompt,
        temperature: 0,
        max_tokens: 3000,
        stop: '```'
    };

    try {
        const response = await axios.post(url, payload, { headers: headers });
        const sqlQuery = response.data.choices[0].text.trim();

        function removeNullsLast(sqlQuery) {
            return sqlQuery.replace(/NULLS LAST/g, '');
        }
        return removeNullsLast(sqlQuery);
    } catch (error) {
        console.error('Error:', error);
        throw error;  // Propagate the error to the caller
    }
}

const { Parser } = require("node-sql-parser");

const parser = new Parser();

// Returns an object with 'valid' (boolean) and 'type' (string) properties
const allowedQueryTypes = ['select', 'desc', 'show', 'explain'];

const validateQuery = (query) => {
    try {
        let ast = parser.astify(query);

        // Check if ast is an array but only has one element
        if (Array.isArray(ast)) {
            if (ast.length > 1) {
                return { valid: false, error: "Multiple queries are not allowed" };
            }
            // Extract the first (and only) element if it's a single-element array
            ast = ast[0];
        }
        // Check if the type of the query is allowed
        if (!allowedQueryTypes.includes(ast.type.toLowerCase())) {
            return { valid: false, error: "Only SELECT, DESCRIBE, SHOW, and EXPLAIN queries are allowed" };
        }


        return { valid: true, type: ast.type.toLowerCase() };
    } catch (e) {
        return { valid: false, error: e.message };
    }
}

module.exports = { createPrompt, generateSqlQuery, validateQuery };
