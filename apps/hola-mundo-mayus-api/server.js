import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse JSON bodies
app.use(express.json());

// Serve static frontend
app.use(express.static(path.join(__dirname, "public")));

// API: uppercase
app.post("/api/uppercase", (req, res) => {
  const text = (req.body?.text ?? "").toString();
  const upper = text.trim().toUpperCase();
  res.json({ upper });
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});