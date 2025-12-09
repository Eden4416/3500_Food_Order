// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const cookieName = 'token';

// Session guard for pages (requires session user)
function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();
  // If no UI, you can return 401; for page-protection redirect to /login in your UI
  return res.status ? res.status(401).send('Not authenticated') : res.redirect && res.redirect('/login');
}

// Role guard
function requireRole(...roles) {
  return (req, res, next) => {
    const u = req.session && req.session.user;
    if (!u) return res.status ? res.status(403).send('Forbidden') : res.redirect('/login');
    if (!roles.includes(u.role)) return res.status && res.status(403).send('Insufficient role');
    next();
  };
}

// JWT verify (for API use if needed)
async function verifyJwtToken(req, res, next) {
  try {
    const token = req.cookies && req.cookies[cookieName] || req.header('Authorization') && req.header('Authorization').replace('Bearer ','');
    if (!token) return res.status(401).json({ message: 'No token' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(payload.id).select('-password');
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

module.exports = { requireLogin, requireRole, verifyJwtToken, cookieName };
