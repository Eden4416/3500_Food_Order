// models/Order.js
const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
  name: String,
  price: Number,
  qty: Number
});

const orderSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' },
  rider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  items: [orderItemSchema],
  totalPrice: Number,
  status: { type: String, enum: ['Pending','Paid','PickedUp','Delivered','Cancelled'], default: 'Pending' },
  trackingHistory: [{ status: String, timestamp: Date }],
  deliveryAddress: String
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
