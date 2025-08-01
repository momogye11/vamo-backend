const express = require('express');
const cors = require('cors');
const app = express();
const db = require('./db');

require('dotenv').config();

app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
    if (req.path.includes('/trips/accept')) {
        console.log('🔍 TRIPS ACCEPT REQUEST:', {
            method: req.method,
            path: req.path,
            body: req.body,
            headers: req.headers['content-type']
        });
    }
    next();
});

// Serve static files (photos)
app.use('/uploads', express.static('uploads'));

// Debug endpoint to test server response
app.get('/api/debug/test', (req, res) => {
    console.log('🔧 Debug endpoint hit');
    res.json({
        success: true,
        message: 'Server is responding correctly',
        timestamp: new Date().toISOString()
    });
});

// Database test endpoint
app.get('/api/debug/db-test', async (req, res) => {
    try {
        const result = await db.query('SELECT NOW() as current_time');
        res.json({
            success: true,
            message: 'Database connection working',
            currentTime: result.rows[0].current_time,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Database test failed:', error);
        res.status(500).json({
            success: false,
            error: 'Database connection failed',
            details: error.message
        });
    }
});

// Debug accept endpoint
app.post('/api/debug/accept', (req, res) => {
    console.log('🔧 Debug accept endpoint hit');
    console.log('🔧 Request body:', req.body);
    console.log('🔧 Request headers:', req.headers);

    res.json({
        success: true,
        message: 'Debug accept endpoint working',
        receivedBody: req.body,
        timestamp: new Date().toISOString()
    });
});

// 🔥 Connecte les routes OTP
app.use('/api', require('./routes/send-otp'));
app.use('/api', require('./routes/verify-otp'));

// 🔐 Authentication routes
app.use('/api/auth', require('./routes/auth'));

// 👇 Tu peux aussi ajouter les autres si tu veux
app.use('/api/client', require('./routes/client'));

// Load chauffeur routes
console.log('Loading chauffeur routes...');
try {
    const chauffeurRouter = require('./routes/chauffeur');
    app.use('/api/chauffeur', chauffeurRouter);
    console.log('✅ Chauffeur routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading chauffeur routes:', error);
    console.error('❌ Stack trace:', error.stack);
}

// Load livreur routes
console.log('Loading livreur routes...');
try {
    const livreurRouter = require('./routes/livreur');
    app.use('/api/livreur', livreurRouter);
    console.log('✅ Livreur routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading livreur routes:', error);
    console.error('❌ Stack trace:', error.stack);
}

// Load other routes with error handling
try {
    app.use('/api/livraison', require('./routes/livraison'));
    console.log('✅ Livraison routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading livraison routes:', error);
}

try {
    app.use('/api/locations', require('./routes/locations'));
    console.log('✅ Locations routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading locations routes:', error);
}

// Debug the places routes
console.log('Loading places routes...');
try {
    const placesRouter = require('./routes/places');
    app.use('/api/places', placesRouter);
    console.log('✅ Places routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading places routes:', error);
}

// Load directions routes
console.log('Loading directions routes...');
try {
    const directionsRouter = require('./routes/directions');
    app.use('/api/directions', directionsRouter);
    console.log('✅ Directions routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading directions routes:', error);
}

// Load trips routes for real-time trip management
console.log('Loading trips routes...');
try {
    const tripsRouter = require('./routes/trips');
    app.use('/api/trips', tripsRouter);
    console.log('✅ Trips routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading trips routes:', error);
}

// ❌ SECTION SMART DISPATCH SUPPRIMÉE ICI

// Load rides routes for client ride requests
console.log('Loading rides routes...');
try {
    const ridesRouter = require('./routes/rides');
    app.use('/api/rides', ridesRouter);
    console.log('✅ Rides routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading rides routes:', error);
}


// Load WebSocket/Long-polling routes for React Native
console.log('Loading WebSocket routes...');
try {
    const { router: wsRouter } = require('./routes/websocket');
    app.use('/api/ws', wsRouter);
    console.log('✅ WebSocket routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading WebSocket routes:', error);
}



// 🚀 Lancer serveur
const PORT = process.env.PORT || 5002;
const server = app.listen(PORT, '0.0.0.0', async () => {
    console.log(`✅ Serveur en ligne sur http://0.0.0.0:${PORT}`);
    
    // Initialize database after server starts
    await initializeDatabase();

    // Add a heartbeat to confirm server stays alive
    setTimeout(() => {
        console.log('💓 Server heartbeat - still running after 3 seconds');
    }, 3000);

    setTimeout(() => {
        console.log('💓 Server heartbeat - still running after 10 seconds');
    }, 10000);

});

// 🚀 INITIALISER WEBSOCKET SERVER
console.log('🔌 Initializing WebSocket server...');
try {
    const { initializeWebSocket } = require('./routes/websocket');
    const wss = initializeWebSocket(server);
    console.log('✅ WebSocket server initialized successfully');
} catch (error) {
    console.error('❌ Error initializing WebSocket server:', error);
    console.error('❌ Stack trace:', error.stack);
}

// Global error handling middleware (must be after all routes)
app.use((err, req, res, next) => {
    console.error('❌ Global error handler caught:', err);
    console.error('❌ Request path:', req.path);
    console.error('❌ Request method:', req.method);
    console.error('❌ Request body:', req.body);
    console.error('❌ Stack trace:', err.stack);

    if (!res.headersSent) {
        res.status(500).json({
            success: false,
            error: 'Erreur serveur interne',
            details: err.message,
            path: req.path
        });
    }
});

// 404 handler for undefined routes
app.use((req, res) => {
    console.log('❌ 404 - Route not found:', req.path);
    res.status(404).json({
        success: false,
        error: 'Route non trouvée',
        path: req.path,
        method: req.method
    });
});

// Handle unhandled promise rejections (but don't exit immediately in development)
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    console.error('❌ Full error details:', reason);
    // Don't exit in development - just log the error
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    console.error('❌ Stack trace:', error.stack);
    // Don't exit immediately - let's see what's happening
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('📪 SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('✅ Process terminated');
    });
});

process.on('SIGINT', () => {
    console.log('\n📪 SIGINT received. Shutting down gracefully...');
    server.close(() => {
        console.log('✅ Process terminated');
        process.exit(0);
    });
});

// Initialize database tables
async function initializeDatabase() {
  try {
    const fs = require('fs');
    const path = require('path');
    const schemaPath = path.join(__dirname, 'db', 'schema.sql');
    
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await db.query(schema);
      console.log('✅ Database tables initialized successfully');
    } else {
      console.log('⚠️ Schema file not found, skipping database initialization');
    }
  } catch (error) {
    console.error('❌ Error initializing database:', error.message);
    // Don't crash the server if schema creation fails
  }
}

