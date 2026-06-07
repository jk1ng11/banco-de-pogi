const express = require("express");
const cors = require("cors");
const db = require("./db");
const QRCode = require("qrcode");

const app = express();

/* =========================
   CORS FIX (PRODUCTION SAFE)
========================= */
const allowedOrigins = [
  "https://banco-de-pogi.netlify.app",
  "http://localhost:3000"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Blocked by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options("*", cors());

app.use(express.json());

/* =========================
   HEALTH CHECK
========================= */
app.get("/", (req, res) => {
  res.send("BANCO DE POGI API IS RUNNING 🚀");
});

/* =========================
   HELPERS
========================= */
function generateUserNum() {
  return Math.floor(10000 + Math.random() * 90000);
}

function generateAccountNumber() {
  return "BDP-" + Math.floor(10000000 + Math.random() * 90000000);
}

async function addNotification(userNum, message) {
  try {
    await db.execute(
      "INSERT INTO notifications (user_num, message) VALUES (?, ?)",
      [userNum, message]
    );
  } catch (err) {
    console.log("Notification error:", err.message);
  }
}

/* =========================
   CREATE ACCOUNT
========================= */
app.post("/api/account/create", async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Name required" });
    }

    const userNum = generateUserNum();
    const accountNumber = generateAccountNumber();

    const qrCode = `BDP-${userNum}`;
    const qrImage = await QRCode.toDataURL(qrCode);

    await db.execute(
      `INSERT INTO accounts (user_num, account_number, full_name, balance, qr_code, qr_image)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userNum, accountNumber, name, 0, qrCode, qrImage]
    );

    res.json({
      userNum,
      accountNumber,
      qrCode,
      name,
      balance: 0
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   LOGIN
========================= */
app.post("/api/account/login", async (req, res) => {
  try {
    const { userNum, pin } = req.body;

    const [rows] = await db.execute(
      "SELECT * FROM accounts WHERE user_num = ?",
      [userNum]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = rows[0];

    if (user.pin !== pin) {
      return res.status(400).json({ error: "Wrong PIN" });
    }

    res.json(user);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   SET PIN (IMPORTANT FIX)
========================= */
app.post("/api/account/:userNum/setup-pin", async (req, res) => {
  try {
    const { userNum } = req.params;
    const { pin } = req.body;

    await db.execute(
      "UPDATE accounts SET pin = ? WHERE user_num = ?",
      [pin, userNum]
    );

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   SERVER (ONLY ONE LISTENER!)
========================= */
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("=================================");
  console.log(" BANCO DE POGI RUNNING ");
  console.log(" PORT:", PORT);
  console.log("=================================");
});