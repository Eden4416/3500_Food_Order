// models/MenuItem.js
const mongoose = require('mongoose');

const menuSchema = new mongoose.Schema({
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  name: { type: String, required: true },
  description: String,
  price: { type: Number, required: true },
  category: String,
  image: String
}, { timestamps: true });

module.exports = mongoose.model('MenuItem', menuSchema);
