const request = require('supertest');
const appFactory = require('../src/app');

describe('auth login', () => {
  it('rejects when auth disabled', async () => {
    delete process.env.ENABLE_AUTH;
    const res = await request(require('../src/app')).post('/login').send({ username: 'x', password: 'y' });
    expect(res.statusCode).toBe(400);
  });
});


