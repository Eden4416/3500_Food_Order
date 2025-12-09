// middleware/role.js
module.exports.requireRole = (...roles) => {
  return (req, res, next) => {
    const u = req.session && req.session.user;
    if (!u) return res.redirect('/login');
    if (!roles.includes(u.role)) return res.status(403).send('Forbidden');
    next();
  };
};
