-- Spotify Tokens Table
CREATE TABLE IF NOT EXISTS spotify_tokens (
  id SERIAL PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Playlists Table
CREATE TABLE IF NOT EXISTS playlists (
  id SERIAL PRIMARY KEY,
  spotify_id TEXT NOT NULL,
  name TEXT NOT NULL,
  track_count INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL,
  UNIQUE(spotify_id)
);

-- Conversations Table
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  imessage_id TEXT NOT NULL,
  chat_identifier TEXT,
  display_name TEXT,
  UNIQUE(imessage_id)
);

-- Tracks Table
CREATE TABLE IF NOT EXISTS tracks (
  id SERIAL PRIMARY KEY,
  spotify_id TEXT NOT NULL,
  playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(spotify_id, playlist_id)
);

-- Scheduled Updates Table
CREATE TABLE IF NOT EXISTS scheduled_updates (
  id SERIAL PRIMARY KEY,
  playlist_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  schedule_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(playlist_id, conversation_id)
);

-- Real-time Updates Table
CREATE TABLE IF NOT EXISTS real_time_updates (
  id SERIAL PRIMARY KEY,
  playlist_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_message_timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(playlist_id, conversation_id)
); 