const dns = require("node:dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
const express = require('express');
const cors = require('cors');
const app = express()
const port = 5000
require('dotenv').config()

app.use(cors())
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

app.get('/', (req, res) => {
  res.send('Hello World!')
})

const uri = process.env.MONGO_DB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server (optional starting in v4.7)
    // await client.connect();

    const database = client.db("re-market");
    const productsCollections = database.collection("products");
    const wishlistCollections = database.collection("wishlists");
    const cartCollections = database.collection("carts");
    const ordersCollections = database.collection("orders");
    const reviewsCollections = database.collection("reviews");
    const paymentsCollections = database.collection("payments");

    // =====================================================
    // PRODUCTS ENDPOINTS
    // =====================================================

    app.get('/api/products', async (req, res) => {
      const quary = {};
      if (req.query._id) {
        quary._id = req.query._id;
      }
      if (req.query.status) {
        quary.status = req.query.status;
      }

      // ── NEW SEARCH FUNCTIONALITY ADDED HERE ──
      if (req.query.search) {
        quary.$or = [
          { name: { $regex: req.query.search, $options: 'i' } },
          { category: { $regex: req.query.search, $options: 'i' } }
        ];
      }

      // Sort by createdAt descending — newest products first
      const result = await productsCollections
        .find(quary)
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    })

    app.post('/api/products', async (req, res) => {
      const product = req.body;

      // Always stamp createdAt so newest-first sorting works correctly
      product.createdAt = new Date();

      console.log(product)
      const result = await productsCollections.insertOne(product);
      res.send(result);
    })

    // ---- EDIT a product ----
    app.patch('/api/products/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const updatedFields = req.body;

        // never let the client overwrite _id
        delete updatedFields._id;

        const result = await productsCollections.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedFields }
        );
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Failed to update product' });
      }
    });

    // ---- DELETE a product ----
    app.delete('/api/products/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const result = await productsCollections.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Failed to delete product' });
      }
    });

    // ---- GET single product by id ----
    app.get('/api/products/:id', async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ error: 'Invalid product id' });
        }

        const product = await productsCollections.findOne({ _id: new ObjectId(id) });
        if (!product) {
          return res.status(404).send({ error: 'Product not found' });
        }
        res.send(product);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Failed to load product' });
      }
    });

    // =====================================================
    // WISHLIST ENDPOINTS
    // =====================================================

    // ---- GET wishlist for a user ----
    app.get('/api/wishlist', async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) {
          return res.status(400).send({ error: 'email query param is required' });
        }

        const wishlistDocs = await wishlistCollections.find({ userEmail: email }).toArray();

        const productIds = wishlistDocs.map(doc => new ObjectId(doc.productId));
        const products = await productsCollections
          .find({ _id: { $in: productIds } })
          .toArray();

        const merged = products.map(product => {
          const wishlistEntry = wishlistDocs.find(w => w.productId === product._id.toString());
          return { ...product, wishlistId: wishlistEntry?._id };
        });

        res.send(merged);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Failed to load wishlist' });
      }
    });

    // ---- CHECK if a product is wishlisted by a user ----
    app.get('/api/wishlist/check', async (req, res) => {
      try {
        const { email, productId } = req.query;
        const existing = await wishlistCollections.findOne({
          userEmail: email,
          productId: productId,
        });
        res.send({ wishlisted: !!existing, wishlistId: existing?._id || null });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Failed to check wishlist' });
      }
    });

    // ---- ADD to wishlist ----
    app.post('/api/wishlist', async (req, res) => {
      try {
        const { userEmail, productId } = req.body;
        if (!userEmail || !productId) {
          return res.status(400).send({ error: 'userEmail and productId are required' });
        }

        const existing = await wishlistCollections.findOne({ userEmail, productId });
        if (existing) {
          return res.send({ alreadyExists: true, wishlistId: existing._id });
        }

        const result = await wishlistCollections.insertOne({
          userEmail,
          productId,
          createdAt: new Date(),
        });
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Failed to add to wishlist' });
      }
    });

    // ---- REMOVE from wishlist ----
    app.delete('/api/wishlist', async (req, res) => {
      try {
        const { userEmail, productId } = req.body;
        if (!userEmail || !productId) {
          return res.status(400).send({ error: 'userEmail and productId are required' });
        }

        const result = await wishlistCollections.deleteOne({ userEmail, productId });
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Failed to remove from wishlist' });
      }
    });

    // =====================================================
    // CART ENDPOINTS
    // =====================================================

    // ---- GET cart for a user ----
    app.get('/api/cart', async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) {
          return res.status(400).send({ error: 'email query param is required' });
        }

        const cartDocs = await cartCollections.find({ userEmail: email }).toArray();

        const productIds = cartDocs.map(doc => new ObjectId(doc.productId));
        const products = await productsCollections
          .find({ _id: { $in: productIds } })
          .toArray();

        const merged = products.map(product => {
          const cartEntry = cartDocs.find(c => c.productId === product._id.toString());
          return { ...product, cartId: cartEntry?._id };
        });

        res.send(merged);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Failed to load cart' });
      }
    });

    // ---- CHECK if a product is in a user's cart ----
    app.get('/api/cart/check', async (req, res) => {
      try {
        const { email, productId } = req.query;
        const existing = await cartCollections.findOne({
          userEmail: email,
          productId: productId,
        });
        res.send({ inCart: !!existing, cartId: existing?._id || null });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Failed to check cart' });
      }
    });

    // ---- ADD to cart ----
    app.post('/api/cart', async (req, res) => {
      try {
        const { userEmail, productId } = req.body;
        if (!userEmail || !productId) {
          return res.status(400).send({ error: 'userEmail and productId are required' });
        }

        const existing = await cartCollections.findOne({ userEmail, productId });
        if (existing) {
          return res.send({ alreadyExists: true, cartId: existing._id });
        }

        const result = await cartCollections.insertOne({
          userEmail,
          productId,
          createdAt: new Date(),
        });
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Failed to add to cart' });
      }
    });

    // ---- REMOVE from cart ----
    app.delete('/api/cart', async (req, res) => {
      try {
        const { userEmail, productId } = req.body;
        if (!userEmail || !productId) {
          return res.status(400).send({ error: 'userEmail and productId are required' });
        }

        const result = await cartCollections.deleteOne({ userEmail, productId });
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Failed to remove from cart' });
      }
    });

    // =====================================================
    // ORDERS ENDPOINTS
    // =====================================================

    // ---- PLACE an order (called by BuyNowButton) ----
    app.post('/api/orders', async (req, res) => {
      try {
        const { buyerInfo, sellerInfo, productId, paymentStatus, quantity } = req.body;
        const qty = Number(quantity) || 1;

        if (!buyerInfo?.email || !productId) {
          return res.status(400).send({ error: 'buyerInfo.email and productId are required' });
        }
        if (!ObjectId.isValid(productId)) {
          return res.status(400).send({ error: 'Invalid productId' });
        }

        // Only decrement if there's enough stock — prevents going negative.
        const stockUpdate = await productsCollections.findOneAndUpdate(
          { _id: new ObjectId(productId), stock: { $gte: qty } },
          { $inc: { stock: -qty } },
          { returnDocument: 'after' }
        );

        const updatedProduct = stockUpdate?.value ?? stockUpdate;

        if (!updatedProduct) {
          return res.status(400).send({ error: 'Not enough stock available' });
        }

        const order = {
          buyerInfo,
          sellerInfo: sellerInfo || updatedProduct.sellerInfo || {},
          productId,
          productSnapshot: {
            name: updatedProduct.name,
            image: updatedProduct.images?.[0] || null,
            price: updatedProduct.price,
            category: updatedProduct.category,
          },
          quantity: qty,
          paymentStatus: paymentStatus || 'paid',
          orderStatus: 'processing',
          createdAt: new Date(),
        };

        const result = await ordersCollections.insertOne(order);
        res.send({ ...result, insertedOrder: { ...order, _id: result.insertedId } });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Failed to place order' });
      }
    });

    // ---- GET orders for a buyer (My Orders page) ----
    app.get('/api/orders', async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) return res.status(400).send({ error: 'email query param is required' });

        const result = await ordersCollections
          .find({ "buyerInfo.email": email })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Failed to load orders' });
      }
    });

    // ---- GET orders for a seller (Manage Orders page) ----
    app.get('/api/orders/seller', async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) return res.status(400).send({ error: 'email query param is required' });

        const result = await ordersCollections
          .find({ "sellerInfo.email": email })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Failed to load seller orders' });
      }
    });

    // =====================================================
    // ANALYTICS STATS METRICS
    // =====================================================
    app.get('/api/stats', async (req, res) => {
      try {
        const usersCollection = database.collection("user");

        const totalProducts = await productsCollections.countDocuments({});
        const totalSellers = await usersCollection.countDocuments({ role: "seller" });
        const totalBuyers = await usersCollection.countDocuments({ role: "buyer" });
        const totalSales = await ordersCollections.countDocuments({});

        res.send({
          totalProducts,
          totalSellers,
          totalBuyers,
          totalSales
        });
      } catch (error) {
        console.error("Failed to fetch stats metrics:", error);
        res.status(500).send({ error: 'Failed to aggregate statistics' });
      }
    });

    // =====================================================
    // DYNAMIC ROLE-BASED DASHBOARD METRICS
    // =====================================================
    app.get('/api/dashboard/stats', async (req, res) => {
      try {
        const { email } = req.query;
        if (!email) {
          return res.status(400).send({ error: 'Email parameter is required' });
        }

        const usersCollection = database.collection("user");
        
        // Find the user to check their dynamic role type
        const user = await usersCollection.findOne({ email: email });
        if (!user) {
          return res.status(404).send({ error: 'User registration profile not found' });
        }

        const role = user.role || 'buyer';
        let metrics = {};

        if (role === 'buyer') {
          const totalCarts = await cartCollections.countDocuments({ userEmail: email });
          const totalOrders = await ordersCollections.countDocuments({ "buyerInfo.email": email });
          const savedItems = await wishlistCollections.countDocuments({ userEmail: email });
          
          // Calculate cumulative spending amount for non-cancelled buyer orders
          const buyerOrders = await ordersCollections.find({ 
            "buyerInfo.email": email, 
            orderStatus: { $ne: 'cancelled' } 
          }).toArray();
          const totalSpent = buyerOrders.reduce((acc, curr) => acc + ((curr.productSnapshot?.price || 0) * (curr.quantity || 1)), 0);

          metrics = { totalCarts, totalOrders, savedItems, totalSpent };
        } 
        else if (role === 'seller') {
          const totalProducts = await productsCollections.countDocuments({ "sellerInfo.email": email });
          const totalCanceled = await ordersCollections.countDocuments({ "sellerInfo.email": email, orderStatus: 'cancelled' });
          const totalPending = await ordersCollections.countDocuments({ "sellerInfo.email": email, orderStatus: 'processing' });
          
          // Calculate absolute gross marketplace item sales revenue
          const sellerOrders = await ordersCollections.find({ 
            "sellerInfo.email": email, 
            orderStatus: { $ne: 'cancelled' } 
          }).toArray();
          const totalSalesRevenue = sellerOrders.reduce((acc, curr) => acc + ((curr.productSnapshot?.price || 0) * (curr.quantity || 1)), 0);

          metrics = { totalProducts, totalCanceled, totalPending, totalSalesRevenue };
        } 
        else if (role === 'admin') {
          const totalUsers = await usersCollection.countDocuments({});
          const totalBuyers = await usersCollection.countDocuments({ role: 'buyer' });
          const totalSellers = await usersCollection.countDocuments({ role: 'seller' });
          const totalProducts = await productsCollections.countDocuments({});

          metrics = { totalUsers, totalBuyers, totalSellers, totalProducts };
        }

        res.send({ role, metrics });
      } catch (error) {
        console.error("Dashboard dynamic context load failure:", error);
        res.status(500).send({ error: 'Failed to build structural dashboard parameters' });
      }
    });

    // ---- CANCEL an order (buyer OR seller can cancel — restores stock) ----
    app.patch('/api/orders/:id/cancel', async (req, res) => {
      try {
        const { id } = req.params;
        const { email } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ error: 'Invalid order id' });
        }
        if (!email) {
          return res.status(400).send({ error: 'email is required' });
        }

        const order = await ordersCollections.findOne({ _id: new ObjectId(id) });
        if (!order) {
          return res.status(404).send({ error: 'Order not found' });
        }
        if (order.orderStatus === 'cancelled') {
          return res.status(400).send({ error: 'Order is already cancelled' });
        }

        const isBuyer = order.buyerInfo?.email === email;
        const isSeller = order.sellerInfo?.email === email;
        if (!isBuyer && !isSeller) {
          return res.status(403).send({ error: 'Not authorized to cancel this order' });
        }

        if (order.productId && ObjectId.isValid(order.productId)) {
          await productsCollections.updateOne(
            { _id: new ObjectId(order.productId) },
            { $inc: { stock: order.quantity || 1 } }
          );
        }

        const result = await ordersCollections.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              orderStatus: 'cancelled',
              cancelledAt: new Date(),
              cancelledBy: isSeller ? 'seller' : 'buyer',
            },
          }
        );

        res.send({ success: true, message: 'Order cancelled successfully', result });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Failed to cancel order' });
      }
    });

    // =====================================================
    // PROFILE MANAGEMENT ENDPOINTS
    // =====================================================

    // ---- GET User Profile Details ----
    app.get('/api/profile/:id', async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ error: 'Invalid user id' });
        }

        const usersCollection = database.collection("user");
        const user = await usersCollection.findOne({ _id: new ObjectId(id) });

        if (!user) {
          return res.status(404).send({ error: 'User not found' });
        }

        delete user.password;
        res.send(user);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Failed to retrieve profile details' });
      }
    });

    // ---- UPDATE Personal Info ----
    app.patch('/api/profile/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const updatedFields = req.body;

        delete updatedFields._id;
        delete updatedFields.email;

        const usersCollection = database.collection("user");

        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedFields }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ error: 'No user found with this id' });
        }

        res.send({ success: true, message: 'Profile details updated successfully', result });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Failed to update profile values' });
      }
    });

    // =====================================================
    // REVIEWS & RATINGS ENDPOINTS
    // =====================================================

    // ---- SAVE / SUBMIT A NEW REVIEW ----
    app.post('/api/reviews', async (req, res) => {
      try {
        const { productId, reviewerInfo, rating, comment } = req.body;

        if (!productId || !reviewerInfo?.userId || !rating || !comment) {
          return res.status(400).send({ error: "Missing required review input fields" });
        }

        if (!ObjectId.isValid(productId)) {
          return res.status(400).send({ error: "Invalid product ID format provided" });
        }

        const reviewDocument = {
          productId: new ObjectId(productId),
          reviewerInfo: {
            userId: reviewerInfo.userId,
            name: reviewerInfo.name
          },
          rating: Number(rating),
          comment: comment.trim(),
          createdAt: new Date()
        };

        const result = await reviewsCollections.insertOne(reviewDocument);
        res.status(201).send({ _id: result.insertedId, ...reviewDocument });
      } catch (error) {
        console.error("Failed to post product review:", error);
        res.status(500).send({ error: 'Database error saving review reference' });
      }
    });

    // ---- GET REVIEWS FOR A SPECIFIC PRODUCT ----
    app.get('/api/reviews', async (req, res) => {
      try {
        const { productId } = req.query;

        if (!productId) {
          return res.status(400).send({ error: "productId query parameter is required" });
        }

        if (!ObjectId.isValid(productId)) {
          return res.status(400).send({ error: "Invalid product ID format" });
        }

        const reviews = await reviewsCollections
          .find({ productId: new ObjectId(productId) })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(reviews);
      } catch (error) {
        console.error("Failed to retrieve reviews:", error);
        res.status(500).send({ error: 'Database error fetching review data' });
      }
    });

    // =====================================================
    // PAYMENT HISTORY ENDPOINTS
    // =====================================================

    // ---- SAVE a completed payment (called from Next.js success page) ----
    app.post('/api/payments', async (req, res) => {
      console.log("halle server")
      try {
        const {
          stripeSessionId,
          paymentIntentId,
          paymentStatus,
          amount,
          currency,
          customerEmail,
          metadata,
        } = req.body;

        if (!stripeSessionId) {
          return res.status(400).send({ error: 'stripeSessionId is required' });
        }

        // Avoid duplicate records if the success page is hit more than once
        const existing = await paymentsCollections.findOne({ stripeSessionId });
        if (existing) {
          return res.send({ success: true, payment: existing, duplicate: true });
        }

        const paymentRecord = {
          stripeSessionId,
          paymentIntentId: paymentIntentId || null,
          paymentStatus: paymentStatus || 'paid',
          amount: Number(amount) || 0,
          currency: currency || 'usd',
          customerEmail: customerEmail || metadata?.userEmail || null,
          productId: metadata?.productId || null,
          productName: metadata?.name || null,
          metadata: metadata || {},
          createdAt: new Date(),
        };

        const result = await paymentsCollections.insertOne(paymentRecord);
        console.log(result)
        res.status(201).send({
          success: true,
          payment: { _id: result.insertedId, ...paymentRecord },
        });
      } catch (error) {
        console.error("Failed to save payment record:", error);
        res.status(500).send({ error: 'Failed to save payment record' });
      }
    });

    // ---- GET payment history for a buyer ----
    app.get('/api/payments', async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) {
          return res.status(400).send({ error: 'email query param is required' });
        }

        const result = await paymentsCollections
          .find({ customerEmail: email })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Failed to load payment history:", error);
        res.status(500).send({ error: 'Failed to load payment history' });
      }
    });

    // ---- GET single payment by Stripe session id ----
    app.get('/api/payments/:sessionId', async (req, res) => {
      try {
        const { sessionId } = req.params;
        const payment = await paymentsCollections.findOne({ stripeSessionId: sessionId });

        if (!payment) {
          return res.status(404).send({ error: 'Payment record not found' });
        }
        res.send(payment);
      } catch (error) {
        console.error("Failed to load payment:", error);
        res.status(500).send({ error: 'Failed to load payment' });
      }
    });

    // ---- ADMIN: GET all payments across the platform ----
    app.get('/api/admin/payments', async (req, res) => {
      try {
        const result = await paymentsCollections
          .find({})
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Admin payments load failure:", error);
        res.status(500).send({ error: 'Failed to aggregate global system payments.' });
      }
    });

    app.get('/api/admin/orders', async (req, res) => {
      try {
        const result = await ordersCollections
          .find({})
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Admin orders load failure:", error);
        res.status(500).send({ error: 'Failed to aggregate global system orders.' });
      }
    });

    // ---- ADMIN FORCE OVERRIDE CANCEL ORDER ----
    app.patch('/api/admin/orders/:id/cancel', async (req, res) => {
      try {
        const { id } = req.params;
        const { email } = req.body; // Tracking which admin initiated the override

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ error: 'Invalid order id format.' });
        }

        const order = await ordersCollections.findOne({ _id: new ObjectId(id) });
        if (!order) {
          return res.status(404).send({ error: 'Target order document not found.' });
        }
        if (order.orderStatus === 'cancelled') {
          return res.status(400).send({ error: 'Order is already cancelled.' });
        }

        // Restock items dynamically back into store inventory pool
        if (order.productId && ObjectId.isValid(order.productId)) {
          await productsCollections.updateOne(
            { _id: new ObjectId(order.productId) },
            { $inc: { stock: order.quantity || 1 } }
          );
        }

        const result = await ordersCollections.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              orderStatus: 'cancelled',
              cancelledAt: new Date(),
              cancelledBy: `admin (${email || 'system'})`,
            },
          }
        );

        res.send({ success: true, message: 'Order terminated by Admin authority.', result });
      } catch (error) {
        console.error("Admin override cancellation failure:", error);
        res.status(500).send({ error: 'Failed to execute administrative cancellation.' });
      }
    });


    app.get('/api/admin/products', async (req, res) => {
      try {
        const result = await productsCollections
          .find({})
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Admin products load failure:", error);
        res.status(500).send({ error: 'Failed to aggregate global system products.' });
      }
    });

    // ---- ADMIN FORCE DELETE PRODUCT ----
    app.delete('/api/admin/products/:id', async (req, res) => {
      try {
        const id = req.params.id;
        
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ error: 'Invalid product ID format.' });
        }

        const result = await productsCollections.deleteOne({ _id: new ObjectId(id) });
        
        if (result.deletedCount === 0) {
          return res.status(404).send({ error: 'Target product document not found.' });
        }

        res.send({ success: true, message: 'Product permanently purged by Admin authority.', result });
      } catch (error) {
        console.error("Admin override product deletion failure:", error);
        res.status(500).send({ error: 'Failed to execute administrative product removal.' });
      }
    });


    // ---- ADMIN GET ALL SYSTEM USERS ----
    app.get('/api/admin/users', async (req, res) => {
      try {
        const usersCollection = database.collection("user");
        const result = await usersCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();
        
        // Remove sensitive credentials before returning datasets
        const safeUsers = result.map(u => {
          delete u.password;
          return u;
        });
        
        res.send(safeUsers);
      } catch (error) {
        console.error("Admin users load failure:", error);
        res.status(500).send({ error: 'Failed to aggregate global system users.' });
      }
    });

    // ---- ADMIN FORCE PERMANENTLY DELETE A USER ----
    app.delete('/api/admin/users/:id', async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ error: 'Invalid user ID format.' });
        }

        const usersCollection = database.collection("user");
        
        // Prevent accidental self-deletion of an Admin profile
        const targetUser = await usersCollection.findOne({ _id: new ObjectId(id) });
        if (targetUser && targetUser.role === "admin") {
          return res.status(403).send({ error: "Administrative accounts cannot be purged via this interface." });
        }

        const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
          return res.status(404).send({ error: 'Target user account not found.' });
        }

        res.send({ 
          success: true, 
          message: 'User profile permanently dropped from database system records.' 
        });
      } catch (error) {
        console.error("Admin user deletion failure:", error);
        res.status(500).send({ error: 'Failed to complete administrative user deletion.' });
      }
    });




    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})