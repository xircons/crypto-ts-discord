const request = require('supertest');
const express = require('express');
const createRouter = require('../src/routes');

function createMockApp() {
  const app = express();
  app.use(express.json());
  const local = { resultById: {} };
  const pool = {
    async query(sql, params) {
      if (/INSERT INTO matches \(challonge_match_id, result, status, proof_url_a, proof_url_b\)/i.test(sql)) {
        const [mid, winner] = params;
        local.resultById[String(mid)] = winner;
        return [{}];
      }
      if (/SELECT result FROM matches WHERE challonge_match_id/i.test(sql)) {
        const [mid] = params;
        const r = local.resultById[String(mid)] || null;
        return [[r ? { result: r } : undefined].filter(Boolean)];
      }
      if (/UPDATE matches SET status = \"completed\"/i.test(sql)) {
        return [{}];
      }
      return [[]];
    }
  };
  const challonge = {
    async submitMatchResultByWinnerSide(matchId, side) { return { id: matchId, side }; }
  };
  app.use('/', createRouter({ pool, challonge }));
  return app;
}

describe('match results (Challonge)', () => {
  const app = createMockApp();
  it('submits a result and stores awaiting_proof', async () => {
    const res = await request(app).post('/matches/result').send({ match_id: 1, winner: 'A', proof_url: 'https://x/p.png' });
    expect(res.statusCode).toBe(200);
  });
  it('confirms a result and syncs Challonge', async () => {
    const res = await request(app).post('/matches/confirm').send({ match_id: 1, confirm: true });
    expect(res.statusCode).toBe(200);
    expect(res.body.result).toBe('A');
  });
});


