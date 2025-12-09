// controllers/menuController.js
const MenuItem = require('../models/MenuItem');

async function createMenuItem(data) {
  return await MenuItem.create(data);
}

async function listMenuByRestaurant(rid) {
  return await MenuItem.find({ restaurant: rid }).sort({ name: 1 });
}

async function getMenuItem(id) {
  return await MenuItem.findById(id);
}

module.exports = { createMenuItem, listMenuByRestaurant, getMenuItem };
