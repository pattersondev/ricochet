# iMessage Spotify Playlist Creator

A Node.js application that extracts Spotify links from your iMessage conversations and creates Spotify playlists from them.

## Features

- Access iMessage conversations on macOS
- Extract Spotify links from selected conversations
- Create Spotify playlists with tracks from those links
- User-friendly web interface

## Prerequisites

- macOS (iMessage database access)
- Node.js (v14 or later)
- PostgreSQL database
- Spotify Developer Account

## Installation

1. Clone the repository:

   ```
   git clone <repository-url>
   cd imessage-spotify-playlist
   ```

2. Install dependencies:

   ```
   npm install
   ```

3. Set up the PostgreSQL database:

   ```
   psql -f src/db/init.sql
   ```

4. Create a Spotify Developer App:

   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/)
   - Create a new app
   - Set the redirect URI to `http://localhost:3000/callback`
   - Note your Client ID and Client Secret

5. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Update with your Spotify credentials and database settings
   - Ensure the iMessage DB path is correct (default: ~/Library/Messages/chat.db)

## Usage

1. Start the application:

   ```
   npm start
   ```

2. Open a web browser and navigate to:

   ```
   http://localhost:3000
   ```

3. Connect to Spotify by clicking "Connect to Spotify" and authorizing the application

4. Click "Load Conversations" to view your iMessage conversations

5. Select a conversation to see extracted Spotify links

6. Enter a playlist name and click "Create Playlist"

7. Once created, you can view the playlist in your Spotify account

## Database Access Note

This application needs access to your iMessage database. On macOS, you'll need to grant "Full Disk Access" to Terminal or the application you're using to run this app.

1. Open System Preferences > Security & Privacy > Privacy
2. Select "Full Disk Access" from the left sidebar
3. Click the lock icon to make changes
4. Add Terminal (or your application) to the list

## Security Considerations

- Your Spotify access tokens are stored in a local database
- The application runs locally and doesn't transmit your messages to any external servers
- Messages are only read when you explicitly select a conversation

## License

MIT

## Author

Your Name
