const axios = require('axios');

function createPrompt(createStatements, userQuestion, errorMessage = null, errorSql = null) {
    let prompt = `
    ### Instructions:
    Your task is convert a question into a SQL query, given a Postgres table.
    Adhere to these rules:
    - **Deliberately go through the question and database table word by word** to appropriately answer the question
    - **Use Table Aliases** to prevent ambiguity. For example, \`SELECT table1.col1, table2.col1 FROM table1 JOIN table2 ON table1.id = table2.id\`.
    - When creating a ratio, always cast the numerator as float

    ### Input:
    Generate a SQL query that answers the question \`${userQuestion}\`.
    Only use aggregations / count when user specifies.
    This query will run on a database whose table is represented in this string:
    Do not reference a different table name than the table below.
    
    ${createStatements}
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
    const url = process.env.SQLCODER_ENDPOINT + '/v1/completions';
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
const opt = {
    database: 'postgresql'
}

// Returns an object with 'valid' (boolean) and 'type' (string) properties
const allowedQueryTypes = ['select', 'desc', 'show', 'explain'];

const validateQuery = (query) => {
    try {
        let ast = parser.astify(query, opt);

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
