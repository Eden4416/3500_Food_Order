// controllers/userController.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { cookieName } = require('../middleware/auth');

async function registerUser({ name, email, password, role }) {
  const u = new User({ name, email, password, role });
  await u.save();
  return u;
}

async function loginUser({ email, password, req, res }) {
  const user = await User.findOne({ email });
  if (!user) throw new Error('Invalid credentials');
  const ok = await user.comparePassword(password);
  if (!ok) throw new Error('Invalid credentials');

  // set session
  req.session.user = { id: user._id, name: user.name, role: user.role };

  // also sign JWT if desired (optional)
  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie(cookieName, token, { httpOnly: true, maxAge: 7*24*3600*1000 });
  return user;
}

function logoutUser({ req, res }) {
  req.session.destroy(()=>{});
  res.clearCookie(cookieName);
}

module.exports = { registerUser, loginUser, logoutUser };
