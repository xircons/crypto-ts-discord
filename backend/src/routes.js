const express = require('express');
const Joi = require('joi');
const challonge = require('./challonge');

const playerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  ign: Joi.string().min(2).max(100).required(),
  discord_id: Joi.string().pattern(/^[0-9]{17,20}$/).required(),
  riot_id: Joi.string().min(3).max(100).required(),
  eligibility_doc: Joi.string().uri().allow('', null)
});

const teamSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  logo: Joi.string().uri().allow('', null),
  captain_discord_id: Joi.string().pattern(/^[0-9]{17,20}$/).required(),
  players: Joi.array().items(Joi.string().pattern(/^[0-9]{17,20}$/)).min(1).max(5).required()
});

const matchCreateSchema = Joi.object({
  team_a: Joi.string().min(3).max(100).required(),
  team_b: Joi.string().min(3).max(100).required(),
  round: Joi.string().min(1).max(50).required(),
  time: Joi.date().iso().required()
});

const resultSubmitSchema = Joi.object({
  match_id: Joi.number().integer().required(),
  winner: Joi.string().valid('A','B').required(),
  proof_url: Joi.string().uri().required()
});

const resultConfirmSchema = Joi.object({
  match_id: Joi.number().integer().required(),
  confirm: Joi.boolean().valid(true).required()
});

function createRouter(deps) {
  const { pool } = deps;
  const ch = (deps && deps.challonge) ? deps.challonge : challonge;
  const adminOnly = deps && typeof deps.adminOnly === 'function' ? deps.adminOnly : (req, res, next) => next();
  const router = express.Router();

  // Helpers

  async function mapParticipantIdsToTeamMeta(ids) {
    if (!ids || ids.length === 0) return {};
    const unique = Array.from(new Set(ids.map(String)));
    const placeholders = unique.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT id, name, captain_discord_id, challonge_participant_id FROM teams WHERE challonge_participant_id IN (${placeholders})`,
      unique
    );
    const map = {};
    for (const r of rows) {
      map[String(r.challonge_participant_id)] = { teamId: r.id, name: r.name, captain: r.captain_discord_id };
    }
    return map;
  }

  async function generateByesImpl(value) {
    const createdR1 = [];
    // Round 1 among other teams
    for (let i = 0; i < value.other_team_names.length; i += 2) {
      const team_a = value.other_team_names[i];
      const team_b = value.other_team_names[i + 1];
      const when = new Date(new Date(value.r1_start_time).getTime() + (createdR1.length * (value.interval_minutes * 60_000)));
      const iso = when.toISOString();
      const [r] = await pool.query('INSERT INTO matches (team_a, team_b, round, time) VALUES (?, ?, ?, ?)', [team_a, team_b, value.round1_label, iso]);
      createdR1.push({ id: r.insertId, team_a, team_b, round: value.round1_label, time: iso });
    }
    const createdR2 = [];
    for (let i = 0; i < value.bye_team_names.length; i++) {
      const team_a = value.bye_team_names[i];
      const placeholder = `Winner of Match #${createdR1[i].id}`;
      const when = new Date(new Date(value.r2_start_time).getTime() + (createdR2.length * (value.interval_minutes * 60_000)));
      const iso = when.toISOString();
      const [r] = await pool.query('INSERT INTO matches (team_a, team_b, round, time) VALUES (?, ?, ?, ?)', [team_a, placeholder, value.round2_label, iso]);
      createdR2.push({ id: r.insertId, team_a, team_b: placeholder, round: value.round2_label, time: iso });
    }
    return { round1: createdR1, round2: createdR2 };
  }

  router.post('/register/player', async (req, res) => {
    const { error, value } = playerSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    const { name, ign, discord_id, riot_id, eligibility_doc } = value;
    try {
      const [result] = await pool.query(
        'INSERT INTO players (name, ign, discord_id, riot_id, eligibility_doc) VALUES (?, ?, ?, ?, ?)',
        [name, ign, discord_id, riot_id, eligibility_doc || null]
      );
      return res.status(201).json({ id: result.insertId, status: 'pending' });
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Player with same Discord ID or Riot ID already exists' });
      }
      console.error('Register player error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/register/team', async (req, res) => {
    const { error, value } = teamSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    const { name, logo, captain_discord_id, players } = value;
    try {
      let participantId = null;
      try {
        const part = await ch.createParticipant(name);
        participantId = String(part.id);
      } catch (e) {
        console.error('Challonge participant create failed', e);
      }
      const [result] = await pool.query(
        'INSERT INTO teams (name, logo, captain_discord_id, players_json, challonge_participant_id) VALUES (?, ?, ?, ?, ?)',
        [name, logo || null, captain_discord_id, JSON.stringify(players), participantId]
      );
      return res.status(201).json({ id: result.insertId, challonge_participant_id: participantId });
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Team name already exists' });
      }
      console.error('Register team error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // List teams (basic info)
  router.get('/teams', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT id, name, logo, captain_discord_id, players_json FROM teams ORDER BY id DESC LIMIT 200');
      return res.json(rows);
    } catch (err) {
      console.error('List teams error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/matches/create', async (req, res) => {
    return res.status(410).json({ error: 'Deprecated: Use Challonge to generate matches' });
  });

  router.get('/matches/upcoming', async (req, res) => {
     try {
      const ms = await ch.listMatches();
      const pending = ms.filter(m => !m.winner_id);
      const ids = [];
      for (const m of pending) { if (m.player1_id) ids.push(String(m.player1_id)); if (m.player2_id) ids.push(String(m.player2_id)); }
      const teamMap = await mapParticipantIdsToTeamMeta(ids);
      const mapped = pending.map(m => ({
        id: Number(m.id),
        team_a: teamMap[String(m.player1_id)]?.name || String(m.player1_id || ''),
        team_b: teamMap[String(m.player2_id)]?.name || String(m.player2_id || ''),
        round: m.round,
        time: m.scheduled_time || m.started_at || null,
        status: 'pending'
      }));
      return res.json(mapped);
    } catch (err) {
      console.error('List upcoming matches error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Players admin: list pending
  router.get('/players/pending', adminOnly, async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT id, name, ign, discord_id, riot_id, eligibility_doc, status FROM players WHERE status = 'pending' ORDER BY id ASC LIMIT 200");
      return res.json(rows);
    } catch (err) {
      console.error('List pending players error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/players/approve', adminOnly, async (req, res) => {
    const schema = Joi.object({ id: Joi.number().required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    try {
      const [r] = await pool.query("UPDATE players SET status = 'approved' WHERE id = ?", [value.id]);
      if (r.affectedRows === 0) return res.status(404).json({ error: 'Player not found' });
      return res.json({ ok: true });
    } catch (err) {
      console.error('Approve player error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/players/reject', adminOnly, async (req, res) => {
    const schema = Joi.object({ id: Joi.number().required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    try {
      const [r] = await pool.query("UPDATE players SET status = 'rejected' WHERE id = ?", [value.id]);
      if (r.affectedRows === 0) return res.status(404).json({ error: 'Player not found' });
      return res.json({ ok: true });
    } catch (err) {
      console.error('Reject player error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Generate matches: random pairings
  router.post('/matches/generate', adminOnly, async (req, res) => {
    const schema = Joi.object({
      team_names: Joi.array().items(Joi.string()).min(2).required(),
      round: Joi.string().required(),
      start_time: Joi.date().iso().required(),
      interval_minutes: Joi.number().integer().min(5).default(60)
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    const { team_names } = value;
    // Shuffle
    const shuffled = [...team_names].sort(() => Math.random() - 0.5);
    const created = [];
    try {
      for (let i = 0; i < shuffled.length; i += 2) {
        if (i + 1 >= shuffled.length) break;
        const team_a = shuffled[i];
        const team_b = shuffled[i + 1];
        const when = new Date(new Date(value.start_time).getTime() + (created.length * (value.interval_minutes * 60_000)));
        const iso = when.toISOString();
        const [r] = await pool.query('INSERT INTO matches (team_a, team_b, round, time) VALUES (?, ?, ?, ?)', [team_a, team_b, value.round, iso]);
        created.push({ id: r.insertId, team_a, team_b, round: value.round, time: iso });
      }
      try { req.app.get('io')?.emit('matches_generated', created); } catch (_) {}
      return res.status(201).json({ matches: created });
    } catch (err) {
      console.error('Generate matches error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Bracket: JSON by default; HTML UI when browser requests text/html
  router.get('/bracket', async (req, res) => {
    try {
      const ms = await ch.listMatches();
      return res.json(ms);
    } catch (err) {
      console.error('Bracket error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Seed 12 mock teams
  // Removed mock12 seeding endpoint to avoid file-kept mock data

  // Convenience GET for seeding via browser
  // Removed mock12 convenience GET

  // Generate seeded bracket with 12 teams (4 byes)
  router.post('/matches/generate/byes', adminOnly, async (req, res) => {
    return res.status(410).json({ error: 'Use Challonge seeding/byes' });
  });

  // Removed legacy default /matches/generate/byes GET that used old mock teams

  // Deprecated: valorant mock generator moved to SQL seed
  router.post('/matches/generate/valorant', adminOnly, async (req, res) => {
    return res.status(410).json({ error: 'Moved to SQL seed. Apply backend/SQL_SCHEMA.sql to load mock data.' });
  });

  router.get('/matches/generate/valorant', async (req, res) => {
    return res.status(410).json({ error: 'Moved to SQL seed. Apply backend/SQL_SCHEMA.sql to load mock data.' });
  });

  // Admin: attach local schedule to a Challonge match (metadata only)
  router.post('/matches/schedule', adminOnly, async (req, res) => {
    const schema = Joi.object({ match_id: Joi.alternatives(Joi.number().integer(), Joi.string()).required(), time: Joi.date().iso().required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    const iso = new Date(value.time).toISOString();
    try {
      await pool.query('INSERT INTO matches (challonge_match_id, time) VALUES (?, ?) ON DUPLICATE KEY UPDATE time = VALUES(time)', [String(value.match_id), iso]);
      return res.json({ ok: true, match_id: String(value.match_id), time: iso });
    } catch (err) {
      console.error('schedule set error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/matches/result', async (req, res) => {
     const { error, value } = resultSubmitSchema.validate(req.body);
     if (error) return res.status(400).json({ error: error.details[0].message });
     const { match_id, winner, proof_url } = value;
     try {
      await pool.query(
        'INSERT INTO matches (challonge_match_id, result, status, proof_url_a, proof_url_b) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE result = VALUES(result), status = VALUES(status), proof_url_a = IF(VALUES(result)="A", VALUES(proof_url_a), proof_url_a), proof_url_b = IF(VALUES(result)="B", VALUES(proof_url_b), proof_url_b)',
        [String(match_id), winner, 'awaiting_proof', winner === 'A' ? proof_url : null, winner === 'B' ? proof_url : null]
      );
      return res.json({ ok: true });
    } catch (err) {
      console.error('Submit result error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/matches/confirm', async (req, res) => {
     const { error, value } = resultConfirmSchema.validate(req.body);
     if (error) return res.status(400).json({ error: error.details[0].message });
     const { match_id } = value;
     try {
      const [[row]] = await pool.query('SELECT result FROM matches WHERE challonge_match_id = ? OR id = ?', [String(match_id), Number(match_id)]);
      if (!row || !row.result) return res.status(400).json({ error: 'No submitted result to confirm' });
      await ch.submitMatchResultByWinnerSide(match_id, row.result);
      await pool.query('UPDATE matches SET status = "completed" WHERE challonge_match_id = ? OR id = ?', [String(match_id), Number(match_id)]);
      try { req.app.get('io')?.emit('match_confirmed', { id: Number(match_id), result: row.result }); } catch (_) {}
      return res.json({ ok: true, result: row.result });
    } catch (err) {
      console.error('Confirm result error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Proof image URL submission from bot per team
  router.post('/matches/proof', async (req, res) => {
    const schema = Joi.object({ match_id: Joi.number().required(), team: Joi.string().valid('A','B').required(), proof_url: Joi.string().uri().required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    const { match_id, team, proof_url } = value;
    try {
      const isA = team === 'A';
      await pool.query(
        'INSERT INTO matches (challonge_match_id, status, proof_url_a, proof_url_b) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status), proof_url_a = IF(?, VALUES(proof_url_a), proof_url_a), proof_url_b = IF(?, VALUES(proof_url_b), proof_url_b)',
        [String(match_id), 'awaiting_proof', isA ? proof_url : null, !isA ? proof_url : null, isA, !isA]
      );
      return res.json({ ok: true });
    } catch (err) {
      console.error('Submit proof error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Store result channel binding
  router.post('/matches/result-channel', async (req, res) => {
    const schema = Joi.object({ match_id: Joi.number().required(), channel_id: Joi.string().required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    try {
      await pool.query('INSERT INTO matches (challonge_match_id, result_channel_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE result_channel_id = VALUES(result_channel_id)', [String(value.match_id), value.channel_id]);
      return res.json({ ok: true });
    } catch (err) {
      console.error('Bind result channel error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Matches awaiting proof after scheduled time, no result channel yet
  router.get('/matches/awaiting-proof', async (req, res) => {
    try {
      const ms = await ch.listMatches();
      const pending = ms.filter(m => !m.winner_id);
      const [binds] = await pool.query('SELECT challonge_match_id, result_channel_id FROM matches WHERE result_channel_id IS NOT NULL');
      const bound = new Set((binds || []).map(b => String(b.challonge_match_id)));
      const now = Date.now();
      const ids = [];
      for (const m of pending) { if (m.player1_id) ids.push(String(m.player1_id)); if (m.player2_id) ids.push(String(m.player2_id)); }
      const teamMap = await mapParticipantIdsToTeamMeta(ids);
      const rows = pending
        .filter(m => !bound.has(String(m.id)))
        .filter(m => {
          const ts = Date.parse(m.scheduled_time || m.started_at || 0);
          return Number.isFinite(ts) && ts <= now;
        })
        .map(m => ({
          id: Number(m.id),
          team_a: teamMap[String(m.player1_id)]?.name || String(m.player1_id || ''),
          team_b: teamMap[String(m.player2_id)]?.name || String(m.player2_id || ''),
          time: m.scheduled_time || m.started_at || null,
          captain_a: teamMap[String(m.player1_id)]?.captain || null,
          captain_b: teamMap[String(m.player2_id)]?.captain || null
        }));
      return res.json(rows);
    } catch (err) {
      console.error('awaiting-proof error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Lookup by channel for bot to map submissions
  router.get('/matches/by-channel/:channelId', async (req, res) => {
    try {
      const channelId = req.params.channelId;
      const [[row]] = await pool.query('SELECT challonge_match_id, proof_url_a, proof_url_b, status FROM matches WHERE result_channel_id = ? LIMIT 1', [channelId]);
      if (!row) return res.status(404).json({ error: 'Not found' });
      const m = await ch.getMatch(row.challonge_match_id);
      const teamMap = await mapParticipantIdsToTeamMeta([String(m.player1_id), String(m.player2_id)]);
      return res.json({
        id: Number(m.id),
        team_a: teamMap[String(m.player1_id)]?.name || String(m.player1_id || ''),
        team_b: teamMap[String(m.player2_id)]?.name || String(m.player2_id || ''),
        captain_a: teamMap[String(m.player1_id)]?.captain || null,
        captain_b: teamMap[String(m.player2_id)]?.captain || null,
        proof_url_a: row.proof_url_a || null,
        proof_url_b: row.proof_url_b || null,
        status: row.status
      });
    } catch (err) {
      console.error('by-channel error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/seed/valorant/prebaked', async (req, res) => {
    return res.status(410).json({ error: 'Moved to SQL seed. Apply backend/SQL_SCHEMA.sql to load mock data.' });
  });

  // Substitution submit
  router.post('/substitution', async (req, res) => {
    const schema = Joi.object({ team_id: Joi.number().required(), old_player: Joi.string().required(), new_player: Joi.string().required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    try {
      const [r] = await pool.query('INSERT INTO substitutions (team_id, old_player, new_player) VALUES (?, ?, ?)', [value.team_id, value.old_player, value.new_player]);
      return res.status(201).json({ id: r.insertId, status: 'pending' });
    } catch (err) {
      console.error('substitution submit error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Approve substitution: update team players_json and set status
  router.post('/substitution/approve', async (req, res) => {
    const schema = Joi.object({ id: Joi.number().required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    try {
      const [[sub]] = await pool.query('SELECT * FROM substitutions WHERE id = ?', [value.id]);
      if (!sub) return res.status(404).json({ error: 'Substitution not found' });
      const [[team]] = await pool.query('SELECT id, players_json FROM teams WHERE id = ?', [sub.team_id]);
      if (!team) return res.status(404).json({ error: 'Team not found' });
      let roster = [];
      try { roster = JSON.parse(team.players_json); } catch (_) {}
      const idx = roster.findIndex(p => p === sub.old_player);
      if (idx === -1) return res.status(400).json({ error: 'Old player not in roster' });
      roster[idx] = sub.new_player;
      await pool.query('UPDATE teams SET players_json = ? WHERE id = ?', [JSON.stringify(roster), team.id]);
      await pool.query("UPDATE substitutions SET status = 'approved' WHERE id = ?", [sub.id]);
      return res.json({ ok: true, roster });
    } catch (err) {
      console.error('substitution approve error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Reject substitution
  router.post('/substitution/reject', async (req, res) => {
    const schema = Joi.object({ id: Joi.number().required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    try {
      await pool.query("UPDATE substitutions SET status = 'rejected' WHERE id = ?", [value.id]);
      return res.json({ ok: true });
    } catch (err) {
      console.error('substitution reject error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

module.exports = createRouter;


