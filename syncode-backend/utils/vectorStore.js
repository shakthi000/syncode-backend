// utils/vectorStore.js
const snippets = [];

// Add a snippet
function addSnippet(id, text) {
  snippets.push({ id, text });
}

// Query snippets: simple substring search
function querySnippet(query, k = 3) {
  const results = snippets
    .filter(s => s.text.toLowerCase().includes(query.toLowerCase()))
    .slice(0, k);
  return results;
}

module.exports = { addSnippet, querySnippet };
