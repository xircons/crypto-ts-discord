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
      challonge_participant_id VARCHAR(50) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await conn.query(`CREATE TABLE IF NOT EXISTS matches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      challonge_match_id VARCHAR(50) DEFAULT NULL,
      team_a INT DEFAULT NULL,
      team_b INT DEFAULT NULL,
      round INT DEFAULT NULL,
      time TIMESTAMP NULL,
      status ENUM('pending','awaiting_proof','completed') NOT NULL DEFAULT 'pending',
      result VARCHAR(50) DEFAULT NULL,
      proof_url_a TEXT DEFAULT NULL,
      proof_url_b TEXT DEFAULT NULL,
      result_channel_id VARCHAR(32) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_time (time),
      UNIQUE KEY uniq_ch_match (challonge_match_id)
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
    // Attempt migrations for existing installs
    try { await conn.query('ALTER TABLE teams ADD COLUMN challonge_participant_id VARCHAR(50) DEFAULT NULL'); } catch (_) {}
    try { await conn.query('ALTER TABLE matches ADD COLUMN challonge_match_id VARCHAR(50) DEFAULT NULL'); } catch (_) {}
    try { await conn.query('ALTER TABLE matches ADD UNIQUE KEY uniq_ch_match (challonge_match_id)'); } catch (_) {}
    try { await conn.query('ALTER TABLE matches MODIFY COLUMN round INT NULL'); } catch (_) {}
    try { await conn.query("ALTER TABLE matches MODIFY COLUMN status ENUM('pending','awaiting_proof','completed') NOT NULL DEFAULT 'pending'"); } catch (_) {}
    try { await conn.query('ALTER TABLE matches MODIFY COLUMN proof_url_a TEXT DEFAULT NULL'); } catch (_) {}
    try { await conn.query('ALTER TABLE matches MODIFY COLUMN proof_url_b TEXT DEFAULT NULL'); } catch (_) {}
  } finally {
    conn.release();
  }
}

module.exports = { pool, ensureSchema };


