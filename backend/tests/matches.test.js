const request = require('supertest');
const express = require('express');
const createRouter = require('../src/routes');

function createMockApp() {
  const app = express();
  app.use(express.json());
  const pool = {
    async query(sql, params) {
      if (/INSERT INTO matches \(challonge_match_id, time\)/i.test(sql) || /ON DUPLICATE KEY UPDATE time/i.test(sql)) {
        return [{}];
      }
      return [[]];
    }
  };
  const challonge = {
    async listMatches() {
      return [
        { id: 101, player1_id: 'p1', player2_id: 'p2', round: 1, scheduled_time: new Date(Date.now() + 3600_000).toISOString() },
        { id: 102, player1_id: 'p3', player2_id: 'p4', round: 1, scheduled_time: new Date(Date.now() + 7200_000).toISOString() }
      ];
    }
  };
  app.use('/', createRouter({ pool, challonge }));
  return app;
}

describe('matches endpoints (Challonge)', () => {
  const app = createMockApp();

  it('lists upcoming matches from Challonge', async () => {
    const res = await request(app).get('/matches/upcoming');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('id');
    expect(res.body[0]).toHaveProperty('round');
  });

  it('stores local schedule metadata', async () => {
    const when = new Date(Date.now() + 3600_000).toISOString();
    const res = await request(app).post('/matches/schedule').send({ match_id: '101', time: when });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});


