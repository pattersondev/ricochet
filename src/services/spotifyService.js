const spotifyApi = require('../config/spotify');
const db = require('../config/db');

// Promisify specific Spotify API methods to ensure proper callback handling
const promisifySpotifyMethod = (method, ...args) => {
  return new Promise((resolve, reject) => {
    method.call(
      spotifyApi,
      ...args,
      (error, data) => {
        if (error) {
          console.error('Spotify API error:', error);
          reject(error);
        } else {
          resolve(data);
        }
      }
    );
  });
};

class SpotifyService {
  async getAuthorizationUrl() {
    const scopes = ['playlist-modify-public', 'playlist-modify-private', 'user-read-private', 'user-read-email', 'playlist-read-private', 'playlist-read-collaborative'];

    return spotifyApi.createAuthorizeURL(scopes, 'state');
  }

  async handleCallback(code) {
    try {
      const data = await promisifySpotifyMethod(spotifyApi.authorizationCodeGrant, code);
      
      spotifyApi.setAccessToken(data.body['access_token']);
      spotifyApi.setRefreshToken(data.body['refresh_token']);
      
      // Store tokens in database
      await this.saveTokens(data.body['access_token'], data.body['refresh_token'], data.body['expires_in']);
      
      return { success: true };
    } catch (error) {
      console.error('Error during Spotify authorization:', error);
      return { success: false, error: error.message };
    }
  }

  async saveTokens(accessToken, refreshToken, expiresIn) {
    try {
      // Convert expires_in (seconds) to an actual date
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);
      
      // Check if we already have tokens
      const tokens = await db.query('SELECT * FROM spotify_tokens LIMIT 1');
      
      if (tokens.rows.length > 0) {
        // Update existing tokens
        await db.query(
          'UPDATE spotify_tokens SET access_token = $1, refresh_token = $2, expires_at = $3',
          [accessToken, refreshToken, expiresAt]
        );
      } else {
        // Insert new tokens
        await db.query(
          'INSERT INTO spotify_tokens (access_token, refresh_token, expires_at) VALUES ($1, $2, $3)',
          [accessToken, refreshToken, expiresAt]
        );
      }
    } catch (error) {
      console.error('Error saving tokens:', error);
      throw error;
    }
  }

  async refreshAccessToken() {
    try {
      const tokens = await db.query('SELECT * FROM spotify_tokens LIMIT 1');
      
      if (tokens.rows.length === 0) {
        throw new Error('No refresh token available');
      }
      
      const refreshToken = tokens.rows[0].refresh_token;
      spotifyApi.setRefreshToken(refreshToken);
      
      const data = await promisifySpotifyMethod(spotifyApi.refreshAccessToken);
      const newAccessToken = data.body['access_token'];
      
      // Update access token
      spotifyApi.setAccessToken(newAccessToken);
      
      // Update in database
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + data.body['expires_in']);
      
      await db.query(
        'UPDATE spotify_tokens SET access_token = $1, expires_at = $2',
        [newAccessToken, expiresAt]
      );
      
      return newAccessToken;
    } catch (error) {
      console.error('Error refreshing token:', error);
      throw error;
    }
  }

  async ensureValidToken() {
    try {
      const tokens = await db.query('SELECT * FROM spotify_tokens LIMIT 1');
      
      if (tokens.rows.length === 0) {
        throw new Error('No tokens available. Please authorize first.');
      }
      
      const expiresAt = new Date(tokens.rows[0].expires_at);
      const now = new Date();
      
      if (now >= expiresAt) {
        // Token expired, refresh it
        await this.refreshAccessToken();
      } else {
        // Token is still valid, set it
        spotifyApi.setAccessToken(tokens.rows[0].access_token);
        spotifyApi.setRefreshToken(tokens.rows[0].refresh_token);
      }
    } catch (error) {
      console.error('Error ensuring valid token:', error);
      throw error;
    }
  }

  async createPlaylistFromLinks(playlistName, playlistDescription, trackIds) {
    try {
      console.log('Creating playlist from links');
      await this.ensureValidToken();
      
      // Filter invalid track IDs (Spotify IDs are 22 characters)
      const validTrackIds = trackIds.filter(id => id && id.length === 22);
      
      if (validTrackIds.length === 0) {
        return { 
          success: false, 
          error: 'No valid track IDs found. Spotify track IDs should be 22 characters long.'
        };
      }
      
      console.log(`Found ${validTrackIds.length} valid tracks out of ${trackIds.length} submitted`);
    
      // Use the provided description or default to a generic one
      const description = playlistDescription || 'Created from iMessage Spotify links';
      const createdPlaylist = await spotifyApi.createPlaylist(playlistName, {description, public: true});
      
      const playlistId = createdPlaylist.body.id;
      console.log(`Created playlist with ID: ${playlistId}`);
      
      // Add tracks to the playlist

      if (validTrackIds.length > 0) {
        let trackChunk = [];
        for (const trackId of validTrackIds) {
          // Format track IDs as proper Spotify URIs
          trackChunk.push(`spotify:track:${trackId}`);
          if (trackChunk.length === 50) {
            console.log(`Adding chunk of ${trackChunk.length} tracks`);
            await spotifyApi.addTracksToPlaylist(playlistId, trackChunk);
            trackChunk = [];
          }
        }
        
        // Add any remaining tracks
        if (trackChunk.length > 0) {
          console.log(`Adding final chunk of ${trackChunk.length} tracks`);
          await spotifyApi.addTracksToPlaylist(playlistId, trackChunk);
        }
      }
      
      // Save playlist info to database
      await this.savePlaylistInfo(playlistId, playlistName, validTrackIds.length);
      
      return {
        success: true,
        playlistId,
        playlistUrl: createdPlaylist.body.external_urls.spotify,
        trackCount: validTrackIds.length,
        originalCount: trackIds.length,
        invalidCount: trackIds.length - validTrackIds.length
      };
    } catch (error) {
      console.error('Error creating playlist:', error);
      return { success: false, error: error.message };
    }
  }

  async savePlaylistInfo(playlistId, playlistName, trackCount) {
    try {
      await db.query(
        'INSERT INTO playlists (spotify_id, name, track_count, created_at) VALUES ($1, $2, $3, NOW())',
        [playlistId, playlistName, trackCount]
      );
    } catch (error) {
      console.error('Error saving playlist info:', error);
      throw error;
    }
  }

  async getUserPlaylists() {
    try {
      await this.ensureValidToken();
      const data = await spotifyApi.getUserPlaylists();
      return {
        success: true,
        playlists: data.body.items.map(playlist => ({
          id: playlist.id,
          name: playlist.name,
          description: playlist.description,
          trackCount: playlist.tracks.total,
          url: playlist.external_urls.spotify
        }))
      };
    } catch (error) {
      console.error('Error getting user playlists:', error);
      return { success: false, error: error.message };
    }
  }

  async updatePlaylistWithTracks(playlistId, trackIds) {
    try {
      console.log('Updating playlist with new tracks');
      await this.ensureValidToken();
      
      // Filter invalid track IDs (Spotify IDs are 22 characters)
      const validTrackIds = trackIds.filter(id => id && id.length === 22);
      
      if (validTrackIds.length === 0) {
        return { 
          success: false, 
          error: 'No valid track IDs found. Spotify track IDs should be 22 characters long.'
        };
      }
      
      console.log(`Found ${validTrackIds.length} valid tracks out of ${trackIds.length} submitted`);

      // Get all existing tracks (handle pagination) and track their positions
      const existingTrackIds = new Set();
      const duplicatePositions = new Map(); // Map to store positions of duplicates
      const trackPositions = new Map(); // Map to store first occurrence of each track
      let offset = 0;
      const limit = 100;
      let totalTracks = 0;
      let snapshotId = null;
      
      while (true) {
        const response = await spotifyApi.getPlaylistTracks(playlistId, {
          offset: offset,
          limit: limit,
          fields: 'items(track(id)),total,snapshot_id'
        });
        
        // Store the snapshot ID from the first response
        if (!snapshotId) {
          snapshotId = response.body.snapshot_id;
        }
        
        const tracks = response.body.items;
        if (!tracks || tracks.length === 0) break;
        
        tracks.forEach((item, index) => {
          if (item.track && item.track.id) {
            const trackId = item.track.id;
            const position = offset + index;
            
            if (existingTrackIds.has(trackId)) {
              // If we've seen this track before, it's a duplicate
              if (!duplicatePositions.has(trackId)) {
                duplicatePositions.set(trackId, []);
              }
              duplicatePositions.get(trackId).push(position);
            } else {
              // First time seeing this track
              existingTrackIds.add(trackId);
              trackPositions.set(trackId, position);
            }
          }
        });
        
        if (tracks.length < limit) break;
        offset += limit;
        totalTracks = Math.max(totalTracks, offset + tracks.length);
      }
      
      console.log(`Found ${existingTrackIds.size} unique tracks in playlist`);
      
      // Remove duplicates if any found
      let removedDuplicates = 0;
      if (duplicatePositions.size > 0) {
        console.log(`Found ${duplicatePositions.size} tracks with duplicates`);
        
        // Collect all duplicate positions to remove
        const positionsToRemove = [];
        duplicatePositions.forEach((positions) => {
          // Add all positions except the first occurrence
          positionsToRemove.push(...positions);
          removedDuplicates += positions.length;
        });
        
        // Sort positions in descending order to remove from end first
        positionsToRemove.sort((a, b) => b - a);
        
        // Remove duplicates in chunks of 100 (Spotify API limit)
        for (let i = 0; i < positionsToRemove.length; i += 100) {
          const chunk = positionsToRemove.slice(i, i + 100);
          console.log(`Removing chunk of ${chunk.length} duplicates at positions: ${chunk.join(', ')}`);
          await spotifyApi.removeTracksFromPlaylistByPosition(playlistId, chunk, snapshotId);
          
          // Get the new snapshot ID after each removal
          const updatedPlaylist = await spotifyApi.getPlaylist(playlistId, { fields: 'snapshot_id' });
          snapshotId = updatedPlaylist.body.snapshot_id;
        }
        
        console.log(`Removed ${removedDuplicates} duplicate tracks from playlist`);
      }
      
      // Filter out tracks that are already in the playlist
      const newTrackIds = validTrackIds.filter(id => !existingTrackIds.has(id));
      console.log(`${newTrackIds.length} new tracks to add after filtering duplicates`);
      
      if (newTrackIds.length === 0 && removedDuplicates === 0) {
        return {
          success: true,
          playlistId,
          trackCount: 0,
          message: 'All tracks are already in the playlist and no duplicates found',
          duplicateCount: validTrackIds.length
        };
      }

      // Add new tracks to the playlist
      let trackChunk = [];
      for (const trackId of newTrackIds) {
        trackChunk.push(`spotify:track:${trackId}`);
        if (trackChunk.length === 50) {
          console.log(`Adding chunk of ${trackChunk.length} tracks`);
          await spotifyApi.addTracksToPlaylist(playlistId, trackChunk);
          trackChunk = [];
        }
      }
      
      // Add any remaining tracks
      if (trackChunk.length > 0) {
        console.log(`Adding final chunk of ${trackChunk.length} tracks`);
        await spotifyApi.addTracksToPlaylist(playlistId, trackChunk);
      }
      
      // Update playlist info in database
      await this.updatePlaylistInfo(playlistId, newTrackIds.length - removedDuplicates);
      
      return {
        success: true,
        playlistId,
        trackCount: newTrackIds.length,
        originalCount: trackIds.length,
        invalidCount: trackIds.length - validTrackIds.length,
        duplicateCount: validTrackIds.length - newTrackIds.length,
        removedDuplicates: removedDuplicates
      };
    } catch (error) {
      console.error('Error updating playlist:', error);
      return { success: false, error: error.message };
    }
  }

  async updatePlaylistInfo(playlistId, addedTrackCount) {
    try {
      // Get current track count
      const result = await db.query(
        'SELECT track_count FROM playlists WHERE spotify_id = $1',
        [playlistId]
      );
      
      if (result.rows.length > 0) {
        // Update existing playlist
        const newTrackCount = result.rows[0].track_count + addedTrackCount;
        await db.query(
          'UPDATE playlists SET track_count = $1 WHERE spotify_id = $2',
          [newTrackCount, playlistId]
        );
      } else {
        // Get playlist info from Spotify
        const playlist = await spotifyApi.getPlaylist(playlistId);
        await db.query(
          'INSERT INTO playlists (spotify_id, name, track_count, created_at) VALUES ($1, $2, $3, NOW())',
          [playlistId, playlist.body.name, playlist.body.tracks.total]
        );
      }
    } catch (error) {
      console.error('Error updating playlist info:', error);
      throw error;
    }
  }

  async searchTrack(query) {
    try {
      await this.ensureValidToken();
      
      const data = await spotifyApi.searchTracks(query, { limit: 5 });
      
      if (!data.body || !data.body.tracks || !data.body.tracks.items) {
        return { success: false, error: 'No search results found' };
      }
      
      return {
        success: true,
        tracks: data.body.tracks.items.map(track => ({
          id: track.id,
          name: track.name,
          artists: track.artists,
          album: {
            name: track.album.name,
            release_date: track.album.release_date
          },
          external_urls: track.external_urls
        }))
      };
    } catch (error) {
      console.error('Error searching for track:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new SpotifyService(); 