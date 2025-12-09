// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const { connect } = require('./config/db');
const { requireRole } = require('./middleware/role'); // keep your middleware

// Models
const User = require('./models/User');
const Restaurant = require('./models/Restaurant');
const MenuItem = require('./models/MenuItem');
const Order = require('./models/Order');

const authRoutes = require('./routes/authRoutes'); // if exists

const app = express();
const PORT = process.env.PORT || 3000;

/* -------------------------
   DB + View engine + Middlware
   ------------------------- */
connect(process.env.MONGO_URI).catch(err => console.error(err));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json()); // parse JSON bodies (fetch)
app.use(express.urlencoded({ extended: true })); // parse form bodies
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'sess-secret',
  resave: false,
  saveUninitialized: false
}));
app.use(express.static(path.join(__dirname, 'public')));

// expose session user to views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// optional: mount your external authRoutes (login/register) if present
if (authRoutes) app.use('/', authRoutes);

// small helper
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

/* -------------------------
   LOGIN / LOGOUT
   ------------------------- */
app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  // Always load full document including phone/address
  const user = await User.findOne({ username }).lean();
  if (!user) return res.render('login', { error: "Invalid username or password" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.render('login', { error: "Invalid username or password" });

  // Make sure session stores latest data
  req.session.user = {
    id: user._id.toString(),
    username: user.username,
    name: user.name,
    role: user.role,
    phone: user.phone || "",
    address: user.address || "",
  };

  return res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/register', (req,res) => {
  res.render('register');
});

/* -------------------------
   Register
   ------------------------- */
app.post('/register', async (req,res) => {
  const { name, username, password } = req.body;

  try {
    const newUser = new User({
      name,
      username,
      password,
      role: 'customer'
    });

    await newUser.save();
    res.redirect('/login');

  } catch (err) {
    console.error('register error', err);
    return res.send("Register failed: username may be taken");
  }
});

/* -------------------------
   Role-based Homepage (single)
   ------------------------- */
app.get('/', requireLogin, (req, res) => {
  const role = req.session.user.role;
  if (role === 'customer') return res.render('customer_home', { user: req.session.user });
  if (role === 'restaurant') return res.render('restaurant_home', { user: req.session.user });
  if (role === 'rider') return res.render('rider_home', { user: req.session.user });
  if (role === 'admin') return res.render('admin_home', { user: req.session.user });
  return res.send('Unknown role');
});

/* -------------------------
   Restaurants & Menu
   ------------------------- */
app.get('/restaurants', requireLogin, async (req, res) => {
  const restaurants = await Restaurant.find();
  res.render('restaurants', { restaurants });
});

app.get('/restaurants/:id', requireLogin, async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) return res.status(404).send('Restaurant not found');
    const menuItems = await MenuItem.find({ restaurant: restaurant._id }).sort({ name: 1 });
    return res.render('restaurant_menu', { restaurant, menuItems });
  } catch (err) {
    console.error('restaurant menu error', err);
    return res.status(500).send('Server error');
  }
});

/* -------------------------
   CART (show, add, remove, checkout)
   - add supports both form POST and fetch(JSON)
   ------------------------- */
app.get('/cart', requireLogin, (req, res) => {
  const cart = req.session.cart || { items: [], totalPrice: 0, restaurantId: null };
  res.render('cart', { cart });
});

// CART ADD (form + JSON safe, uses explicit returnUrl fallback)
app.post('/cart/add', requireLogin, (req, res) => {
  // detect JSON request
  const isJson = req.headers['content-type'] && req.headers['content-type'].includes('application/json');

  // get fields (works for form-urlencoded or JSON)
  const { restaurantId, itemId, name, price, returnUrl } = req.body || {};

  // validate
  if (!restaurantId || !itemId || !name || (price === undefined || price === null)) {
    if (isJson) return res.status(400).json({ ok: false, error: 'Missing fields' });
    // if missing, fallback to provided returnUrl or restaurants list
    return res.redirect(returnUrl || `/restaurants/${restaurantId || ''}`);
  }

  // init cart if needed
  if (!req.session.cart) {
    req.session.cart = { restaurantId, items: [], totalPrice: 0 };
  }

  // if switching restaurant, reset cart
  if (req.session.cart.restaurantId && req.session.cart.restaurantId !== restaurantId) {
    req.session.cart = { restaurantId, items: [], totalPrice: 0 };
  } else {
    req.session.cart.restaurantId = restaurantId;
  }

  // add or increment
  const existing = req.session.cart.items.find(i => i.itemId === itemId);
  if (existing) {
    existing.qty += 1;
  } else {
    req.session.cart.items.push({ itemId, name, price: Number(price), qty: 1 });
  }

  req.session.cart.totalPrice = req.session.cart.items.reduce((s, i) => s + i.price * i.qty, 0);

  // respond
  if (isJson) {
    // JSON/AJAX: return JSON so page doesn't navigate to raw JSON view
    return res.json({ ok: true, cart: req.session.cart });
  }

  // Normal form submit: redirect to explicit returnUrl if provided,
  // otherwise back to restaurant menu or restaurants list.
  const safeReturn = returnUrl || `/restaurants/${restaurantId}`;
  return res.redirect(safeReturn);
});

app.post('/cart/remove', requireLogin, (req, res) => {
  const { itemId } = req.body;
  if (!req.session.cart) return res.redirect('/cart');
  req.session.cart.items = req.session.cart.items.filter(i => i.itemId !== itemId);
  req.session.cart.totalPrice = req.session.cart.items.reduce((s,i) => s + i.price * i.qty, 0);
  if (req.session.cart.items.length === 0) req.session.cart = null;
  return res.redirect('/cart');
});

app.post('/cart/checkout', requireLogin, async (req, res) => {
  const cart = req.session.cart;
  if (!cart || !cart.items || cart.items.length === 0) return res.redirect('/cart');

  try {
    const newOrder = new Order({
      customer: req.session.user.id,
      restaurant: cart.restaurantId,
      items: cart.items.map(i => ({ name: i.name, price: i.price, qty: i.qty })),
      totalPrice: cart.totalPrice,
      status: 'Pending'
    });
    await newOrder.save();
    req.session.cart = null;
    return res.redirect('/orders');
  } catch (err) {
    console.error('checkout error', err);
    return res.status(500).send('Checkout failed');
  }
});

/* -------------------------
   ORDERS (customer)
   - /orders shows Pending
   - /orders/paid shows Paid/PickedUp/Delivered
   ------------------------- */
app.get('/orders', requireLogin, async (req, res) => {
  try {
    const orders = await Order.find({ customer: req.session.user.id, status: 'Pending' })
      .populate('restaurant')
      .populate('rider')
      .populate('customer');
    return res.render('orders', { orders });
  } catch (err) {
    console.error('orders error', err);
    return res.status(500).send('Failed to load orders');
  }
});

app.post('/orders/delete/:id', requireLogin, async (req, res) => {
  try {
    await Order.findOneAndDelete({ _id: req.params.id, customer: req.session.user.id });
    return res.redirect('/orders');
  } catch (err) {
    console.error('order delete error', err);
    return res.status(500).send('Delete failed');
  }
});

app.post('/orders', requireLogin, async (req, res) => {
  // immediate single-item order (legacy)
  try {
    const { restaurantId, itemName, price } = req.body;
    if (!restaurantId || !itemName) return res.status(400).send('Bad Request');

    const newOrder = new Order({
      customer: req.session.user.id,
      restaurant: restaurantId,
      items: [{ name: itemName, price: Number(price || 0), qty: 1 }],
      totalPrice: Number(price || 0),
      status: 'Pending'
    });
    await newOrder.save();
    return res.redirect(`/restaurants/${restaurantId}`);
  } catch (err) {
    console.error('immediate order error', err);
    return res.status(500).send('Order create failed');
  }
});

app.get('/orders/paid', async (req,res) => {
  const statusOrder = { Paid: 1, PickedUp: 2, Delivered: 3 };

  let orders = await Order.find({
    customer: req.session.user.id,
    status: { $in:['Paid','PickedUp','Delivered'] }
  })
  .populate('restaurant')
  .populate('rider');

  orders.sort((a,b)=> statusOrder[a.status] - statusOrder[b.status]);

  res.render('paid_orders', { orders });
});

/* -------------------------
   PAY & PAY REDIRECT
   ------------------------- */
app.get('/orders/:id/pay', requireLogin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('restaurant').populate('rider');
    if (!order) return res.redirect('/orders');
    return res.render('pay', { order });
  } catch (err) {
    console.error('pay page error', err);
    return res.status(500).send('Server error');
  }
});
app.post('/orders/:id/pay/redirect', requireLogin, (req, res) => res.redirect('/orders/paid'));

/* -------------------------
   RESTAURANT (menu + view orders)
   ------------------------- */
app.get('/restaurant/menu/manage', requireRole('restaurant'), async (req, res) => {
  const rest = await Restaurant.findOne({ owner: req.session.user.id });
  const items = await MenuItem.find({ restaurant: rest._id });
  return res.render('manage_menu', { rest, items });
});
app.post('/restaurant/menu/add', requireRole('restaurant'), async (req, res) => {
  const { name, description, price } = req.body;
  const rest = await Restaurant.findOne({ owner: req.session.user.id });
  await MenuItem.create({ restaurant: rest._id, name, description, price });
  return res.redirect('/restaurant/menu/manage');
});
app.post('/restaurant/menu/delete/:id', requireRole('restaurant'), async (req, res) => {
  const id = req.params.id;
  const rest = await Restaurant.findOne({ owner: req.session.user.id });
  await MenuItem.deleteOne({ _id: id, restaurant: rest._id });
  return res.redirect('/restaurant/menu/manage');
});
app.get('/restaurant/orders', requireRole('restaurant'), async (req,res) => {
  const rest = await Restaurant.findOne({ owner: req.session.user.id });

  const statusOrder = { Paid: 1, PickedUp: 2, Delivered: 3 };

  let orders = await Order.find({
    restaurant: rest._id,
    status: { $in: ['Paid','PickedUp','Delivered'] }
  })
  .populate('customer')
  .populate('rider');

  orders.sort((a,b) => statusOrder[a.status] - statusOrder[b.status]);

  res.render('restaurant_orders', { orders });
});

// Restaurant Profile
app.get('/restaurant/profile', requireRole('restaurant'), async (req,res) => {
  const restaurant = await Restaurant.findOne({ owner: req.session.user.id });
  res.render('restaurant_profile', { restaurant });
});

app.post('/restaurant/profile', requireRole('restaurant'), async (req,res) => {
  const { name, phone, address } = req.body;

  await Restaurant.findOneAndUpdate(
    { owner: req.session.user.id },
    { name, phone, address }
  );

  res.redirect('/restaurant/profile');
});

/* -------------------------
   RIDER (pickup / delivered / profile)
   ------------------------- */
app.get('/rider/pickup', requireRole('rider'), async (req, res) => {
  const orders = await Order.find({ status: 'Paid' }).populate('restaurant').populate('customer');
  return res.render('rider_pickup', { orders });
});
app.post('/rider/pickup/:id', requireRole('rider'), async (req, res) => {
  await Order.findByIdAndUpdate(req.params.id, { status: 'PickedUp', rider: req.session.user.id });
  return res.redirect('/rider/pickup');
});

app.get('/rider/delivered', requireRole('rider'), async (req,res) => {
  const statusOrder = { PickedUp: 1, Delivered: 2 };

  let orders = await Order.find({
    status: { $in: ['PickedUp','Delivered'] }
  })
  .populate('restaurant')
  .populate('customer')
  .populate('rider');

  orders.sort((a,b) => statusOrder[a.status] - statusOrder[b.status]);

  res.render('rider_delivered', { orders });
});
app.post('/rider/delivered/:id', requireRole('rider'), async (req, res) => {
  await Order.findByIdAndUpdate(req.params.id, { status: 'Delivered' });
  return res.redirect('/rider/delivered');
});

app.get('/rider/profile', requireRole('rider'), (req, res) => res.render('rider_profile', { user: req.session.user }));
app.post('/rider/profile', requireRole('rider'), async (req, res) => {
  const { name, phone } = req.body;

  await User.findByIdAndUpdate(req.session.user.id, { name, phone });

  req.session.user.name = name;
  req.session.user.phone = phone;

  res.redirect('/rider/profile');
});

/* -------------------------
   CUSTOMER profile
   ------------------------- */
app.get('/profile', requireLogin, (req, res) => res.render('profile', { user: req.session.user }));
app.post('/profile', requireLogin, async (req, res) => {
  const { name, phone, address } = req.body;

  await User.findByIdAndUpdate(req.session.user.id, { name, phone, address });

  req.session.user.name = name;
  req.session.user.phone = phone;
  req.session.user.address = address;

  res.redirect('/profile');
});

/* -------------------------
   ADMIN routes (restaurants + orders)
   ------------------------- */
app.get('/admin/restaurants', requireRole('admin'), async (req, res) => {
  const rests = await Restaurant.find().populate('owner');
  return res.render('admin_restaurants', { rests });
});
app.post('/admin/restaurants/add', requireRole('admin'), async (req, res) => {
  const { name, address, phone, ownerId } = req.body;
  await Restaurant.create({ name, address, phone, owner: ownerId });
  return res.redirect('/admin/restaurants');
});
app.post('/admin/restaurants/delete/:id', requireRole('admin'), async (req, res) => {
  await Restaurant.findByIdAndDelete(req.params.id);
  return res.redirect('/admin/restaurants');
});

app.get('/admin/orders', requireRole('admin'), async (req, res) => {
  const query = {};
  let invalidId = false;

  // Filter by status
  if (req.query.status && req.query.status !== 'All') {
    query.status = req.query.status;
  }

  // Filter by ID
  if (req.query.id) {
    const id = req.query.id.trim();

    // Prevent mongoose CastError
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      query._id = id;
    } else {
      invalidId = true;  // flag to show UI message
    }
  }

  try {
    const orders = invalidId
      ? []  // ID format invalid → show no results
      : await Order.find(query)
          .populate('customer')
          .populate('restaurant')
          .populate('rider');

    res.render('admin_orders', {
      orders,
      invalidId
    });

  } catch (e) {
    console.error('Admin order search error:', e);
    res.render('admin_orders', {
      orders: [],
      invalidId: true
    });
  }
});
app.post('/admin/orders/update/:id', requireRole('admin'), async (req, res) => {
  const { status } = req.body;
  await Order.findByIdAndUpdate(req.params.id, { status });
  return res.redirect('/admin/orders');
});

// Admin – View all users
app.get('/admin/users', requireRole('admin'), async (req, res) => {
  let query = {};
  let invalidId = false;

  if (req.query.role && req.query.role !== 'All') {
    query.role = req.query.role;
  }

  if (req.query.id) {
    const id = req.query.id.trim();
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      query._id = id;
    } else {
      invalidId = true;
    }
  }

  const users = invalidId ? [] : await User.find(query);

  res.render('admin_users', { users, invalidId });
});

// Admin - Manage user role
app.get('/admin/users/manage', requireRole('admin'), async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'admin' } }).lean();
    res.render('admin_manage_users', { users });
  } catch (err) {
    console.error("Manage user roles load error", err);
    res.status(500).send("Failed to load user management page");
  }
});

app.post('/admin/users/manage/:id', requireRole('admin'), async (req, res) => {
  const userId = req.params.id;
  const { role } = req.body;

  try {
    await User.findByIdAndUpdate(userId, { role });
    res.redirect('/admin/users/manage');
  } catch (err) {
    console.error("Update user role fail", err);
    res.status(500).send("Failed to update user role");
  }
});

/* -------------------------
   START SERVER
   ------------------------- */
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
