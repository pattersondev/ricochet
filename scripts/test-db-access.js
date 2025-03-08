const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

// Get the database path from environment variables
const dbPath = process.env.IMESSAGE_DB_PATH;
console.log(`Attempting to access iMessage database at: ${dbPath}`);

// Try to open the database
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error(`❌ Error opening iMessage database: ${err.message}`);
    console.error('');
    console.error('This could be due to:');
    console.error('1. Terminal does not have Full Disk Access permission');
    console.error('2. The database path in .env is incorrect');
    console.error('');
    console.error('To grant Full Disk Access:');
    console.error('1. Open System Settings > Privacy & Security > Full Disk Access');
    console.error('2. Click the "+" button and add Terminal.app');
    console.error('3. Restart Terminal after granting permissions');
    process.exit(1);
  }
  
  console.log('✅ Successfully opened iMessage database!');
  
  // Simple test query to verify we can read data
  db.get('SELECT COUNT(*) as count FROM chat', (err, row) => {
    if (err) {
      console.error(`❌ Error running test query: ${err.message}`);
      process.exit(1);
    }
    
    console.log(`✅ Database access verified. Found ${row.count} conversations.`);
    
    // Close the database connection
    db.close(() => {
      console.log('Database connection closed.');
      process.exit(0);
    });
  });
}); 