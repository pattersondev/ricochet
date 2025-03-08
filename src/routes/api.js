const express = require('express');
const router = express.Router();
const imessageService = require('../services/imessageService');
const spotifyService = require('../services/spotifyService');
const schedulerService = require('../services/schedulerService');
const db = require('../config/db');

// Get all iMessage conversations
router.get('/conversations', async (req, res) => {
  try {
    const conversations = await imessageService.getConversations();
    res.json({ success: true, conversations });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ success: false, error: error.toString() });
  }
});

// Get Spotify links from a specific conversation
router.get('/conversation/:id/spotify-links', async (req, res) => {
  try {
    const { id } = req.params;
    const links = await imessageService.getSpotifyLinksFromConversation(id);
    res.json({ success: true, links });
  } catch (error) {
    console.error('Error fetching Spotify links:', error);
    res.status(500).json({ success: false, error: error.toString() });
  }
});

// Create a Spotify playlist from links
router.post('/create-playlist', async (req, res) => {
  try {
    const { playlistName, playlistDescription, trackIds } = req.body;
    
    if (!playlistName || !trackIds || !Array.isArray(trackIds)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid request. Please provide a playlistName and an array of trackIds.'
      });
    }
    
    const result = await spotifyService.createPlaylistFromLinks(playlistName, playlistDescription, trackIds);
    res.json(result);
  } catch (error) {
    console.error('Error creating playlist:', error);
    res.status(500).json({ success: false, error: error.toString() });
  }
});

// Get Spotify authorization URL
router.get('/spotify/auth-url', async (req, res) => {
  try {
    const authUrl = await spotifyService.getAuthorizationUrl();
    res.json({ success: true, authUrl });
  } catch (error) {
    console.error('Error getting auth URL:', error);
    res.status(500).json({ success: false, error: error.toString() });
  }
});

// Check if user is authorized with Spotify
router.get('/spotify/auth-status', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM spotify_tokens LIMIT 1');
    const isAuthorized = result.rows.length > 0;
    
    // Check if token is expired
    let tokenExpired = false;
    if (isAuthorized) {
      const now = new Date();
      const expiresAt = new Date(result.rows[0].expires_at);
      tokenExpired = now >= expiresAt;
    }
    
    res.json({ 
      success: true, 
      isAuthorized, 
      tokenExpired 
    });
  } catch (error) {
    console.error('Error checking auth status:', error);
    res.status(500).json({ success: false, error: error.toString() });
  }
});

// Handle Spotify callback
router.get('/spotify/callback', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).json({ success: false, error: 'Authorization code is required' });
    }
    
    const result = await spotifyService.handleCallback(code);
    
    if (result.success) {
      res.redirect('/');
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Error handling callback:', error);
    res.status(500).json({ success: false, error: error.toString() });
  }
});

// Get user's Spotify playlists
router.get('/spotify/playlists', async (req, res) => {
  try {
    const result = await spotifyService.getUserPlaylists();
    res.json(result);
  } catch (error) {
    console.error('Error getting user playlists:', error);
    res.status(500).json({ success: false, error: error.toString() });
  }
});

// Update an existing playlist with new tracks
router.post('/update-playlist/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { trackIds } = req.body;
    
    if (!trackIds || !Array.isArray(trackIds)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid request. Please provide an array of trackIds.'
      });
    }
    
    const result = await spotifyService.updatePlaylistWithTracks(id, trackIds);
    res.json(result);
  } catch (error) {
    console.error('Error updating playlist:', error);
    res.status(500).json({ success: false, error: error.toString() });
  }
});

// Create or update a scheduled update
router.post('/schedule/:playlistId/:conversationId', async (req, res) => {
  try {
    const { playlistId, conversationId } = req.params;
    const { scheduleTime } = req.body;

    if (!scheduleTime) {
      return res.status(400).json({
        success: false,
        error: 'Schedule time is required in HH:mm format'
      });
    }

    const result = await schedulerService.createSchedule(playlistId, conversationId, scheduleTime);
    res.json(result);
  } catch (error) {
    console.error('Error creating schedule:', error);
    res.status(500).json({ success: false, error: error.toString() });
  }
});

// Delete a scheduled update
router.delete('/schedule/:playlistId/:conversationId', async (req, res) => {
  try {
    const { playlistId, conversationId } = req.params;
    const result = await schedulerService.deleteSchedule(playlistId, conversationId);
    res.json(result);
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ success: false, error: error.toString() });
  }
});

// Get a scheduled update
router.get('/schedule/:playlistId/:conversationId', async (req, res) => {
  try {
    const { playlistId, conversationId } = req.params;
    const result = await schedulerService.getSchedule(playlistId, conversationId);
    res.json(result);
  } catch (error) {
    console.error('Error getting schedule:', error);
    res.status(500).json({ success: false, error: error.toString() });
  }
});

// Start real-time mirroring
router.post('/realtime/:playlistId/:conversationId', async (req, res) => {
  try {
    const { playlistId, conversationId } = req.params;
    const result = await schedulerService.startRealTimePolling(playlistId, conversationId);
    res.json(result);
  } catch (error) {
    console.error('Error starting real-time mirroring:', error);
    res.status(500).json({ success: false, error: error.toString() });
  }
});

// Stop real-time mirroring
router.delete('/realtime/:playlistId/:conversationId', async (req, res) => {
  try {
    const { playlistId, conversationId } = req.params;
    const result = await schedulerService.stopRealTimePolling(playlistId, conversationId);
    res.json(result);
  } catch (error) {
    console.error('Error stopping real-time mirroring:', error);
    res.status(500).json({ success: false, error: error.toString() });
  }
});

// Get real-time mirroring status
router.get('/realtime/:playlistId/:conversationId', async (req, res) => {
  try {
    const { playlistId, conversationId } = req.params;
    const result = await schedulerService.getRealTimeStatus(playlistId, conversationId);
    res.json(result);
  } catch (error) {
    console.error('Error getting real-time status:', error);
    res.status(500).json({ success: false, error: error.toString() });
  }
});

module.exports = router; 