const { Pool } = require('pg');
require('dotenv').config();

// Clean all environment variables by trimming whitespace/newlines
const cleanEnv = (key, defaultValue = '') => {
  const value = process.env[key];
  return value ? value.trim() : defaultValue;
};

// Railway PostgreSQL configuration
let pool;

// Always prefer DATABASE_URL if available (Railway provides this)
const databaseUrl = cleanEnv('DATABASE_URL');

if (databaseUrl) {
  console.log('📊 Using DATABASE_URL for connection');
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });
} else {
  // Fallback to individual environment variables
  console.log('📊 Using individual environment variables for connection');
  pool = new Pool({
    user: cleanEnv('PGUSER') || cleanEnv('DB_USER'),
    host: cleanEnv('PGHOST') || cleanEnv('DB_HOST'),
    database: cleanEnv('PGDATABASE') || cleanEnv('DB_NAME'),
    password: cleanEnv('PGPASSWORD') || cleanEnv('DB_PASSWORD'),
    port: parseInt(cleanEnv('PGPORT') || cleanEnv('DB_PORT') || '5432'),
    ssl: { rejectUnauthorized: false }
  });
}

// Test database connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error connecting to PostgreSQL database:', err);
    console.error('🔧 Database config:', {
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      databaseUrl: process.env.DATABASE_URL ? `${process.env.DATABASE_URL.trim().substring(0, 50)}...` : 'N/A',
      user: (process.env.PGUSER || process.env.DB_USER || '').trim(),
      host: (process.env.PGHOST || process.env.DB_HOST || '').trim(),
      database: (process.env.PGDATABASE || process.env.DB_NAME || '').trim(),
      port: (process.env.PGPORT || process.env.DB_PORT || '5432').trim(),
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
