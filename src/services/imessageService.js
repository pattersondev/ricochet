const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

class IMessageService {
  constructor() {
    this.dbPath = process.env.IMESSAGE_DB_PATH;
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
          )
        ORDER BY 
          m.date DESC
      `;

      db.all(query, [conversationId], (err, rows) => {
        db.close();
        if (err) return reject(`Error fetching Spotify links: ${err.message}`);
        
        const links = this.extractSpotifyLinks(rows);
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
          )
        ORDER BY 
          m.date DESC
      `;

      db.all(query, [conversationId, timestamp], (err, rows) => {
        db.close();
        if (err) return reject(`Error fetching Spotify links: ${err.message}`);
        
        const links = this.extractSpotifyLinks(rows);
        resolve(links);
      });
    });
  }

  extractSpotifyLinks(messages) {
    const spotifyLinks = [];
    const trackIds = new Set();
    
    const spotifyUrlRegex = /https:\/\/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/g;
    const spotifyUriRegex = /spotify:track:([a-zA-Z0-9]+)/g;
    
    messages.forEach(message => {
      if (!message.text) return;
      
      let match;
      // Extract URL format
      while ((match = spotifyUrlRegex.exec(message.text)) !== null) {
        const trackId = match[1];
        if (!trackIds.has(trackId)) {
          trackIds.add(trackId);
          spotifyLinks.push({
            type: 'url',
            trackId,
            fullLink: match[0],
            messageId: message.id,
            sender: message.sender_name,
            date: message.date
          });
        }
      }
      
      // Extract URI format
      while ((match = spotifyUriRegex.exec(message.text)) !== null) {
        const trackId = match[1];
        if (!trackIds.has(trackId)) {
          trackIds.add(trackId);
          spotifyLinks.push({
            type: 'uri',
            trackId,
            fullLink: match[0],
            messageId: message.id,
            sender: message.sender_name,
            date: message.date
          });
        }
      }
    });
    
    return spotifyLinks;
  }
}

module.exports = new IMessageService(); 