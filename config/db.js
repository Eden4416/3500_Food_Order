// config/db.js
const mongoose = require('mongoose');

async function connect(uri) {
  if (!uri) throw new Error('MONGO_URI not provided');
  await mongoose.connect(uri, {
    // driver options modern versions don't need useNewUrlParser/useUnifiedTopology
  });
  console.log('MongoDB connected');
}

module.exports = { connect };
