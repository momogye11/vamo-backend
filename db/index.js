const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // important pour Railway
  },
});

// Test database connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error connecting to PostgreSQL database:', err);
  } else {
    console.log('✅ PostgreSQL database connected successfully');
    release();
  }
});

// Add error handling for the pool
pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client:', err);
});

module.exports = pool;
