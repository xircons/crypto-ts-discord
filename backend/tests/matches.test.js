const request = require('supertest');
const express = require('express');
const createRouter = require('../src/routes');

function createMockApp() {
  const app = express();
  app.use(express.json());
  const matches = [];
  let idCounter = 1;
  const pool = {
    async query(sql, params) {
      if (/^INSERT INTO matches/i.test(sql)) {
        const [team_a, team_b, round, time] = params;
        const m = { id: idCounter++, team_a, team_b, round, time: new Date(time), status: 'scheduled' };
        matches.push(m);
        return [{ insertId: m.id }];
      }
      if (/SELECT id, team_a, team_b, round, DATE_FORMAT\(time/i.test(sql)) {
        const rows = matches
          .filter(m => m.status === 'scheduled' && m.time >= new Date())
          .sort((a,b)=>a.time-b.time)
          .map(m => ({
            id: m.id,
            team_a: m.team_a,
            team_b: m.team_b,
            round: m.round,
            time: new Date(m.time).toISOString(),
            status: m.status,
            result: null,
            proof_url: null
          }));
        return [rows];
      }
      throw new Error('Unknown SQL');
    }
  };
  app.use('/', createRouter({ pool }));
  return app;
}

describe('matches endpoints', () => {
  const app = createMockApp();
  it('creates a match', async () => {
    const res = await request(app).post('/matches/create').send({
      team_a: 'Team A',
      team_b: 'Team B',
      round: 'Quarterfinal',
      time: new Date(Date.now() + 3600_000).toISOString()
    });
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('lists upcoming matches', async () => {
    const res = await request(app).get('/matches/upcoming');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});


