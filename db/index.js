const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD || '', // vide si non défini
  port: process.env.DB_PORT,
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
