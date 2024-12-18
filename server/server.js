const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors');

const uri = "mongodb+srv://grantdewaay:0pFyBijAuxysDq3X@cluster0.3zo1d.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const app = express();
const server = http.createServer(app);

// Enable CORS
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST'],
  credentials: true,
}));

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log(`A user connected: ${socket.id}`);
  
  socket.on('createRoom', async () => {
    const roomId = Math.random().toString(36).substring(7);
    await client.connect();
    const database = client.db("webrtc");
    const collection = database.collection("rooms");
    await collection.insertOne({ roomId: roomId, user: socket.id });
    io.to(socket.id).emit('roomCode', roomId);
  });

  socket.on('joinRoom', async (room) => {
    await client.connect();
    const database = client.db("webrtc");
    const collection = database.collection("rooms");
    const result = await collection.findOne({ roomId: room });
    if (result) {
      io.to(result.user).emit('createOffer', socket.id);
    } else {
      io.to(socket.id).emit('tooMany');
    }
  });

  socket.on('sendOffer', (offer, user) => {
    io.to(user).emit('receivedOffer', offer, socket.id);
  });

  socket.on('sendAnswerDescription', (answer, user) => {
    io.to(user).emit('receiveAnswerDescription', answer, socket.id);
  });

  socket.on('sendOfferCandidate', (offer, user) => {
    io.to(user).emit('receiveOfferCandidate', offer, socket.id);
  });

  socket.on('sendAnswerCandidate', (answer, user) => {
    io.to(user).emit('receiveAnswerCandidate', answer, socket.id);
  });

  socket.on('sendIceCandidates', (candidates, user) => {
    io.to(user).emit('receiveIceCandidates', candidates, socket.id);
  });
});

server.listen(3001, () => {
  console.log('Server running on http://localhost:3001');
});