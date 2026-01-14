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
  let guestName = "Pengunjung";
  let isHide = 0; // Default: Show gift section for general visitors

  if (req.query.to) {
    const hash = req.query.to;
    try {
      // Updated Query: Select name AND isHide
      const [rows] = await pool.query(
        "SELECT name, isHide FROM guests WHERE link_hash = ?",
        [hash]
      );

      if (rows.length > 0) {
        guestName = rows[0].name;
        isHide = rows[0].isHide; // Get the status from DB
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
    isHide: isHide, // Pass this variable to EJS
    wishes: wishes,
  });
});

// 2. ADMIN: GET FORM (Now includes AJAX Script)
app.get("/create-guest", (req, res) => {
  res.send(`
        <!DOCTYPE html>
        <html>
            <head>
                <title>Create Wedding Guest</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: 'Segoe UI', sans-serif; padding: 40px; max-width: 600px; margin: auto; background: #f5f0ed; }
                    .container { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
                    input[type="text"] { width: 100%; padding: 10px; margin-top: 5px; border: 1px solid #ddd; border-radius: 5px; }
                    button { padding: 12px 25px; background: #5d4037; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; margin-top: 15px; }
                    button:hover { background: #4e342e; }
                    
                    /* Result Box Styling */
                    #resultArea { margin-top: 25px; padding: 15px; border-radius: 8px; display: none; }
                    .success { background: #e8f5e9; border: 1px solid #c8e6c9; color: #2e7d32; }
                    .warning { background: #fff3e0; border: 1px solid #ffe0b2; color: #ef6c00; }
                    .link-box { word-break: break-all; background: white; padding: 10px; margin-top: 10px; border: 1px dashed #ccc; font-family: monospace; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2 style="color: #5d4037; margin-top:0;">Create New Guest Link</h2>
                    
                    <form id="createForm">
                        <div style="margin-bottom: 15px;">
                            <label>Guest Name:</label><br>
                            <input type="text" id="nameInput" name="name" placeholder="e.g. Budi & Partner" required>
                        </div>
                        <div style="margin-bottom: 20px;">
                            <label style="cursor:pointer; display:flex; align-items:center; gap:8px;">
                                <input type="checkbox" id="hideInput" name="isHide" value="1"> 
                                <span>Hide Wedding Gift Section?</span>
                            </label>
                        </div>
                        <button type="submit" id="submitBtn">Generate Link</button>
                    </form>

                    <div id="resultArea"></div>
                </div>

                <script>
                    document.getElementById('createForm').addEventListener('submit', async function(e) {
                        e.preventDefault(); // Stop page reload
                        
                        const btn = document.getElementById('submitBtn');
                        const resultArea = document.getElementById('resultArea');
                        const name = document.getElementById('nameInput').value;
                        const isHide = document.getElementById('hideInput').checked ? 1 : 0;

                        // UI Loading State
                        btn.innerText = "Generating...";
                        btn.disabled = true;
                        resultArea.style.display = 'none';

                        try {
                            // Send data to backend via AJAX
                            const response = await fetch('/create-guest', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name, isHide })
                            });

                            const data = await response.json();

                            // Build the HTML result
                            let htmlContent = '';
                            
                            if (data.success) {
                                // Determine styling class
                                const msgClass = data.isExisting ? 'warning' : 'success';
                                const title = data.isExisting ? 'Guest Already Exists' : 'Guest Created Successfully';
                                const statusText = data.isHide ? "Hidden" : "Visible";

                                resultArea.className = msgClass;
                                htmlContent = \`
                                    <strong>\${title}</strong>
                                    <ul style="margin: 10px 0; padding-left: 20px;">
                                        <li>Name: <b>\${data.name}</b></li>
                                        <li>Gift Section: <b>\${statusText}</b></li>
                                    </ul>
                                    Link:
                                    <div class="link-box">
                                        <a href="\${data.link}" target="_blank">\${data.link}</a>
                                    </div>
                                    <button onclick="navigator.clipboard.writeText('\${data.link}')" style="background:#8d6e63; font-size:12px; padding:5px 10px; margin-top:5px;">Copy Link</button>
                                \`;
                            } else {
                                resultArea.className = 'warning';
                                htmlContent = \`<strong>Error:</strong> \${data.message}\`;
                            }

                            // Show Result
                            resultArea.innerHTML = htmlContent;
                            resultArea.style.display = 'block';

                        } catch (err) {
                            alert("Connection Error");
                        } finally {
                            // Reset Button
                            btn.innerText = "Generate Link";
                            btn.disabled = false;
                        }
                    });
                </script>
            </body>
        </html>
    `);
});

// 3. ADMIN: POST DATA (Now returns JSON)
// untuk server gunakan sub domain myWedding, kalo di local hilangkan subDomainnya
app.post("/myWedding/create-guest", async (req, res) => {
  const name = req.body.name;
  const isHide = req.body.isHide; // 1 or 0 passed from frontend JSON

  if (!name)
    return res.status(400).json({ success: false, message: "Name required" });

  try {
    // Check duplication
    const [rows] = await pool.query("SELECT * FROM guests WHERE name = ?", [
      name,
    ]);

    if (rows.length > 0) {
      const existingLink = `https://${req.get("host")}/myWedding/?to=${
        rows[0].link_hash
      }`;

      // Return JSON indicating it exists
      return res.json({
        success: true,
        isExisting: true,
        name: rows[0].name,
        isHide: rows[0].isHide,
        link: existingLink,
      });
    }

    // Generate Hash
    const linkHash = crypto.randomBytes(5).toString("hex");
    const fullLink = `https://${req.get("host")}/myWedding/?to=${linkHash}`;

    // Insert
    await pool.query(
      "INSERT INTO guests (name, link_hash, isHide) VALUES (?, ?, ?)",
      [name, linkHash, isHide]
    );

    // Return JSON success
    res.json({
      success: true,
      isExisting: false,
      name: name,
      isHide: isHide,
      link: fullLink,
    });
  } catch (err) {
    console.log(err.stack);
    res.status(500).json({ success: false, message: err.message });
  }
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
