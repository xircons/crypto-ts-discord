const request = require('supertest');
const express = require('express');
const createRouter = require('../src/routes');

function createMockApp() {
  const app = express();
  app.use(express.json());
  const players = [];
  let idCounter = 1;
  const pool = {
    async query(sql, params) {
      if (/^INSERT INTO players/i.test(sql)) {
        const [name, ign, discord_id, riot_id, eligibility_doc] = params;
        if (players.find(p => p.discord_id === discord_id) || players.find(p => p.riot_id === riot_id)) {
          const err = new Error('Duplicate');
          err.code = 'ER_DUP_ENTRY';
          throw err;
        }
        const newPlayer = { id: idCounter++, name, ign, discord_id, riot_id, eligibility_doc: eligibility_doc || null, status: 'pending' };
        players.push(newPlayer);
        return [{ insertId: newPlayer.id }];
      }
      throw new Error('Unknown SQL in mock');
    }
  };
  app.use('/', createRouter({ pool }));
  return app;
}

describe('POST /register/player', () => {
  const app = createMockApp();

  const validBody = {
    name: 'John Doe',
    ign: 'JD#1234',
    discord_id: '123456789012345678',
    riot_id: 'JohnDoe#NA1',
    eligibility_doc: 'https://example.com/proof.png'
  };

  it('creates a player and returns 201', async () => {
    const res = await request(app).post('/register/player').send(validBody);
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.status).toBe('pending');
  });

  it('rejects duplicate discord_id', async () => {
    const res = await request(app).post('/register/player').send({ ...validBody, riot_id: 'Another#NA1' });
    expect(res.statusCode).toBe(409);
  });

  it('rejects invalid body', async () => {
    const res = await request(app).post('/register/player').send({ name: 'A' });
    expect(res.statusCode).toBe(400);
  });
});


