const express = require("express");
const cors = require("cors");
const db = require("./db");
const QRCode = require("qrcode");

const app = express(); // MUST be first

app.use(cors({
  origin: "https://banco-de-pogi.netlify.app",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options("/*", cors()); // FIX FOR RENDER NODE 24

app.use(express.json());

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
  await db.execute(
    `INSERT INTO notifications (user_num, message)
     VALUES (?, ?)`,
    [userNum, message]
  );
}

/* =========================
   TEST ROUTE
========================= */

app.get("/", (req, res) => {
  res.send("BANCO DE POGI API RUNNING");
});

/* =========================
   CREATE ACCOUNT
========================= */

app.post("/api/account/create", async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
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
      name,
      qrCode,
      balance: 0,
      transactions: []
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
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
      return res.status(404).json({ error: "Account not found" });
    }

    const account = rows[0];

    if (account.pin !== pin) {
      return res.status(400).json({ error: "Invalid PIN" });
    }

    res.json({
      userNum: account.user_num,
      accountNumber: account.account_number,
      name: account.full_name,
      balance: Number(account.balance)
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

/* =========================
   SETUP PIN
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
    res.status(500).json({ error: "Database error" });
  }
});

/* =========================
   DEPOSIT
========================= */

app.post("/api/account/:userNum/deposit", async (req, res) => {
  try {
    const { userNum } = req.params;
    const { amount } = req.body;

    const [rows] = await db.execute(
      "SELECT * FROM accounts WHERE user_num = ?",
      [userNum]
    );

    const account = rows[0];
    const newBalance = Number(account.balance) + Number(amount);

    await db.execute(
      "UPDATE accounts SET balance = ? WHERE user_num = ?",
      [newBalance, userNum]
    );

    res.json({ balance: newBalance });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

/* =========================
   WITHDRAW
========================= */

app.post("/api/account/:userNum/withdraw", async (req, res) => {
  try {
    const { userNum } = req.params;
    const { amount } = req.body;

    const [rows] = await db.execute(
      "SELECT * FROM accounts WHERE user_num = ?",
      [userNum]
    );

    const account = rows[0];

    if (Number(amount) > Number(account.balance)) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    const newBalance = Number(account.balance) - Number(amount);

    await db.execute(
      "UPDATE accounts SET balance = ? WHERE user_num = ?",
      [newBalance, userNum]
    );

    res.json({ balance: newBalance });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

/* =========================
   SEND MONEY
========================= */

app.post("/api/account/:userNum/send-money", async (req, res) => {
  try {
    const { userNum } = req.params;
    const { recipientAcct, amount } = req.body;

    const [senderRows] = await db.execute(
      "SELECT * FROM accounts WHERE user_num = ?",
      [userNum]
    );

    const sender = senderRows[0];

    const [receiverRows] = await db.execute(
      "SELECT * FROM accounts WHERE account_number = ?",
      [recipientAcct]
    );

    const receiver = receiverRows[0];

    const senderBal = Number(sender.balance) - Number(amount);
    const receiverBal = Number(receiver.balance) + Number(amount);

    await db.execute(
      "UPDATE accounts SET balance = ? WHERE user_num = ?",
      [senderBal, userNum]
    );

    await db.execute(
      "UPDATE accounts SET balance = ? WHERE account_number = ?",
      [receiverBal, recipientAcct]
    );

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

/* =========================
   SERVER START (ONLY ONCE)
========================= */

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("=================================");
  console.log(" BANCO DE POGI RESTORED SERVER ");
  console.log(" PORT:", PORT);
  console.log("=================================");
});