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
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();





   const database = client.db("re-market");
    const  productsCollections= database.collection("products");


    app.get('/api/products', async(req,res)  =>{
      const quary ={};
      if(req,quary._id){
        quary._id = req.query._id;
      }

      if(req.query.status){
        quary.status=req.query.status;
      }
const cursor = productsCollections.find(quary);
const result = await cursor.toArray();
res.send(result)

    })

app.post('/api/products'  , async(req, res) => {
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