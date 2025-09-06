const express = require('express');
const Joi = require('joi');

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
  const adminOnly = deps && typeof deps.adminOnly === 'function' ? deps.adminOnly : (req, res, next) => next();
  const router = express.Router();

  // Helpers

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
      const [result] = await pool.query(
        'INSERT INTO teams (name, logo, captain_discord_id, players_json) VALUES (?, ?, ?, ?)',
        [name, logo || null, captain_discord_id, JSON.stringify(players)]
      );
      return res.status(201).json({ id: result.insertId });
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
    const { error, value } = matchCreateSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    const { team_a, team_b, round, time } = value;
    try {
      const iso = new Date(time).toISOString();
      const [result] = await pool.query(
        'INSERT INTO matches (team_a, team_b, round, time) VALUES (?, ?, ?, ?)',
        [team_a, team_b, round, iso]
      );
      try { req.app.get('io')?.emit('match_created', { id: result.insertId, team_a, team_b, round, time: iso }); } catch (_) {}
      return res.status(201).json({ id: result.insertId });
    } catch (err) {
      console.error('Create match error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/matches/upcoming', async (req, res) => {
    try {
      const [rows] = await pool.query(
        'SELECT id, team_a, team_b, round, DATE_FORMAT(time, \"%Y-%m-%dT%H:%i:%sZ\") as time, status, result, proof_url FROM matches WHERE status = \"scheduled\" AND time >= UTC_TIMESTAMP() ORDER BY time ASC LIMIT 50'
      );
      return res.json(rows.map(r => ({ ...r, time: r.time })));
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
      const [rows] = await pool.query('SELECT id, team_a, team_b, round, DATE_FORMAT(time, "%Y-%m-%dT%H:%i:%sZ") as time, status, result FROM matches ORDER BY time ASC');
      const rounds = {};
      for (const m of rows) {
        rounds[m.round] = rounds[m.round] || [];
        rounds[m.round].push(m);
      }
      const accept = String(req.get('accept') || '');
      const wantsHtml = accept.includes('text/html');
      if (!wantsHtml) return res.json(rounds);

      // HTML renderer
      const stageOrder = [
        'รอบคัดเลือก / Qualification',
        'รอบ 8 ทีม / Quarterfinals',
        'Semifinals',
        'Finals'
      ];
      const ordered = stageOrder.filter(k => rounds[k]).map(k => [k, rounds[k]]);
      const fmtDateTH = (iso) => {
        try {
          const d = new Date(iso);
          const p = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: '2-digit' }).format(d);
          return p;
        } catch { return iso; }
      };
      const fmtTimeTH = (iso) => {
        try {
          const d = new Date(iso);
          const p = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
          return p;
        } catch { return iso; }
      };
      const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const colHtml = ordered.map(([label, matches], idx) => {
        const day = matches[0] ? fmtDateTH(matches[0].time) : '';
        const cards = matches.map((m, i) => {
          const isAWin = m.result === 'A';
          const isBWin = m.result === 'B';
          const scoreA = isAWin ? '2' : (isBWin ? '0' : '');
          const scoreB = isBWin ? '2' : (isAWin ? '0' : '');
          return `
            <div class="card">
              <div class="header">#${esc(m.id)} <span>${esc(fmtTimeTH(m.time))}</span></div>
              <div class="row ${isAWin ? 'win' : ''}">
                <span class="name">${esc(m.team_a)}</span>
                <span class="score">${esc(scoreA)}</span>
              </div>
              <div class="row ${isBWin ? 'win' : ''}">
                <span class="name">${esc(m.team_b)}</span>
                <span class="score">${esc(scoreB)}</span>
              </div>
            </div>`;
        }).join('');
        return `
          <section class="column">
            <div class="stage">
              <div class="title">${esc(label)}</div>
              <div class="date">${esc(day)}</div>
            </div>
            ${cards}
          </section>`;
      }).join('');

      const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Valorant Bracket</title>
    <style>
      :root { --bg:#0e1116; --panel:#1a1f29; --muted:#8b94a7; --text:#e8ecf1; --accent:#ff4655; --ok:#32d583; }
      *{ box-sizing:border-box; }
      body{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, 'Helvetica Neue', Arial, 'Apple Color Emoji','Segoe UI Emoji'; background:var(--bg); color:var(--text); }
      header{ padding:16px 24px; border-bottom:1px solid #242b38; display:flex; align-items:center; gap:12px; }
      header .badge{ background:var(--accent); color:white; padding:4px 8px; border-radius:6px; font-weight:700; }
      main{ padding:20px; overflow:auto; }
      .grid{ display:flex; gap:24px; min-width: 900px; }
      .column{ min-width: 260px; }
      .stage{ background:linear-gradient(180deg,#202736,#171c26); border:1px solid #2a3243; border-radius:10px; padding:12px 14px; margin-bottom:10px; }
      .stage .title{ font-weight:800; letter-spacing: .3px; }
      .stage .date{ color:var(--muted); font-size:12px; margin-top:4px; display:flex; align-items:center; gap:6px; }
      .card{ background:var(--panel); border:1px solid #2a3243; border-radius:12px; padding:10px 12px; margin-bottom:12px; box-shadow: 0 2px 0 rgba(0,0,0,.25); }
      .card .header{ font-size:12px; color:var(--muted); display:flex; justify-content:space-between; margin-bottom:6px; }
      .row{ display:flex; justify-content:space-between; align-items:center; padding:8px; border-radius:8px; }
      .row.win{ background: rgba(50,213,131,0.08); }
      .row + .row{ margin-top:4px; }
      .name{ max-width: 78%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .score{ width:24px; text-align:right; font-weight:800; }
      footer{ padding:16px 24px; color:var(--muted); font-size:12px; }
    </style>
  </head>
  <body>
    <header>
      <span class="badge">VALORANT</span>
      <div>Bracket</div>
    </header>
    <main>
      <div class="grid">${colHtml}</div>
    </main>
    <footer>Auto-generated · Open-source bracket UI</footer>
  </body>
</html>`;
      res.set('content-type', 'text/html; charset=utf-8');
      return res.send(html);
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
    const schema = Joi.object({
      bye_team_names: Joi.array().items(Joi.string()).length(4).required(),
      other_team_names: Joi.array().items(Joi.string()).length(8).required(),
      round1_label: Joi.string().default('Round 1'),
      round2_label: Joi.string().default('Round 2'),
      r1_start_time: Joi.date().iso().required(),
      r2_start_time: Joi.date().iso().required(),
      interval_minutes: Joi.number().integer().min(5).default(60)
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    try {
      const { round1, round2 } = await generateByesImpl(value);
      try { req.app.get('io')?.emit('matches_generated', [...round1, ...round2]); } catch (_) {}
      return res.status(201).json({ round1, round2 });
    } catch (err) {
      console.error('generate byes error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Removed legacy default /matches/generate/byes GET that used old mock teams

  // Deprecated: valorant mock generator moved to SQL seed
  router.post('/matches/generate/valorant', adminOnly, async (req, res) => {
    return res.status(410).json({ error: 'Moved to SQL seed. Apply backend/SQL_SCHEMA.sql to load mock data.' });
  });

  router.get('/matches/generate/valorant', async (req, res) => {
    return res.status(410).json({ error: 'Moved to SQL seed. Apply backend/SQL_SCHEMA.sql to load mock data.' });
  });

  router.post('/matches/result', async (req, res) => {
    const { error, value } = resultSubmitSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    const { match_id, winner, proof_url } = value;
    try {
      const [r] = await pool.query('UPDATE matches SET result = ?, status = \"pending_review\" WHERE id = ?', [winner, match_id]);
      if (r.affectedRows === 0) return res.status(404).json({ error: 'Match not found' });
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
      const [rows] = await pool.query('SELECT result FROM matches WHERE id = ?', [match_id]);
      if (!rows || rows.length === 0) return res.status(404).json({ error: 'Match not found' });
      if (!rows[0].result) return res.status(400).json({ error: 'No submitted result to confirm' });
      await pool.query('UPDATE matches SET status = \"completed\" WHERE id = ?', [match_id]);
      try { req.app.get('io')?.emit('match_confirmed', { id: match_id, result: rows[0].result }); } catch (_) {}
      return res.json({ ok: true, result: rows[0].result });
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
    const column = team === 'A' ? 'proof_url_a' : 'proof_url_b';
    try {
      const [r] = await pool.query(`UPDATE matches SET ${column} = ?, status = \"pending_review\" WHERE id = ?`, [proof_url, match_id]);
      if (r.affectedRows === 0) return res.status(404).json({ error: 'Match not found' });
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
      const [r] = await pool.query('UPDATE matches SET result_channel_id = ? WHERE id = ?', [value.channel_id, value.match_id]);
      if (r.affectedRows === 0) return res.status(404).json({ error: 'Match not found' });
      return res.json({ ok: true });
    } catch (err) {
      console.error('Bind result channel error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Matches awaiting proof after scheduled time, no result channel yet
  router.get('/matches/awaiting-proof', async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT m.id, m.team_a, m.team_b, DATE_FORMAT(m.time, "%Y-%m-%dT%H:%i:%sZ") as time,
                ta.captain_discord_id AS captain_a, tb.captain_discord_id AS captain_b
         FROM matches m
         LEFT JOIN teams ta ON ta.name = m.team_a
         LEFT JOIN teams tb ON tb.name = m.team_b
         WHERE m.result_channel_id IS NULL AND m.time <= UTC_TIMESTAMP() AND m.status IN ("scheduled","pending_review")
         ORDER BY m.time DESC
         LIMIT 50`
      );
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
      const [rows] = await pool.query(
        `SELECT m.id, m.team_a, m.team_b, ta.captain_discord_id AS captain_a, tb.captain_discord_id AS captain_b,
                m.proof_url_a, m.proof_url_b, m.status
         FROM matches m
         LEFT JOIN teams ta ON ta.name = m.team_a
         LEFT JOIN teams tb ON tb.name = m.team_b
         WHERE m.result_channel_id = ?
         LIMIT 1`,
        [channelId]
      );
      if (!rows || rows.length === 0) return res.status(404).json({ error: 'Not found' });
      return res.json(rows[0]);
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


