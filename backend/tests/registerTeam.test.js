const request = require('supertest');
const express = require('express');
const createRouter = require('../src/routes');

function createMockApp() {
  const app = express();
  app.use(express.json());
  const teams = [];
  let idCounter = 1;
  const pool = {
    async query(sql, params) {
      if (/^INSERT INTO teams/i.test(sql)) {
        const [name, logo, captain_discord_id, players_json] = params;
        if (teams.find(t => t.name.toLowerCase() === String(name).toLowerCase())) {
          const err = new Error('Duplicate');
          err.code = 'ER_DUP_ENTRY';
          throw err;
        }
        const newTeam = {
          id: idCounter++,
          name,
          logo: logo || null,
          captain_discord_id,
          players: JSON.parse(players_json)
        };
        teams.push(newTeam);
        return [{ insertId: newTeam.id }];
      }
      throw new Error('Unknown SQL in mock');
    }
  };
  app.use('/', createRouter({ pool }));
  return app;
}

describe('POST /register/team', () => {
  const app = createMockApp();
  const body = {
    name: 'Team Alpha',
    logo: 'https://example.com/logo.png',
    captain_discord_id: '123456789012345678',
    players: ['123456789012345678', '223456789012345678', '323456789012345678']
  };

  it('creates a team and returns 201', async () => {
    const res = await request(app).post('/register/team').send(body);
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('rejects duplicate team name', async () => {
    const res = await request(app).post('/register/team').send({ ...body, captain_discord_id: '423456789012345678' });
    expect(res.statusCode).toBe(409);
  });

  it('validates inputs', async () => {
    const res = await request(app).post('/register/team').send({ name: 'A', players: [] });
    expect(res.statusCode).toBe(400);
  });
});


