const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const createRouter = require('./routes');
const { ensureSchema, pool } = require('./db');
const http = require('http');
const { Server } = require('socket.io');
const { adminOnly, signAdminToken, isAuthEnabled } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/auth/status', (req, res) => {
  const raw = String(process.env.ENABLE_AUTH || '').trim();
  res.json({ enableAuthRaw: raw, enableAuth: raw.toLowerCase() === 'true' || raw === '1' || raw.toLowerCase() === 'yes' || raw.toLowerCase() === 'on' });
});
app.post('/login', (req, res) => {
  if (!isAuthEnabled()) return res.status(400).json({ error: 'Auth disabled' });
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  if (username === (process.env.ADMIN_USER || 'admin') && password === (process.env.ADMIN_PASS || 'admin123')) {
    return res.json({ token: signAdminToken(username) });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});
app.use('/', createRouter({ pool, adminOnly }));

const port = Number(process.env.PORT || 4000);

if (require.main === module) {
  ensureSchema()
    .then(() => {
      const server = http.createServer(app);
      const io = new Server(server, { cors: { origin: '*'} });
      app.set('io', io);
      server.listen(port, () => console.log(`Backend running on port ${port}`));
    })
    .catch((err) => {
      console.error('Failed to ensure schema', err);
      process.exit(1);
    });
}

module.exports = app;


