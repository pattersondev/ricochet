const cron = require('node-cron');
const db = require('../config/db');
const spotifyService = require('./spotifyService');
const imessageService = require('./imessageService');

class SchedulerService {
  constructor() {
    this.jobs = new Map();
    this.pollingJobs = new Map();
    this.POLLING_INTERVAL = 60000; // 1 minute
  }

  async initializeScheduledJobs() {
    try {
      // Initialize scheduled updates
      const scheduledResult = await db.query(
        'SELECT * FROM scheduled_updates WHERE is_active = true'
      );
      scheduledResult.rows.forEach(schedule => {
        this.scheduleUpdate(schedule);
      });
      console.log(`Initialized ${scheduledResult.rows.length} scheduled updates`);

      // Initialize real-time polling
      const realtimeResult = await db.query(
        'SELECT * FROM real_time_updates WHERE is_active = true'
      );
      for (const update of realtimeResult.rows) {
        await this.startRealTimePolling(update.playlist_id, update.conversation_id);
      }
      console.log(`Initialized ${realtimeResult.rows.length} real-time updates`);
    } catch (error) {
      console.error('Error initializing jobs:', error);
    }
  }

  scheduleUpdate(schedule) {
    // Convert schedule_time to cron format (HH:mm -> mm HH * * *)
    const [hours, minutes] = schedule.schedule_time.split(':');
    const cronExpression = `${minutes} ${hours} * * *`;

    if (this.jobs.has(`${schedule.playlist_id}-${schedule.conversation_id}`)) {
      // Stop existing job if there is one
      this.jobs.get(`${schedule.playlist_id}-${schedule.conversation_id}`).stop();
    }

    // Create new cron job
    const job = cron.schedule(cronExpression, async () => {
      try {
        console.log(`Running scheduled update for playlist ${schedule.playlist_id}`);

        // Get Spotify links from conversation
        const links = await imessageService.getSpotifyLinksFromConversation(schedule.conversation_id);
        const trackIds = links.map(link => link.trackId);

        // Update the playlist
        await spotifyService.updatePlaylistWithTracks(schedule.playlist_id, trackIds);

        // Update last run time
        await db.query(
          'UPDATE scheduled_updates SET last_run_at = NOW() WHERE id = $1',
          [schedule.id]
        );

        console.log(`Completed scheduled update for playlist ${schedule.playlist_id}`);
      } catch (error) {
        console.error(`Error in scheduled update for playlist ${schedule.playlist_id}:`, error);
      }
    });

    // Store the job
    this.jobs.set(`${schedule.playlist_id}-${schedule.conversation_id}`, job);
  }

  async createSchedule(playlistId, conversationId, scheduleTime) {
    try {
      // Validate time format (HH:mm)
      if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(scheduleTime)) {
        throw new Error('Invalid time format. Please use HH:mm format (e.g., 13:30)');
      }

      // Check if schedule already exists
      const existing = await db.query(
        'SELECT * FROM scheduled_updates WHERE playlist_id = $1 AND conversation_id = $2',
        [playlistId, conversationId]
      );

      if (existing.rows.length > 0) {
        // Update existing schedule
        const result = await db.query(
          'UPDATE scheduled_updates SET schedule_time = $1, is_active = true WHERE playlist_id = $2 AND conversation_id = $3 RETURNING *',
          [scheduleTime, playlistId, conversationId]
        );
        this.scheduleUpdate(result.rows[0]);
        return { success: true, schedule: result.rows[0], message: 'Schedule updated' };
      } else {
        // Create new schedule
        const result = await db.query(
          'INSERT INTO scheduled_updates (playlist_id, conversation_id, schedule_time) VALUES ($1, $2, $3) RETURNING *',
          [playlistId, conversationId, scheduleTime]
        );
        this.scheduleUpdate(result.rows[0]);
        return { success: true, schedule: result.rows[0], message: 'Schedule created' };
      }
    } catch (error) {
      console.error('Error creating schedule:', error);
      return { success: false, error: error.message };
    }
  }

  async deleteSchedule(playlistId, conversationId) {
    try {
      // Deactivate schedule in database
      await db.query(
        'UPDATE scheduled_updates SET is_active = false WHERE playlist_id = $1 AND conversation_id = $2',
        [playlistId, conversationId]
      );

      // Stop the cron job if it exists
      const jobKey = `${playlistId}-${conversationId}`;
      if (this.jobs.has(jobKey)) {
        this.jobs.get(jobKey).stop();
        this.jobs.delete(jobKey);
      }

      return { success: true, message: 'Schedule deleted' };
    } catch (error) {
      console.error('Error deleting schedule:', error);
      return { success: false, error: error.message };
    }
  }

  async getSchedule(playlistId, conversationId) {
    try {
      const result = await db.query(
        'SELECT * FROM scheduled_updates WHERE playlist_id = $1 AND conversation_id = $2 AND is_active = true',
        [playlistId, conversationId]
      );
      return { success: true, schedule: result.rows[0] || null };
    } catch (error) {
      console.error('Error getting schedule:', error);
      return { success: false, error: error.message };
    }
  }

  async startRealTimePolling(playlistId, conversationId) {
    try {
      // Check if polling is already active
      if (this.pollingJobs.has(`${playlistId}-${conversationId}`)) {
        return {
          success: false,
          error: 'Real-time polling is already active for this playlist and conversation'
        };
      }

      // Get or create real-time update record
      const result = await db.query(
        'INSERT INTO real_time_updates (playlist_id, conversation_id, last_message_timestamp) VALUES ($1, $2, NOW()) ON CONFLICT (playlist_id, conversation_id) DO UPDATE SET is_active = true, last_message_timestamp = NOW() RETURNING last_message_timestamp',
        [playlistId, conversationId]
      );

      let lastMessageTimestamp = result.rows[0].last_message_timestamp;

      // Create polling job
      const pollingJob = setInterval(async () => {
        try {
          console.log(`Polling for updates: playlist ${playlistId}, conversation ${conversationId}`);

          // Get new Spotify links since last check
          const links = await imessageService.getSpotifyLinksFromConversationSince(
            conversationId,
            lastMessageTimestamp
          );

          if (links.length > 0) {
            console.log(`Found ${links.length} new links to process`);
            const trackIds = links.map(link => link.trackId);

            // Update the playlist with new tracks
            await spotifyService.updatePlaylistWithTracks(playlistId, trackIds);

            // Update the last message timestamp
            lastMessageTimestamp = new Date();
            await db.query(
              'UPDATE real_time_updates SET last_message_timestamp = $1 WHERE playlist_id = $2 AND conversation_id = $3',
              [lastMessageTimestamp, playlistId, conversationId]
            );
          }
        } catch (error) {
          console.error(`Error in real-time polling for playlist ${playlistId}:`, error);
        }
      }, this.POLLING_INTERVAL);

      // Store the polling job
      this.pollingJobs.set(`${playlistId}-${conversationId}`, pollingJob);

      return {
        success: true,
        message: 'Real-time polling started successfully'
      };
    } catch (error) {
      console.error('Error starting real-time polling:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async stopRealTimePolling(playlistId, conversationId) {
    try {
      const jobKey = `${playlistId}-${conversationId}`;
      
      if (!this.pollingJobs.has(jobKey)) {
        return {
          success: false,
          error: 'No active real-time polling found for this playlist and conversation'
        };
      }

      // Stop the polling job
      clearInterval(this.pollingJobs.get(jobKey));
      this.pollingJobs.delete(jobKey);

      // Update the database
      await db.query(
        'UPDATE real_time_updates SET is_active = false WHERE playlist_id = $1 AND conversation_id = $2',
        [playlistId, conversationId]
      );

      return {
        success: true,
        message: 'Real-time polling stopped successfully'
      };
    } catch (error) {
      console.error('Error stopping real-time polling:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getRealTimeStatus(playlistId, conversationId) {
    try {
      const result = await db.query(
        'SELECT * FROM real_time_updates WHERE playlist_id = $1 AND conversation_id = $2',
        [playlistId, conversationId]
      );

      return {
        success: true,
        isActive: result.rows.length > 0 && result.rows[0].is_active,
        lastMessageTimestamp: result.rows.length > 0 ? result.rows[0].last_message_timestamp : null
      };
    } catch (error) {
      console.error('Error getting real-time status:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new SchedulerService(); 