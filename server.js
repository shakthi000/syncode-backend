const express = require("express");
const http = require("http");
const cors = require("cors");
const axios = require("axios");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const path = require("path");
require("dotenv").config();

const User = require("./models/User");
const Snippet = require("./models/Snippet");
const chatbotRoutes = require("./routes/chatbot");

const app = express();
const server = http.createServer(app);


// ==========================
// 🔑 Middleware
// ==========================
const allowedOrigins = [
  "http://localhost:3000",
  "https://syncode-frontend-ga97.vercel.app"
];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true); // allow Postman or server-to-server
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(new Error(`CORS policy blocked this origin: ${origin}`), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

// Allow preflight OPTIONS requests for POST/PUT
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(new Error(`CORS blocked: ${origin}`), false);
    }
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json());

// JWT Authentication
const protect = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Not authorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");
    if (!req.user) return res.status(401).json({ message: "User not found" });
    next();
  } catch (err) {
    res.status(401).json({ message: "Token invalid", error: err.message });
  }
};

// Role-based access
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ message: "Forbidden: Insufficient permissions" });
  next();
};

// ==========================
// 🧠 MongoDB connection
// ==========================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("MongoDB error:", err));

// ==========================
// 🔗 Piston API Helper
// ==========================
const getLatestVersion = async (language) => {
  try {
    const res = await axios.get("https://emkc.org/api/v2/piston/runtimes");
    const runtime = res.data.find(r => r.language === language || r.aliases?.includes(language));
    if (!runtime) throw new Error(`No runtime found for language: ${language}`);
    return runtime.version;
  } catch (err) {
    console.error("Error fetching runtime version:", err.message);
    return null;
  }
};

// ==========================
// 🔐 Auth Routes
// ==========================
app.post("/signup", async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    if (await User.findOne({ email })) return res.status(400).json({ message: "User already exists" });

    const newUser = new User({ username, email, password, role: role || "user" });
    await newUser.save();
    res.status(201).json({ message: "Signup successful! Please login." });
  } catch (err) {
    res.status(500).json({ message: "Error creating account", error: err.message });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !(await user.comparePassword(password))) return res.status(400).json({ message: "Invalid credentials" });

  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1d" });
  res.json({ token, username: user.username, userId: user._id, role: user.role });
});

app.post("/refresh-token", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(401).json({ message: "Token missing" });

  try {
    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ message: "User not found" });

    const newAccessToken = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "15m" });
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    res.status(401).json({ message: "Invalid refresh token" });
  }
});

// ==========================
// 📝 Snippet Routes
// ==========================
// routes/snippets.js or in server.js
app.post("/save", protect, async (req, res) => {
  const { language, code } = req.body;
  if (!code || !language) return res.status(400).json({ message: "Code and language are required" });

  try {
    const snippet = new Snippet({ userId: req.user._id, language, code });
    await snippet.save();
    console.log("Snippet saved:", snippet._id);

    res.status(201).json({ message: "Saved successfully", _id: snippet._id, snippet });
  } catch (err) {
    console.error("Error saving snippet:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/snippets", protect, authorize("admin"), async (req, res) => {
  const snippets = await Snippet.find().sort({ createdAt: -1 });
  res.json(snippets);
});

app.get("/snippets/:userId", protect, async (req, res) => {
  if (req.user._id.toString() !== req.params.userId && req.user.role !== "admin") return res.status(403).json({ message: "Forbidden" });
  const snippets = await Snippet.find({ userId: req.params.userId }).sort({ createdAt: -1 });
  res.json(snippets);
});

app.put("/snippets/:id", protect, async (req, res) => {
  const snippet = await Snippet.findById(req.params.id);
  if (!snippet) return res.status(404).json({ message: "Snippet not found" });
  if (snippet.userId.toString() !== req.user._id.toString() && req.user.role !== "admin") return res.status(403).json({ message: "Forbidden" });

  const { code, language } = req.body;
  snippet.code = code || snippet.code;
  snippet.language = language || snippet.language;
  await snippet.save();

  res.json({ message: "Snippet updated successfully", snippet });
});

app.delete("/snippets/:id", protect, async (req, res) => {
  const snippet = await Snippet.findById(req.params.id);
  if (!snippet) return res.status(404).json({ message: "Snippet not found" });
  if (snippet.userId.toString() !== req.user._id.toString() && req.user.role !== "admin") return res.status(403).json({ message: "Forbidden" });

  await snippet.deleteOne();
  res.json({ message: "Snippet deleted successfully!" });
});

// Update profile
app.put("/me", protect, async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: "User not found" });

  const { username, newPassword, currentPassword } = req.body;
  if (username) user.username = username;

  if (newPassword) {
    if (!currentPassword) return res.status(400).json({ message: "Current password required" });
    if (!(await user.comparePassword(currentPassword))) return res.status(400).json({ message: "Current password incorrect" });
    user.password = newPassword;
  }

  await user.save();
  res.json({ message: "Profile updated successfully!" });
});

// ==========================
// 💬 Chatbot & Real-time Collaboration
// ==========================
app.use("/chatbot", chatbotRoutes);

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
  socket.on("code-change", (data) => socket.broadcast.emit("receive-code", data));
  socket.on("disconnect", () => console.log("User disconnected:", socket.id));
});

// ==========================
// ▶️ Code Execution
// ==========================
app.post("/run", async (req, res) => {
  const { language, code } = req.body;
  if (!code || !code.trim()) return res.status(400).json({ message: "Code cannot be empty" });

  try {
    const version = await getLatestVersion(language);
    if (!version) return res.status(500).json({ error: "Could not find valid runtime version" });

    const response = await axios.post("https://emkc.org/api/v2/piston/execute", { language, version, files: [{ content: code }] });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ==========================
// 🏗️ Serve React frontend (catch-all)
// ==========================
// Serve React build for all non-API routes
const buildPath = path.join(__dirname, "build");
app.use(express.static(buildPath));

// Only send index.html for routes not starting with /api or /chatbot
app.get(/^(?!\/(api|chatbot)).*$/, (req, res) => {
  res.sendFile(path.join(buildPath, "index.html"));
});


// ==========================
// 🚀 Start server
// ==========================
server.listen(5000, () => console.log("🚀 Server running on port 5000"));