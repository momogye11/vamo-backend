const { Pool } = require('pg');
require('dotenv').config();

// Railway PostgreSQL configuration
let pool;

if (process.env.DATABASE_URL) {
  // Use Railway's DATABASE_URL if available
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
} else {
  // Use individual environment variables
  pool = new Pool({
    user: process.env.PGUSER || process.env.DB_USER,
    host: process.env.PGHOST || process.env.DB_HOST,
    database: process.env.PGDATABASE || process.env.DB_NAME,
    password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
    port: process.env.PGPORT || process.env.DB_PORT || 5432,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
}

// Test database connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error connecting to PostgreSQL database:', err);
    console.error('🔧 Database config:', {
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      user: process.env.PGUSER || process.env.DB_USER,
      host: process.env.PGHOST || process.env.DB_HOST,
      database: process.env.PGDATABASE || process.env.DB_NAME,
      port: process.env.PGPORT || process.env.DB_PORT || 5432,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  } else {
    console.log('✅ PostgreSQL database connected successfully');
    if (release) {
      release();
    }
  }
});

// Add error handling for the pool
pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client:', err);
});

module.exports = pool;
