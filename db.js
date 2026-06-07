const mysql = require("mysql2");
require("dotenv").config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// DO NOT crash app if DB fails
pool.getConnection((err, connection) => {
    if (err) {
        console.log("❌ DB Connection Failed:", err.message);
        return;
    }

    console.log("✅ Connected to Clever Cloud MySQL!");
    connection.release();
});

module.exports = pool;