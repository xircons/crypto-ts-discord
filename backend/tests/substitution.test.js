const request = require('supertest');
const express = require('express');
const createRouter = require('../src/routes');

function createMockApp() {
  const app = express();
  app.use(express.json());
  const subs = [];
  const teams = [{ id: 1, players_json: JSON.stringify(['111','222','333']) }];
  let subId = 1;
  const pool = {
    async query(sql, params) {
      if (/INSERT INTO substitutions/i.test(sql)) {
        const [team_id, old_player, new_player] = params;
        const sub = { id: subId++, team_id, old_player, new_player, status: 'pending' };
        subs.push(sub);
        return [{ insertId: sub.id }];
      }
      if (/SELECT \* FROM substitutions WHERE id = \?/i.test(sql)) {
        const [id] = params;
        const s = subs.find(x => x.id === id);
        return [[s]];
      }
      if (/SELECT id, players_json FROM teams WHERE id = \?/i.test(sql)) {
        const [id] = params;
        const t = teams.find(x => x.id === id);
        return [[t]];
      }
      if (/UPDATE teams SET players_json = \?/i.test(sql)) {
        const [players_json, id] = params;
        const t = teams.find(x => x.id === id);
        if (t) t.players_json = players_json;
        return [{}];
      }
      if (/UPDATE substitutions SET status = 'approved'/i.test(sql)) {
        const [id] = params;
        const s = subs.find(x => x.id === id);
        if (s) s.status = 'approved';
        return [{}];
      }
      if (/UPDATE substitutions SET status = 'rejected'/i.test(sql)) {
        const [id] = params;
        const s = subs.find(x => x.id === id);
        if (s) s.status = 'rejected';
        return [{}];
      }
      throw new Error('Unknown SQL');
    }
  };
  app.use('/', createRouter({ pool }));
  return app;
}

describe('substitutions', () => {
  const app = createMockApp();
  let createdId;
  it('submits substitution', async () => {
    const res = await request(app).post('/substitution').send({ team_id: 1, old_player: '222', new_player: '444' });
    expect(res.statusCode).toBe(201);
    createdId = res.body.id;
  });
  it('approves and updates roster', async () => {
    const res = await request(app).post('/substitution/approve').send({ id: createdId });
    expect(res.statusCode).toBe(200);
    expect(res.body.roster.includes('444')).toBe(true);
  });
  it('rejects', async () => {
    const res = await request(app).post('/substitution/reject').send({ id: createdId });
    expect(res.statusCode).toBe(200);
  });
});


