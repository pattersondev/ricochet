const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function initializeDatabase() {
  const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: 'postgres', // Connect to default postgres database
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
  });

  try {
    // Check if database exists
    const dbCheckResult = await pool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [process.env.DB_NAME]
    );

    // Create database if it doesn't exist
    if (dbCheckResult.rows.length === 0) {
      console.log(`Creating database ${process.env.DB_NAME}...`);
      await pool.query(`CREATE DATABASE ${process.env.DB_NAME}`);
      console.log('Database created successfully');
    } else {
      console.log(`Database ${process.env.DB_NAME} already exists`);
    }

    // Close connection to postgres database
    await pool.end();

    // Connect to the project database
    const projectPool = new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
    });

    // Read SQL file for table creation
    const tablesSqlPath = path.join(__dirname, '..', 'db', 'tables.sql');
    console.log(`Reading tables SQL from ${tablesSqlPath}`);
    const tablesSqlContent = fs.readFileSync(tablesSqlPath, 'utf8');

    // Execute the SQL commands
    console.log('Creating tables...');
    await projectPool.query(tablesSqlContent);
    console.log('Tables created successfully');

    await projectPool.end();
    return true;
  } catch (error) {
    console.error('Error initializing database:', error);
    return false;
  }
}

if (require.main === module) {
  // Script was run directly
  initializeDatabase()
    .then(success => {
      if (success) {
        console.log('Database initialization completed successfully');
        process.exit(0);
      } else {
        console.error('Database initialization failed');
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('Unexpected error during database initialization:', err);
      process.exit(1);
    });
} else {
  // Script was imported
  module.exports = initializeDatabase;
} 