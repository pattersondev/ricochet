require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const initializeDatabase = require('./utils/init-db');
const schedulerService = require('./services/schedulerService');

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api', apiRoutes);

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Spotify callback route
app.get('/callback', (req, res) => {
  const code = req.query.code || null;
  const error = req.query.error || null;
  
  if (error) {
    return res.redirect('/?error=' + encodeURIComponent(error));
  }
  
  res.redirect('/api/spotify/callback?code=' + encodeURIComponent(code));
});

// Initialize database and start server
initializeDatabase().then(async () => {
  // Initialize scheduled jobs
  await schedulerService.initializeScheduledJobs();
  
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
  });
}).catch(error => {
  console.error('Failed to initialize application:', error);
  process.exit(1);
}); 