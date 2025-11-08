const express = require("express");
const router = express.Router();
const axios = require("axios");
const multer = require("multer");
const FormData = require("form-data");
const { protect } = require("../middleware/auth");

const upload = multer(); // for parsing multipart/form-data

const OpenAI = require("openai");
// Initialize OpenAI (CommonJS compatible)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// -----------------------
// Ask chatbot (RAG + GPT for coding)
// -----------------------
router.post("/ask", protect, async (req, res) => {
  const { question } = req.body;

  try {
    // Step 1: Retrieve relevant docs/snippets from RAG
    const ragResponse = await axios.post(
      "http://localhost:8000/api/rag/retrieve",
      { question, userId: req.user._id },
      { headers: { Authorization: req.headers.authorization } }
    );

    const context = ragResponse.data.text || "";

    // Step 2: Ask GPT with coding-focused system prompt
    const gptResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `
You are an expert programming assistant.
Always respond in JSON format: 
{
  "code": "<insert code here>",
  "explanation": "<brief explanation here>"
}
Detect the programming language from the user's question and provide runnable code first, followed by a short explanation.
Do not include extra text outside the JSON.
Only provide coding-relevant answers.
          `,
        },
        {
          role: "user",
          content: `Context: ${context}\nQuestion: ${question}`,
        },
      ],
    });

    // Parse GPT JSON response
    let answer = {};
    try {
      answer = JSON.parse(gptResponse.choices[0].message.content);
    } catch (err) {
      console.warn("GPT response not valid JSON, sending raw text.");
      answer = { code: gptResponse.choices[0].message.content, explanation: "" };
    }

    res.json({ answer, retrievedDocs: context });

  } catch (err) {
    console.error("Error in RAG+GPT:", err.message);
    res.status(500).json({ error: "Error generating coding answer from RAG+AI" });
  }
});

// -----------------------
// Upload document to RAG
// -----------------------
router.post("/uploadDoc", protect, upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "File missing" });

    const formData = new FormData();
    formData.append("file", file.buffer, file.originalname);

    const response = await axios.post(
      "http://localhost:8000/api/rag/uploadDocument",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: req.headers.authorization,
        },
      }
    );

    res.json(response.data);
  } catch (err) {
    console.error("Error uploading document:", err.message);
    res.status(500).json({ message: "Error uploading document", error: err.message });
  }
});

// -----------------------
// Add code snippet to RAG
// -----------------------
router.post("/addSnippet", protect, async (req, res) => {
  const { snippetId, code } = req.body;
  try {
    const response = await axios.post(
      "http://localhost:8000/api/rag/uploadDocument",
      { file: code, name: `snippet-${snippetId}.txt` },
      { headers: { Authorization: req.headers.authorization } }
    );
    res.json({ message: "Snippet added to RAG", data: response.data });
  } catch (err) {
    console.error("Error adding snippet to RAG:", err.message);
    res.status(500).json({ error: "Failed to add snippet to RAG" });
  }
});

module.exports = router;
