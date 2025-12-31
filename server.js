// server.js - Main server file
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const spamDetectorRoutes = require('./routes/spamDetector');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.json());

app.use('/api', spamDetectorRoutes);

app.get('/', (req, res) => {
  res.json({
    message: 'Spam Token Detector API',
    endpoints: {
      checkToken: 'POST /api/check-token',
      description: 'Check if a token is spam based on contract address and network'
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});