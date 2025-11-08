const mongoose = require("mongoose");

const RunHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  language: String,
  code: String,
  output: String,
  time: { type: Date, default: Date.now },
});

module.exports = mongoose.model("RunHistory", RunHistorySchema);
