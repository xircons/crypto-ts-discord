const request = require('supertest');
const express = require('express');
const createRouter = require('../src/routes');

function createMockApp() {
  const app = express();
  app.use(express.json());
  const players = [
    { id: 1, name: 'P1', ign: 'P1#1', discord_id: '1', riot_id: 'r1', status: 'pending' },
    { id: 2, name: 'P2', ign: 'P2#2', discord_id: '2', riot_id: 'r2', status: 'pending' }
  ];
  const matches = [];
  const pool = {
    async query(sql, params) {
      if (/FROM players WHERE status = 'pending'/i.test(sql)) {
        return [players.filter(p => p.status === 'pending')];
      }
      if (/UPDATE players SET status = 'approved'/i.test(sql)) {
        const [id] = params;
        const p = players.find(x => x.id === id); if (p) p.status = 'approved';
        return [{ affectedRows: p ? 1 : 0 }];
      }
      if (/UPDATE players SET status = 'rejected'/i.test(sql)) {
        const [id] = params;
        const p = players.find(x => x.id === id); if (p) p.status = 'rejected';
        return [{ affectedRows: p ? 1 : 0 }];
      }
      if (/INSERT INTO matches \(team_a, team_b, round, time\)/i.test(sql)) {
        const [team_a, team_b, round, time] = params;
        const id = matches.length + 1;
        matches.push({ id, team_a, team_b, round, time });
        return [{ insertId: id }];
      }
      if (/SELECT id, team_a, team_b, round, DATE_FORMAT\(time/i.test(sql)) {
        return [matches];
      }
      throw new Error('Unknown SQL');
    }
  };
  app.use('/', createRouter({ pool }));
  return app;
}

describe('admin', () => {
  const app = createMockApp();
  it('lists pending players', async () => {
    const res = await request(app).get('/players/pending');
    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });
  it('approves a player', async () => {
    const res = await request(app).post('/players/approve').send({ id: 1 });
    expect(res.statusCode).toBe(200);
  });
  it('generates matches', async () => {
    const res = await request(app).post('/matches/generate').send({ team_names: ['A','B','C','D'], round: 'R1', start_time: new Date().toISOString(), interval_minutes: 60 });
    expect(res.statusCode).toBe(201);
    expect(res.body.matches.length).toBe(2);
  });
  it('returns bracket', async () => {
    const res = await request(app).get('/bracket');
    expect(res.statusCode).toBe(200);
  });
});


