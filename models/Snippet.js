// models/Snippet.js
const mongoose = require("mongoose");

const snippetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  language: { type: String, required: true },
  code: { type: String, required: true },
  pinned: { type: Boolean, default: false }, // NEW
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Snippet", snippetSchema);
