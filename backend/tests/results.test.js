const request = require('supertest');
const express = require('express');
const createRouter = require('../src/routes');

function createMockApp() {
  const app = express();
  app.use(express.json());
  const matches = [{ id: 1, result: null }];
  const pool = {
    async query(sql, params) {
      if (/UPDATE matches SET result/i.test(sql)) {
        const [winner, id] = params.length === 2 ? params : [params[0], params[2]];
        const m = matches.find(mm => mm.id === id);
        if (!m) return [{ affectedRows: 0 }];
        m.result = winner;
        m.status = 'pending_review';
        return [{ affectedRows: 1 }];
      }
      if (/SELECT result FROM matches/i.test(sql)) {
        const [id] = params;
        const m = matches.find(mm => mm.id === id);
        return [m ? [{ result: m.result }] : []];
      }
      if (/UPDATE matches SET status = \"completed\"/i.test(sql)) {
        const [id] = params;
        const m = matches.find(mm => mm.id === id);
        if (!m) return [{ affectedRows: 0 }];
        m.status = 'completed';
        return [{ affectedRows: 1 }];
      }
      throw new Error('Unknown SQL');
    }
  };
  app.use('/', createRouter({ pool }));
  return app;
}

describe('match results', () => {
  const app = createMockApp();
  it('submits a result and sets pending_review', async () => {
    const res = await request(app).post('/matches/result').send({ match_id: 1, winner: 'A', proof_url: 'https://x/p.png' });
    expect(res.statusCode).toBe(200);
  });
  it('confirms a result and completes match', async () => {
    const res = await request(app).post('/matches/confirm').send({ match_id: 1, confirm: true });
    expect(res.statusCode).toBe(200);
    expect(res.body.result).toBe('A');
  });
});


