// models/ChatLog.js
const mongoose = require("mongoose");

const chatLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  question: { type: String, required: true },
  answer: { type: String, required: true },
  snippetsReturned: [{ id: String, text: String }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("ChatLog", chatLogSchema);
