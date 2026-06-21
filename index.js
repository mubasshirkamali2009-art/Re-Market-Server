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
    await client.connect();

    const database = client.db("re-market");
    const productsCollections = database.collection("products");
    const wishlistCollections = database.collection("wishlists"); // NEW
    const cartCollections = database.collection("carts"); // NEW

    app.get('/api/products', async (req, res) => {
      const quary = {};
      if (req.query._id) {            // <-- fixed: was "req,quary._id" (typo)
        quary._id = req.query._id;
      }

      if (req.query.status) {
        quary.status = req.query.status;
      }
      const cursor = productsCollections.find(quary);
      const result = await cursor.toArray();
      res.send(result)

    })

    app.post('/api/products', async (req, res) => {
      const product = req.body;
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

    // =====================================================
    // WISHLIST ENDPOINTS
    // =====================================================

    // ---- GET wishlist for a user ----
    // GET /api/wishlist?email=user@example.com
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

    // ---- CHECK if a product is wishlisted by a user ----
    // GET /api/wishlist/check?email=user@example.com&productId=xxx
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

    // ---- ADD to wishlist (heart click ON) ----
    // POST /api/wishlist  body: { userEmail, productId }
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

    // ---- REMOVE from wishlist (heart click OFF / unlike) ----
    // DELETE /api/wishlist  body: { userEmail, productId }
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
    // GET /api/cart?email=user@example.com
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
    // GET /api/cart/check?email=user@example.com&productId=xxx
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
    // POST /api/cart  body: { userEmail, productId }
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
    // DELETE /api/cart  body: { userEmail, productId }
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
    // PROFILE MANAGEMENT ENDPOINTS
    // =====================================================

    // ---- GET User Profile Details ----
    // GET /api/profile?email=user@example.com
    app.get('/api/profile', async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) {
          return res.status(400).send({ error: 'Email parameter is required' });
        }

        const usersCollection = database.collection("users");
        const user = await usersCollection.findOne({ email: email });

        if (!user) {
          return res.status(404).send({ error: 'User profile not found' });
        }

        delete user.password;
        res.send(user);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Failed to retrieve profile details' });
      }
    });

    // ---- UPDATE Personal Info (Name, Image, Phone, Address) ----
    // PATCH /api/profile  body: { email, name, image, phone, address }
    app.patch('/api/profile', async (req, res) => {
      try {
        const { email, name, image, phone, address } = req.body;
        if (!email) {
          return res.status(400).send({ error: 'User identification email is required' });
        }

        const usersCollection = database.collection("users");

        const updatedFields = {};
        if (name !== undefined) updatedFields.name = name;
        if (image !== undefined) updatedFields.image = image;
        if (phone !== undefined) updatedFields.phone = phone;
        if (address !== undefined) updatedFields.address = address;

        const result = await usersCollection.updateOne(
          { email: email },
          { $set: updatedFields }
        );

        res.send({ success: true, message: 'Profile details updated successfully', result });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Failed to update profile values' });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error

  }
}
run().catch(console.dir);


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})