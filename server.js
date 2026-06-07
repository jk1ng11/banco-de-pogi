const express = require("express");
const cors = require("cors");

app.use(cors({
  origin: "https://your-netlify-site.netlify.app"
}));

const db = require("./db");
const QRCode = require("qrcode");

const app = express();

app.use(cors());
app.use(express.json());

// TEST ROUTE
app.get("/", (req, res) => {
    res.send("BANCO SERVER VERSION 999");
});

const PORT = process.env.PORT || 3000 || 8080;

app.listen(PORT, () => {
    console.log("Server running on port", PORT);
});








// ==========================
// HELPERS
// ==========================


function generateUserNum() {
    return Math.floor(10000 + Math.random() * 90000);
}



function generateAccountNumber() {
return "BDP-" + Math.floor(10000000 + Math.random() * 90000000);
}



function money(amount) {
return Number(amount).toFixed(2);
}

async function addNotification(userNum, message) {
    await db.execute(
        `INSERT INTO notifications (user_num, message)
         VALUES (?, ?)`,
        [userNum, message]
    );
}

// ==========================
// CREATE ACCOUNT
// ==========================

app.post("/api/account/create", async (req, res) => {
    try {

        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                error: "Name is required"
            });
        }

        const userNum = generateUserNum();
        const accountNumber = generateAccountNumber();
        
        const qrCode = `BDP-${userNum}`;
        const qrImage = await QRCode.toDataURL(qrCode);

        console.log("Generated QR:", qrCode);
        console.log(userNum, accountNumber, name, qrCode);

        await db.execute(
             `INSERT INTO accounts
                (user_num, account_number, full_name, balance, qr_code, qr_image)
                VALUES (?, ?, ?, ?, ?, ?)`,
             [userNum, accountNumber, name, 0, qrCode, qrImage]
);

        res.json({
            userNum,
            accountNumber,
            qrCode,
            name,
            balance: 0,
            transactions: []
});

    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: "Database error"
        });
    }
});

// ==========================
// LOGIN
// ==========================

app.post("/api/account/login", async (req, res) => {

    try {

        const { userNum , pin } = req.body;

        const [accounts] = await db.execute(
            "SELECT * FROM accounts WHERE user_num = ?",
            [userNum]
        );

        if (accounts.length === 0) {
            return res.status(404).json({
                error: "User number not found"
            });
        }

        const account = accounts[0];
        if (account.pin !== pin) {
             return res.status(400).json({
              error: "Invalid PIN"
            });
}

        const [transactions] = await db.execute(
            `
            SELECT description
            FROM transactions
            WHERE user_num = ?
            ORDER BY id DESC
            `,
            [userNum]
        );

        res.json({
            userNum: account.user_num,
            accountNumber: account.account_number,
            qrCode: account.qr_code,
            qrImage: account.qr_image,
            name: account.full_name,
            pin: account.pin,
            balance: Number(account.balance),
            transactions: transactions.map(t => t.description)
});

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: "Database error"
        });

    }

});

// ==========================
// SETUP PIN
// ==========================

app.post("/api/account/:userNum/setup-pin", async (req, res) => {

    try {

        const { pin } = req.body;
        const { userNum } = req.params;

        await db.execute(
            "UPDATE accounts SET pin = ? WHERE user_num = ?",
            [pin, userNum]
        );

        res.json({
            success: true
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: "Database error"
        });

    }

});



// ==========================
// DEPOSIT
// ==========================

app.post("/api/account/:userNum/deposit", async (req, res) => {

    try {

        const { userNum } = req.params;
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                error: "Invalid amount"
            });
        }

        const [accounts] = await db.execute(
            "SELECT * FROM accounts WHERE user_num = ?",
            [userNum]
        );

        if (accounts.length === 0) {
            return res.status(404).json({
                error: "Account not found"
            });
        }

        const account = accounts[0];

        const newBalance =
            Number(account.balance) + Number(amount);

        await db.execute(
            "UPDATE accounts SET balance = ? WHERE user_num = ?",
            [newBalance, userNum]
        );

        await db.execute(
            `INSERT INTO transactions
            (user_num, description)
            VALUES (?, ?)`,
            [
                userNum,
                `DEPOSIT | +₱${Number(amount).toFixed(2)} | Balance ₱${newBalance.toFixed(2)}`
            ]
        );

        const [transactions] = await db.execute(
            `SELECT description
             FROM transactions
             WHERE user_num = ?
             ORDER BY id DESC`,
            [userNum]
        );

        res.json({
            userNum: account.user_num,
            accountNumber: account.account_number,
            name: account.full_name,
            balance: newBalance,
            transactions: transactions.map(t => t.description)
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: "Database error"
        });

    }

});

// ==========================
// WITHDRAW
// ==========================

app.post("/api/account/:userNum/withdraw", async (req, res) => {

    try {

        const { userNum } = req.params;
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                error: "Invalid amount"
            });
        }

        const [accounts] = await db.execute(
            "SELECT * FROM accounts WHERE user_num = ?",
            [userNum]
        );

        if (accounts.length === 0) {
            return res.status(404).json({
                error: "Account not found"
            });
        }

        const account = accounts[0];

        if (Number(amount) > Number(account.balance)) {
            return res.status(400).json({
                error: "Insufficient balance"
            });
        }

        const newBalance =
            Number(account.balance) - Number(amount);

        await db.execute(
            "UPDATE accounts SET balance = ? WHERE user_num = ?",
            [newBalance, userNum]
        );

        await db.execute(
            `INSERT INTO transactions
            (user_num, description)
            VALUES (?, ?)`,
            [
                userNum,
                `WITHDRAWAL | -₱${Number(amount).toFixed(2)} | Balance ₱${newBalance.toFixed(2)}`
            ]
        );

        const [transactions] = await db.execute(
            `SELECT description
             FROM transactions
             WHERE user_num = ?
             ORDER BY id DESC`,
            [userNum]
        );

        res.json({
            userNum: account.user_num,
            accountNumber: account.account_number,
            name: account.full_name,
            balance: newBalance,
            transactions: transactions.map(t => t.description)
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: "Database error"
        });

    }

});

// ==========================
// PAY BILLS
// ==========================

app.post("/api/account/:userNum/pay-bills", async (req, res) => {

    try {

        const { userNum } = req.params;
        const { biller, amount, refNum } = req.body;

        const [accounts] = await db.execute(
            "SELECT * FROM accounts WHERE user_num = ?",
            [userNum]
        );

        if (accounts.length === 0) {
            return res.status(404).json({
                error: "Account not found"
            });
        }

        const account = accounts[0];

        const currentBalance = Number(account.balance);
        const payAmount = Number(amount);

        if (payAmount <= 0) {
            return res.status(400).json({
                error: "Invalid amount"
            });
        }

        if (currentBalance < payAmount) {
            return res.status(400).json({
                error: "Insufficient balance"
            });
        }

        const newBalance = currentBalance - payAmount;

        await db.execute(
            "UPDATE accounts SET balance = ? WHERE user_num = ?",
            [newBalance, userNum]
        );

        const description =
            `PAY BILLS | ${biller} | -₱${payAmount.toFixed(2)} | Balance: ₱${newBalance.toFixed(2)}`;

        await db.execute(
            `INSERT INTO transactions (user_num, description)
             VALUES (?, ?)`,
            [userNum, description]
        );
        const receiptId = 'BPD-' + Date.now();

        await db.execute(
            `INSERT INTO receipts
            (
            user_num,
            receipt_id,
            type,
            biller,
            reference_no,
            amount,
            fee,
            total
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
            userNum,
            receiptId,
            'Bill Payment',
            biller,
            refNum,
            payAmount - 15,   // actual bill amount
            15,               // convenience fee
            payAmount         // total deducted
            ]
        );

        const [transactions] = await db.execute(
            `SELECT description
             FROM transactions
             WHERE user_num = ?
             ORDER BY id DESC`,
            [userNum]
        );

        res.json({
            userNum: account.user_num,
            accountNumber: account.account_number,
            name: account.full_name,
            balance: newBalance,
            transactions: transactions.map(t => t.description)
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: "Database error"
        });

    }

});

// ==========================
// SEND MONEY
// ==========================

app.post("/api/account/:userNum/send-money", async (req, res) => {

    try {

        const { userNum } = req.params;

        const {
            recipientAcct,
            recipientName,
            amount
        } = req.body;

        if (!recipientAcct || !amount || amount <= 0) {
            return res.status(400).json({
                error: "Invalid transfer details"
            });
        }

        // Sender
        const [senderRows] = await db.execute(
            "SELECT * FROM accounts WHERE user_num = ?",
            [userNum]
        );

        if (senderRows.length === 0) {
            return res.status(404).json({
                error: "Sender account not found"
            });
        }

        const sender = senderRows[0];

        // Receiver
       const [receiverRows] = await db.execute(
            "SELECT * FROM accounts WHERE account_number = ?",
            [recipientAcct]
            );

        if (receiverRows.length === 0) {
            return res.status(404).json({
                error: "Recipient not found"
            });
        }

        const receiver = receiverRows[0];

        if (Number(amount) > Number(sender.balance)) {
            return res.status(400).json({
                error: "Insufficient balance"
            });
        }

        const senderBalance =
            Number(sender.balance) - Number(amount);

        const receiverBalance =
            Number(receiver.balance) + Number(amount);

        // Update sender
        await db.execute(
            "UPDATE accounts SET balance = ? WHERE user_num = ?",
            [senderBalance, userNum]
        );

        // Update receiver
       await db.execute(
            "UPDATE accounts SET balance = ? WHERE account_number = ?",
            [receiverBalance, recipientAcct]
        );

        // Sender transaction
        await db.execute(
            `INSERT INTO transactions
            (user_num, description)
            VALUES (?, ?)`,
            [
                userNum,
                `SEND MONEY | To: ${receiver.full_name} (${receiver.account_number}) | -₱${Number(amount).toFixed(2)} | Balance ₱${senderBalance.toFixed(2)}`
            ]
        );

        // Receiver transaction
        await db.execute(
            `INSERT INTO transactions
            (user_num, description)
            VALUES (?, ?)`,
            [
               receiver.user_num,
                `RECEIVED MONEY | From: ${sender.full_name} (${sender.account_number}) | +₱${Number(amount).toFixed(2)} | Balance ₱${receiverBalance.toFixed(2)}`
            ]
        );
        await addNotification(
             receiver.user_num,
            `💸 ${sender.full_name} sent you ₱${amount}`
            );

        await addNotification(
             sender.user_num,
            `✅ You sent ₱${amount} to ${receiver.full_name}`
            );

        const [transactions] = await db.execute(
            `SELECT description
             FROM transactions
             WHERE user_num = ?
             ORDER BY id DESC`,
            [userNum]
        );

        res.json({
            userNum: sender.user_num,
            accountNumber: sender.account_number,
            name: sender.full_name,
            balance: senderBalance,
            transactions: transactions.map(t => t.description)
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: "Database error"
        });

    }

});

// ==========================
// SEND MONEY BY QR
// ==========================
app.post("/api/account/:userNum/send-qr", async (req, res) => {

    try {

        const senderUserNum = req.params.userNum;
        const { qrCode, amount } = req.body;

        const [receiverRows] = await db.execute(
            "SELECT * FROM accounts WHERE qr_code = ?",
            [qrCode]
        );

        if (receiverRows.length === 0) {
            return res.status(404).json({
                error: "QR code not found"
            });
        }

        const receiver = receiverRows[0];

        const [senderRows] = await db.execute(
            "SELECT * FROM accounts WHERE user_num = ?",
            [senderUserNum]
        );

        const sender = senderRows[0];

        if (Number(sender.balance) < Number(amount)) {
            return res.status(400).json({
                error: "Insufficient balance"
            });
        }

        // deduct sender
        await db.execute(
            "UPDATE accounts SET balance = balance - ? WHERE user_num = ?",
            [amount, senderUserNum]
        );

        // add receiver
        await db.execute(
            "UPDATE accounts SET balance = balance + ? WHERE user_num = ?",
            [amount, receiver.user_num]
        );

        await db.execute(
            "INSERT INTO transactions(user_num, description) VALUES (?, ?)",
            [
                senderUserNum,
                `SEND QR | ${receiver.full_name} | -₱${Number(amount).toFixed(2)}`
            ]
        );
        await db.execute(
            "INSERT INTO transactions(user_num, description) VALUES (?, ?)",
            [
                receiver.user_num,
                `RECEIVED QR | ${sender.full_name} | +₱${Number(amount).toFixed(2)}`
            ]
);

        const [updatedRows] = await db.execute(
            "SELECT * FROM accounts WHERE user_num = ?",
            [senderUserNum]
        );

        const updated = updatedRows[0];

        const [transactions] = await db.execute(
            "SELECT description FROM transactions WHERE user_num=? ORDER BY id DESC",
            [senderUserNum]
        );

        res.json({
            userNum: updated.user_num,
            accountNumber: updated.account_number,
            name: updated.full_name,
            balance: Number(updated.balance),
            qrCode: updated.qr_code,
            transactions: transactions.map(t => t.description)
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: "Database error"
        });
    }

});

// ==========================
// REQUEST MONEY
// ==========================

app.post("/api/account/:userNum/request-money", async (req, res) => {

    try {

        const { userNum } = req.params;
        const { fromAcct, fromName, amount, reason } = req.body;

        const [accounts] = await db.execute(
            "SELECT * FROM accounts WHERE user_num = ?",
            [userNum]
        );

        if (accounts.length === 0) {
            return res.status(404).json({
                error: "Account not found"
            });
        }

        const account = accounts[0];

        // FIND ACCOUNT USING ACCOUNT NUMBER
        const [payerRows] = await db.execute(
            "SELECT * FROM accounts WHERE account_number = ?",
            [fromAcct]
        );

        if (payerRows.length === 0) {
            return res.status(404).json({
                error: "Recipient account not found"
            });
        }

        const payer = payerRows[0];

        // SAVE REQUEST
        await db.execute(
            `INSERT INTO money_requests
            (
                requester_user_num,
                payer_user_num,
                amount,
                note
            )
            VALUES (?, ?, ?, ?)`,
            [
                userNum,
                payer.user_num,
                amount,
                reason
            ]
        );
        await addNotification(
            payer.user_num,
            `📩 ${account.full_name} (${account.account_number}) requested ₱${Number(amount).toFixed(2)}`
        );

        const [transactions] = await db.execute(
            "SELECT description FROM transactions WHERE user_num=? ORDER BY id DESC",
            [userNum]
        );

        res.json({
            userNum: account.user_num,
            accountNumber: account.account_number,
            name: account.full_name,
            balance: Number(account.balance),
            transactions: transactions.map(t => t.description)
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: "Database error"
        });

    }

});

// ==========================
// VIEW PENDING REQUESTS
// ==========================

app.get("/api/account/:userNum/requests", async (req, res) => {

    const [rows] = await db.execute(
        `SELECT *
         FROM money_requests
         WHERE payer_user_num = ?
         AND status = 'PENDING'`,
        [req.params.userNum]
    );

    res.json(rows);

});

// ==========================
// APPROVE REQUEST
// ==========================

app.post("/api/account/:userNum/approve-request/:requestId", async (req, res) => {

    try {

        const payerUserNum = req.params.userNum;
        const requestId = req.params.requestId;

        const [requestRows] = await db.execute(
            `SELECT * FROM money_requests
             WHERE id = ?
             AND status = 'PENDING'`,
            [requestId]
        );

        if (requestRows.length === 0) {
            return res.status(404).json({
                error: "Request not found"
            });
        }

        const request = requestRows[0];
        const [requesterRows] = await db.execute(
            "SELECT * FROM accounts WHERE user_num = ?",
            [request.requester_user_num]
            );

            const requester = requesterRows[0];

            const amount = Number(request.amount);

            const [payerRows] = await db.execute(
            "SELECT * FROM accounts WHERE user_num = ?",
            [payerUserNum]
            );

        const payer = payerRows[0];


        if (Number(payer.balance) < amount) {
            return res.status(400).json({
                error: "Insufficient balance"
            });
        }

        await db.execute(
            "UPDATE accounts SET balance = balance - ? WHERE user_num = ?",
            [amount, payerUserNum]
        );

        await db.execute(
            "UPDATE accounts SET balance = balance + ? WHERE user_num = ?",
            [amount, request.requester_user_num]
        );

        await db.execute(
            "UPDATE money_requests SET status='APPROVED' WHERE id=?",
            [requestId]
        );
        await addNotification(
            request.requester_user_num,
            `✅ ${payer.full_name} approved your request of ₱${amount.toFixed(2)}`
        );

        await addNotification(
            payerUserNum,
            `💸 You sent ₱${amount.toFixed(2)} to ${requester.full_name}`
        );

        await db.execute(
            "INSERT INTO transactions(user_num, description) VALUES (?, ?)",
            [
                payerUserNum,
                `REQUEST APPROVED | To: ${requester.full_name} (${requester.account_number}) | -₱${amount.toFixed(2)}`
            ]
        );

        await db.execute(
            "INSERT INTO transactions(user_num, description) VALUES (?, ?)",
            [
                 requester.user_num,
                 `REQUEST RECEIVED | From: ${payer.full_name} (${payer.account_number}) | +₱${amount.toFixed(2)}`
            ]
        );

        const [updatedRows] = await db.execute(
            "SELECT * FROM accounts WHERE user_num = ?",
            [payerUserNum]
        );

        const updated = updatedRows[0];

        const [transactions] = await db.execute(
            "SELECT description FROM transactions WHERE user_num=? ORDER BY id DESC",
            [payerUserNum]
        );

        res.json({
            userNum: updated.user_num,
            accountNumber: updated.account_number,
            name: updated.full_name,
            balance: Number(updated.balance),
            qrCode: updated.qr_code,
            transactions: transactions.map(t => t.description)
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: "Database error"
        });

    }

});


// ==========================
// REJECT MONEY REQUEST
// ==========================

app.post("/api/request/:requestId/reject", async (req, res) => {

    try {

        await db.execute(
            `UPDATE money_requests
             SET status = 'REJECTED'
             WHERE id = ?`,
            [req.params.requestId]
        );

        res.json({
            success: true
        });

        await addNotification(
         request.requester_user_num,
         `❌ Your request for ₱${amount} was rejected`
        );

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: "Database error"
        });

    }

});
// ==========================
// Receipt notif
// ==========================

app.get("/api/account/:userNum/receipts", async (req, res) => {

    try {

        const { userNum } = req.params;

        const [receipts] = await db.execute(
            `SELECT *
             FROM receipts
             WHERE user_num = ?
             ORDER BY id DESC`,
            [userNum]
        );

        res.json(receipts);

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: "Database error"
        });

    }

});

// ==========================
// CHANGE PIN
// ==========================

app.post("/api/account/:userNum/change-pin", async (req, res) => {

    try {

        const { userNum } = req.params;
        const { currentPin, newPin } = req.body;

        const [rows] = await db.execute(
            "SELECT * FROM accounts WHERE user_num = ?",
            [userNum]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                error: "Account not found"
            });
        }

        const account = rows[0];

        if (account.pin !== currentPin) {
            return res.status(400).json({
                error: "Current PIN is incorrect"
            });
        }

        await db.execute(
            "UPDATE accounts SET pin = ? WHERE user_num = ?",
            [newPin, userNum]
        );

        await addNotification(
             userNum,
            "🔒 Your PIN was changed successfully"
        );

        res.json({
            success: true
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: "Database error"
        });

    }

});

// ==========================
// GET NOTIFICATIONS
// ==========================

app.get("/api/account/:userNum/notifications", async (req, res) => {

    try {

        const [rows] = await db.execute(
            `SELECT *
             FROM notifications
             WHERE user_num = ?
             ORDER BY id DESC`,
            [req.params.userNum]
        );

        res.json(rows);

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: "Database error"
        });

    }

});

// ==========================
// NOTIFICATION COUNT
// ==========================

app.get("/api/account/:userNum/notification-count", async (req, res) => {

    try {

        const [rows] = await db.execute(
            `SELECT COUNT(*) AS count
             FROM notifications
             WHERE user_num = ?
             AND is_read = FALSE`,
            [req.params.userNum]
        );

        res.json({
            count: rows[0].count
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: "Database error"
        });

    }

});

// ==========================
// MARK AS READ
// ==========================

app.post("/api/account/:userNum/read-notifications", async (req, res) => {

    try {

        await db.execute(
            `UPDATE notifications
             SET is_read = TRUE
             WHERE user_num = ?`,
            [req.params.userNum]
        );

        res.json({
            success: true
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: "Database error"
        });

    }

});

// ==========================
// SERVER
// ==========================

console.log("Routes loaded");

app.get("/", (req, res) => {
    res.send("Banco De Pogi Server is Running!");
});

app.get("/test", (req, res) => {
    res.send("TEST WORKS");
});
app.post("/api/test123", (req, res) => {
    res.json({
        success: true
    });
});
app.get("/hello", (req, res) => {
    res.send("HELLO WORKS");
});

app.listen(8080, () => {
    console.log("=================================");
    console.log(" BANCO DE POGI SERVER RUNNING ");
    console.log(" http://localhost:8080");
    console.log("=================================");
});
