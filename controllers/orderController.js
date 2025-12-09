// controllers/orderController.js
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');

async function createOrder({ customerId, restaurantId, items, deliveryAddress }) {
  // items: [{ menuItemId, qty }]
  const built = [];
  let total = 0;
  for (const it of items) {
    const menu = await MenuItem.findById(it.menuItemId);
    if (!menu) throw new Error('MenuItem not found: ' + it.menuItemId);
    built.push({ menuItem: menu._id, name: menu.name, price: menu.price, qty: Number(it.qty) });
    total += menu.price * Number(it.qty);
  }
  const order = await Order.create({
    customer: customerId,
    restaurant: restaurantId,
    items: built,
    totalPrice: total,
    deliveryAddress,
    trackingHistory: [{ status: 'Pending', timestamp: new Date() }]
  });
  return order;
}

async function updateOrderStatus(orderId, status, actorId = null) {
  const allowed = ['Pending','Accepted','Preparing','PickedUp','OutForDelivery','Delivered','Cancelled'];
  if (!allowed.includes(status)) throw new Error('Invalid status');
  const order = await Order.findById(orderId);
  if (!order) throw new Error('Order not found');
  if (actorId && ['PickedUp','OutForDelivery','Delivered'].includes(status)) {
    if (!order.rider) order.rider = actorId;
  }
  order.status = status;
  order.trackingHistory.push({ status, timestamp: new Date() });
  await order.save();
  return order;
}

async function assignRider(orderId, riderId) {
  const order = await Order.findById(orderId);
  if (!order) throw new Error('Order not found');
  order.rider = riderId;
  await order.save();
  return order;
}

async function listOrders(filter = {}) {
  return await Order.find(filter).sort({ createdAt: -1 });
}

module.exports = { createOrder, updateOrderStatus, assignRider, listOrders };


