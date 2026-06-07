const express = require("express");
const cors = require("cors");
const db = require("./db");
const QRCode = require("qrcode");

const corsOptions = {
  origin: "https://banco-de-pogi.netlify.app",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

app.use(cors(corsOptions));

// IMPORTANT: handle preflight
app.options("*", cors(corsOptions));

const app = express();

// ======================
// CORS (FIXED FOR NETLIFY + LOCAL TEST)
// ======================
app.use(cors({
  origin: [
    "https://banco-de-pogi.netlify.app",
    "http://localhost:5500",
    "http://127.0.0.1:5500"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://banco-de-pogi.netlify.app");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// ======================
// HEALTH CHECK
// ======================
app.get("/", (req, res) => {
  res.send("BANCO DE POGI SERVER VERSION 999");
});


// ======================
// HELPERS
// ======================
function generateUserNum() {
  return Math.floor(10000 + Math.random() * 90000);
}

function generateAccountNumber() {
  return "BDP-" + Math.floor(10000000 + Math.random() * 90000000);
}

async function addNotification(userNum, message) {
  await db.execute(
    `INSERT INTO notifications (user_num, message)
     VALUES (?, ?)`,
    [userNum, message]
  );
}

// ======================
// CREATE ACCOUNT
// ======================
app.post("/api/account/create", async (req, res) => {
  try {
    const { name } = req.body;

    const userNum = generateUserNum();
    const accountNumber = generateAccountNumber();

    const qrCode = `BDP-${userNum}`;
    const qrImage = await QRCode.toDataURL(qrCode);

    await db.execute(
      `INSERT INTO accounts
      (user_num, account_number, full_name, balance, qr_code, qr_image)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [userNum, accountNumber, name, 0, qrCode, qrImage]
    );

    res.json({
      userNum,
      accountNumber,
      name,
      balance: 0,
      qrCode,
      qrImage,
      transactions: []
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// ======================
// LOGIN
// ======================
app.post("/api/account/login", async (req, res) => {
  try {
    const { userNum, pin } = req.body;

    const [rows] = await db.execute(
      "SELECT * FROM accounts WHERE user_num = ?",
      [userNum]
    );

    if (rows.length === 0)
      return res.status(404).json({ error: "Account not found" });

    const user = rows[0];

    if (user.pin !== pin)
      return res.status(401).json({ error: "Invalid PIN" });

    res.json(user);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login error" });
  }
});

// ======================
// SETUP PIN
// ======================
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
    res.status(500).json({ error: "DB error" });
  }
});

// ======================
// DEPOSIT
// ======================
app.post("/api/account/:userNum/deposit", async (req, res) => {
  try {
    const { userNum } = req.params;
    const { amount } = req.body;

    await db.execute(
      "UPDATE accounts SET balance = balance + ? WHERE user_num = ?",
      [amount, userNum]
    );

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Deposit error" });
  }
});

// ======================
// WITHDRAW
// ======================
app.post("/api/account/:userNum/withdraw", async (req, res) => {
  try {
    const { userNum } = req.params;
    const { amount } = req.body;

    await db.execute(
      "UPDATE accounts SET balance = balance - ? WHERE user_num = ?",
      [amount, userNum]
    );

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Withdraw error" });
  }
});

// ======================
// SEND MONEY
// ======================
app.post("/api/account/:userNum/send-money", async (req, res) => {
  try {
    const { userNum } = req.params;
    const { recipientAcct, amount } = req.body;

    await db.execute(
      "UPDATE accounts SET balance = balance - ? WHERE user_num = ?",
      [amount, userNum]
    );

    await db.execute(
      "UPDATE accounts SET balance = balance + ? WHERE account_number = ?",
      [amount, recipientAcct]
    );

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Transfer error" });
  }
});

// ======================
// CHANGE PIN
// ======================
app.post("/api/account/:userNum/change-pin", async (req, res) => {
  try {
    const { userNum } = req.params;
    const { currentPin, newPin } = req.body;

    const [rows] = await db.execute(
      "SELECT pin FROM accounts WHERE user_num = ?",
      [userNum]
    );

    if (rows[0].pin !== currentPin)
      return res.status(401).json({ error: "Wrong PIN" });

    await db.execute(
      "UPDATE accounts SET pin = ? WHERE user_num = ?",
      [newPin, userNum]
    );

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Change PIN error" });
  }
});

// ======================
// SERVER (ONLY ONE PORT — FIXED)
// ======================
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("=================================");
  console.log(" BANCO DE POGI SERVER RUNNING ");
  console.log(" PORT:", PORT);
  console.log("=================================");
});