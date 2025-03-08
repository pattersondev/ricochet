const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const os = require('os');
require('dotenv').config();

const dbPath = process.env.IMESSAGE_DB_PATH;

console.log('=== iMessage Database Access Diagnostic ===');
console.log(`Current user: ${os.userInfo().username}`);
console.log(`Database path: ${dbPath}`);

// Check if file exists
try {
  const stats = fs.statSync(dbPath);
  console.log('\n✅ File exists');
  console.log(`File size: ${stats.size} bytes`);
  console.log(`File permissions: ${stats.mode.toString(8)}`);
  console.log(`Owner: ${stats.uid}`);
  console.log(`Last accessed: ${stats.atime}`);
  console.log(`Last modified: ${stats.mtime}`);
} catch (err) {
  console.error(`\n❌ File check error: ${err.message}`);
  process.exit(1);
}

// Try accessing with fs
try {
  const fd = fs.openSync(dbPath, 'r');
  console.log('\n✅ File can be opened for reading with fs module');
  fs.closeSync(fd);
} catch (err) {
  console.error(`\n❌ Cannot open file with fs module: ${err.message}`);
}

// Try SQLite connection
console.log('\nAttempting SQLite connection...');

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error(`\n❌ SQLite error: ${err.message}`);
    
    if (err.message.includes('SQLITE_CANTOPEN')) {
      console.log('\n=== Potential Solutions ===');
      console.log('1. Grant "Full Disk Access" to ALL applications used in development:');
      console.log('   - Terminal');
      console.log('   - VS Code / Cursor / Your editor');
      console.log('   - iTerm (if applicable)');
      console.log('\n2. Try with a copy of the database:');
      console.log('   cp ~/Library/Messages/chat.db ~/Desktop/chat_copy.db');
      console.log('   Then modify .env to point to this copy');
      console.log('\n3. Check for file locking:');
      console.log('   - Ensure Messages.app is closed');
      console.log('   - Check if any other process is using the file');
      console.log('\n4. Verify TCC.db permission:');
      console.log('   - You may need to reset privacy permissions in Recovery Mode');
    }
    
    process.exit(1);
  }
  
  console.log('\n✅ Successfully connected to SQLite database');
  
  // Try a simple query
  db.get('SELECT COUNT(*) as count FROM sqlite_master', (err, row) => {
    if (err) {
      console.error(`\n❌ Query error: ${err.message}`);
      db.close();
      process.exit(1);
    }
    
    console.log(`\n✅ Database query successful. Found ${row.count} tables.`);
    
    // Try a query on the chat table
    db.get('SELECT COUNT(*) as count FROM chat', (err, row) => {
      if (err) {
        console.error(`\n❌ Chat table query error: ${err.message}`);
      } else {
        console.log(`\n✅ Found ${row.count} chat conversations.`);
      }
      
      db.close();
      process.exit(err ? 1 : 0);
    });
  });
}); 