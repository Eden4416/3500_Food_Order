// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');

// REGISTER
router.get('/register', (req, res) => {
  res.render('register');
});

router.post('/register', async (req, res) => {
  const { name, username, password } = req.body;

  try {
    const existing = await User.findOne({ username });
    if (existing) {
      return res.render("register", { error: "Username already exists" });
    }

    const newUser = new User({
      name,
      username,
      password, // will be hashed in model
      role: "customer"
    });

    await newUser.save();
    return res.redirect('/login');

  } catch (err) {
    console.error(err);
    return res.status(500).send("Register failed");
  }
});


// LOGIN
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) return res.render('login', { error: "Invalid username or password" });

    const match = await user.comparePassword(password);
    if (!match) return res.render('login', { error: "Invalid username or password" });

    req.session.user = {
      id: user._id,
      name: user.name,
      username: user.username,
      role: user.role
    };

    return res.redirect('/');

  } catch (err) {
    console.error(err);
    return res.status(500).send("Login failed");
  }
});

// LOGOUT
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

module.exports = router;
