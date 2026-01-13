const express = require("express");
const mysql = require("mysql2/promise");
const bodyParser = require("body-parser");
const crypto = require("crypto"); // Used to generate random string
require("dotenv").config();

const app = express();

// --- 1. CONFIGURATION ---
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
};

const pool = mysql.createPool(dbConfig);

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- 2. ROUTES ---

// HOME: View Invitation
app.get("/", async (req, res) => {
  let guestName = "Pengunjung"; // Default fallback

  // LOGIC CHANGED: Select directly by HASH
  if (req.query.to) {
    const hash = req.query.to;

    try {
      // Find guest where link_hash matches the URL parameter
      const [rows] = await pool.query(
        "SELECT name FROM guests WHERE link_hash = ?",
        [hash]
      );

      if (rows.length > 0) {
        guestName = rows[0].name;
      }
    } catch (err) {
      console.error("DB Error:", err);
    }
  }

  // Retrieve Wishes
  let wishes = [];
  try {
    const [rows] = await pool.query(
      "SELECT * FROM wishes ORDER BY created_at DESC"
    );
    wishes = rows;
  } catch (err) {
    console.error("Wish retrieval error:", err);
  }

  res.render("index", {
    guestName: guestName,
    wishes: wishes,
  });
});

// API: Submit Wish
app.post("/api/wish", async (req, res) => {
  const { senderName, attendance, content } = req.body;

  if (!senderName || !content) {
    return res.status(400).json({ success: false, message: "Data incomplete" });
  }

  try {
    const sql =
      "INSERT INTO wishes (sender_name, attendance, content) VALUES (?, ?, ?)";
    await pool.query(sql, [senderName, attendance, content]);
    res.json({ success: true, message: "Wish saved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Database error" });
  }
});

// ADMIN TOOL: Generate Guest Link
// Usage: http://localhost:3000/create-guest?name=Budi
app.get("/create-guest", async (req, res) => {
  const name = req.query.name;
  if (!name) return res.send("Please add ?name=Name to URL");

  try {
    // check apakah sudah ada guest dengan name tersebut
    const [rows] = await pool.query("SELECT * FROM guests WHERE name = ?", [
      name,
    ]);
    if (rows.length > 0) {
      // send data
      return res.send(`
            <h3>Guest Already Exists</h3>
            <p>Name: ${name}</p>
            <p>Hash: ${rows[0].link_hash}</p>
            <p>Link: <a href="https://${req.get("host")}/myWedding/?to=${
        rows[0].link_hash
      }">https://${req.get("host")}/myWedding/?to=${rows[0].link_hash}</a></p>
        `);
    }
    // 1. Generate hash
    const linkHash = crypto.randomBytes(5).toString("hex");

    // We create the link just to show it to the admin, but we don't save it to DB
    const fullLink = `https://${req.get("host")}/myWedding/?to=${linkHash}`;

    // 2. Store ONLY Name and Hash in Database
    await pool.query("INSERT INTO guests (name, link_hash) VALUES (?, ?)", [
      name,
      linkHash,
    ]);

    res.send(`
            <h3>Guest Created</h3>
            <p>Name: ${name}</p>
            <p>Hash: ${linkHash}</p>
            <p>Link: <a href="${fullLink}">${fullLink}</a></p>
        `);
  } catch (err) {
    console.log(err.stack);
    res.status(500).send("Error (Duplicate hash or DB error): " + err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
