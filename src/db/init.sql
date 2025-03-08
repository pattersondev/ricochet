-- Create Database
CREATE DATABASE imessage_spotify;

-- Connect to the database
\c imessage_spotify;

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