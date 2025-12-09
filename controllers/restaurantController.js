// controllers/restaurantController.js
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');

async function createRestaurant(data) {
  return await Restaurant.create(data);
}

async function listRestaurants(filter = {}) {
  return await Restaurant.find(filter).sort({ name: 1 });
}

async function getRestaurantById(id) {
  return await Restaurant.findById(id);
}

module.exports = { createRestaurant, listRestaurants, getRestaurantById, MenuItem };

