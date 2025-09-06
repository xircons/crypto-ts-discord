require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'valorant_tournament',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4_unicode_ci',
  timezone: 'Z'
});

async function ensureSchema() {
  const conn = await pool.getConnection();
  try {
    await conn.query("SET NAMES 'utf8mb4' COLLATE 'utf8mb4_unicode_ci'");
    await conn.query("SET time_zone = '+00:00'");
    await conn.query(`CREATE TABLE IF NOT EXISTS players (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      ign VARCHAR(100) NOT NULL,
      discord_id VARCHAR(32) NOT NULL,
      riot_id VARCHAR(100) NOT NULL,
      eligibility_doc VARCHAR(255) DEFAULT NULL,
      status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_discord (discord_id),
      UNIQUE KEY unique_riot (riot_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await conn.query(`CREATE TABLE IF NOT EXISTS teams (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      logo VARCHAR(255) DEFAULT NULL,
      captain_discord_id VARCHAR(32) NOT NULL,
      players_json JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await conn.query(`CREATE TABLE IF NOT EXISTS matches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      team_a VARCHAR(100) NOT NULL,
      team_b VARCHAR(100) NOT NULL,
      round VARCHAR(50) NOT NULL,
      time TIMESTAMP NOT NULL,
      status ENUM('scheduled','pending_review','completed','cancelled') NOT NULL DEFAULT 'scheduled',
      result VARCHAR(50) DEFAULT NULL,
      proof_url_a VARCHAR(255) DEFAULT NULL,
      proof_url_b VARCHAR(255) DEFAULT NULL,
      result_channel_id VARCHAR(32) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_time (time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await conn.query(`CREATE TABLE IF NOT EXISTS substitutions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      team_id INT NOT NULL,
      old_player VARCHAR(32) NOT NULL,
      new_player VARCHAR(32) NOT NULL,
      status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    // Ensure column type and timezone for existing installs
    try {
      await conn.query('ALTER TABLE matches MODIFY COLUMN time TIMESTAMP NOT NULL');
    } catch (_) {}
    try {
      await conn.query("ALTER TABLE matches MODIFY COLUMN status ENUM('scheduled','pending_review','completed','cancelled') NOT NULL DEFAULT 'scheduled'");
    } catch (_) {}
    try {
      await conn.query('ALTER TABLE matches ADD COLUMN proof_url_a VARCHAR(255) DEFAULT NULL');
    } catch (_) {}
    try {
      await conn.query('ALTER TABLE matches ADD COLUMN proof_url_b VARCHAR(255) DEFAULT NULL');
    } catch (_) {}
    try {
      await conn.query('ALTER TABLE matches ADD COLUMN result_channel_id VARCHAR(32) DEFAULT NULL');
    } catch (_) {}
  } finally {
    conn.release();
  }
}

module.exports = { pool, ensureSchema };


