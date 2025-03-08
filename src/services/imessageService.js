const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();
const appleMusicService = require('./appleMusicService');

class IMessageService {
  constructor() {
    this.dbPath = process.env.IMESSAGE_DB_PATH;
    this.debug = false; // Add debug flag
  }

  async getConversations() {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) return reject(`Error opening iMessage database: ${err.message}`);
      });

      const query = `
        SELECT 
          c.ROWID as id,
          c.chat_identifier,
          c.display_name
        FROM 
          chat c
        WHERE 
          c.chat_identifier IS NOT NULL
      `;

      db.all(query, [], (err, rows) => {
        db.close();
        if (err) return reject(`Error fetching conversations: ${err.message}`);
        resolve(rows);
      });
    });
  }

  async getSpotifyLinksFromConversation(conversationId) {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) return reject(`Error opening iMessage database: ${err.message}`);
      });

      const query = `
        SELECT 
          m.ROWID as id,
          m.text,
          m.date,
          m.is_from_me,
          CASE 
            WHEN m.is_from_me = 1 THEN 'You'
            ELSE COALESCE(h.id, 'Unknown')
          END as sender_name
        FROM 
          message m
        JOIN 
          chat_message_join cmj ON m.ROWID = cmj.message_id
        LEFT JOIN 
          handle h ON m.handle_id = h.ROWID
        WHERE 
          cmj.chat_id = ? 
          AND (
            m.text LIKE '%open.spotify.com%'
            OR m.text LIKE '%spotify:track:%'
            OR m.text LIKE '%music.apple.com%'
          )
        ORDER BY 
          m.date DESC
      `;

      db.all(query, [conversationId], async (err, rows) => {
        db.close();
        if (err) return reject(`Error fetching music links: ${err.message}`);
        
        const links = await this.extractMusicLinks(rows);
        resolve(links);
      });
    });
  }

  async getSpotifyLinksFromConversationSince(conversationId, timestamp) {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) return reject(`Error opening iMessage database: ${err.message}`);
      });

      const query = `
        SELECT 
          m.ROWID as id,
          m.text,
          m.date,
          m.is_from_me,
          CASE 
            WHEN m.is_from_me = 1 THEN 'You'
            ELSE COALESCE(h.id, 'Unknown')
          END as sender_name
        FROM 
          message m
        JOIN 
          chat_message_join cmj ON m.ROWID = cmj.message_id
        LEFT JOIN 
          handle h ON m.handle_id = h.ROWID
        WHERE 
          cmj.chat_id = ? 
          AND m.date > ?
          AND (
            m.text LIKE '%open.spotify.com%'
            OR m.text LIKE '%spotify:track:%'
            OR m.text LIKE '%music.apple.com%'
          )
        ORDER BY 
          m.date DESC
      `;

      db.all(query, [conversationId, timestamp], async (err, rows) => {
        db.close();
        if (err) return reject(`Error fetching music links: ${err.message}`);
        
        const links = await this.extractMusicLinks(rows);
        resolve(links);
      });
    });
  }

  async extractMusicLinks(messages) {
    const musicLinks = [];
    const trackIds = new Set();
    
    const spotifyUrlRegex = /https:\/\/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/g;
    const spotifyUriRegex = /spotify:track:([a-zA-Z0-9]+)/g;
    const appleMusicRegex = /https:\/\/music\.apple\.com\/(?:[a-z]{2}\/)?(?:album|playlist)\/[^/]+\/(?:\d+)\??(?:i=(\d+))?/g;
    
    for (const message of messages) {
      if (!message.text) continue;
      
      let match;
      
      // Extract Spotify URL format
      while ((match = spotifyUrlRegex.exec(message.text)) !== null) {
        const trackId = match[1];
        if (!trackIds.has(trackId)) {
          trackIds.add(trackId);
          musicLinks.push({
            type: 'spotify',
            trackId,
            fullLink: match[0],
            messageId: message.id,
            sender: message.sender_name,
            date: message.date
          });
        }
      }
      
      // Extract Spotify URI format
      while ((match = spotifyUriRegex.exec(message.text)) !== null) {
        const trackId = match[1];
        if (!trackIds.has(trackId)) {
          trackIds.add(trackId);
          musicLinks.push({
            type: 'spotify',
            trackId,
            fullLink: match[0],
            messageId: message.id,
            sender: message.sender_name,
            date: message.date
          });
        }
      }
      
      // Extract Apple Music links
      while ((match = appleMusicRegex.exec(message.text)) !== null) {
        const fullLink = match[0];
        try {
          const result = await appleMusicService.findSpotifyEquivalent(fullLink);
          if (result.success && result.trackId && !trackIds.has(result.trackId)) {
            trackIds.add(result.trackId);
            musicLinks.push({
              type: 'apple_music',
              trackId: result.trackId,
              fullLink: fullLink,
              messageId: message.id,
              sender: message.sender_name,
              date: message.date,
              originalSource: 'apple_music'
            });
          } else {
            // Still add the link to show it was found but conversion failed
            const linkInfo = {
              type: 'apple_music',
              trackId: null,
              fullLink: fullLink,
              messageId: message.id,
              sender: message.sender_name,
              date: message.date,
              originalSource: 'apple_music',
              conversionError: result.error
            };
            
            if (this.debug && result.details) {
              linkInfo.conversionDetails = result.details;
            }
            
            musicLinks.push(linkInfo);
          }
        } catch (error) {
          if (this.debug) {
            console.error(`Error converting Apple Music link: ${fullLink}`, error);
          }
          // Add the failed link
          musicLinks.push({
            type: 'apple_music',
            trackId: null,
            fullLink: fullLink,
            messageId: message.id,
            sender: message.sender_name,
            date: message.date,
            originalSource: 'apple_music',
            conversionError: error.message
          });
        }
      }
    }
    
    return musicLinks;
  }
}

module.exports = new IMessageService(); 