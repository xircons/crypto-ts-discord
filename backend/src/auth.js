const jwt = require('jsonwebtoken');

function isAuthEnabled() {
  const raw = String(process.env.ENABLE_AUTH || '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

function adminOnly(req, res, next) {
  if (!isAuthEnabled()) return next();
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'change_me');
    if (!payload || payload.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

function signAdminToken(username) {
  const payload = { sub: username, role: 'admin' };
  const secret = process.env.JWT_SECRET || 'change_me';
  const expiresIn = '12h';
  return jwt.sign(payload, secret, { expiresIn });
}

module.exports = { adminOnly, signAdminToken, isAuthEnabled };


