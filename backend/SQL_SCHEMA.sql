-- MySQL schema for Valorant Tournament System (utf8mb4)
CREATE DATABASE IF NOT EXISTS valorant_tournament
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
USE valorant_tournament;

CREATE TABLE IF NOT EXISTS players (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  logo VARCHAR(255) DEFAULT NULL,
  captain_discord_id VARCHAR(32) NOT NULL,
  players_json JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Matches table
CREATE TABLE IF NOT EXISTS matches (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Substitutions table
CREATE TABLE IF NOT EXISTS substitutions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  old_player VARCHAR(32) NOT NULL,
  new_player VARCHAR(32) NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed data (mockup): Thai faculties tournament
-- Note: Times are stored in UTC; UI renders in Asia/Bangkok.

-- Teams (INSERT IGNORE to avoid duplicates on re-run)
INSERT IGNORE INTO teams (name, logo, captain_discord_id, players_json) VALUES
('วิทยาลัยนานาชาตินวัตกรรมดิจิทัล', NULL, '100000000000000101', JSON_ARRAY('100000000000000101')),
('คณะวิศวกรรมศาสตร์ team1', NULL, '100000000000000102', JSON_ARRAY('100000000000000102')),
('คณะวิศวกรรมศาสตร์ team2', NULL, '100000000000000103', JSON_ARRAY('100000000000000103')),
('คณะรัฐศาสตร์และรัฐประศาสนศาสตร์', NULL, '100000000000000104', JSON_ARRAY('100000000000000104')),
('คณะแพทยศาสตร์ team1', NULL, '100000000000000105', JSON_ARRAY('100000000000000105')),
('คณะแพทยศาสตร์ team2', NULL, '100000000000000106', JSON_ARRAY('100000000000000106')),
('วิทยาลัยศิลปะ สื่อ และเทคโนโลยี team1', NULL, '100000000000000107', JSON_ARRAY('100000000000000107')),
('คณะวิทยาศาสตร์', NULL, '100000000000000108', JSON_ARRAY('100000000000000108')),
('คณะบริหารธุรกิจ', NULL, '100000000000000109', JSON_ARRAY('100000000000000109'));

-- Optional: clear previous matches before inserting mockup (comment out if not desired)
DELETE FROM matches;

-- Rounds
-- รอบคัดเลือก / Qualification
INSERT INTO matches (team_a, team_b, round, time, status, result) VALUES
('วิทยาลัยนานาชาตินวัตกรรมดิจิทัล', 'คณะวิศวกรรมศาสตร์ team2', 'รอบคัดเลือก / Qualification', '2024-09-26 02:00:00', 'completed', 'B'),
('คณะแพทยศาสตร์ team2', 'คณะวิศวกรรมศาสตร์ team1', 'รอบคัดเลือก / Qualification', '2024-09-26 03:30:00', 'completed', 'A'),
('วิทยาลัยศิลปะ สื่อ และเทคโนโลยี team1', 'คณะวิทยาศาสตร์', 'รอบคัดเลือก / Qualification', '2024-09-26 05:00:00', 'completed', 'A');

-- รอบ 8 ทีม / Quarterfinals
INSERT INTO matches (team_a, team_b, round, time, status, result) VALUES
('คณะรัฐศาสตร์และรัฐประศาสนศาสตร์', 'คณะวิศวกรรมศาสตร์ team2', 'รอบ 8 ทีม / Quarterfinals', '2024-09-27 02:00:00', 'completed', 'B'),
('คณะแพทยศาสตร์ team1', 'วิทยาลัยศิลปะ สื่อ และเทคโนโลยี team1', 'รอบ 8 ทีม / Quarterfinals', '2024-09-27 03:30:00', 'completed', 'B'),
('คณะแพทยศาสตร์ team2', 'คณะบริหารธุรกิจ', 'รอบ 8 ทีม / Quarterfinals', '2024-09-27 06:00:00', 'completed', 'B');

-- Semifinals
INSERT INTO matches (team_a, team_b, round, time, status, result) VALUES
('คณะวิศวกรรมศาสตร์ team2', 'วิทยาลัยศิลปะ สื่อ และเทคโนโลยี team1', 'Semifinals', '2024-09-28 07:00:00', 'completed', 'B'),
('คณะแพทยศาสตร์ team1', 'คณะบริหารธุรกิจ', 'Semifinals', '2024-09-28 09:00:00', 'completed', 'A');

-- Finals
INSERT INTO matches (team_a, team_b, round, time, status, result) VALUES
('วิทยาลัยศิลปะ สื่อ และเทคโนโลยี team1', 'คณะแพทยศาสตร์ team1', 'Finals', '2024-09-29 08:00:00', 'completed', 'A');


