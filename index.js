const express = require('express');
const cors = require('cors');
let cloudinary = null;
const app = express();
const db = require('./db');

require('dotenv').config();

// Try to load Cloudinary (optional)
try {
    cloudinary = require('cloudinary').v2;
    console.log('✅ Cloudinary module loaded');
} catch (error) {
    console.log('⚠️ Cloudinary module not available:', error.message);
}

// Configure Cloudinary (only if available and environment variables are set)
if (cloudinary && process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
    console.log('✅ Cloudinary configured successfully');
} else {
    console.log('⚠️ Cloudinary not configured - module or environment variables missing');
}

// Helper function to upload image to Cloudinary
const uploadToCloudinary = async (file, folder = 'vamo') => {
    try {
        // Check if Cloudinary is available
        if (!cloudinary) {
            throw new Error('Cloudinary module not available');
        }
        
        // Check if Cloudinary is configured
        if (!process.env.CLOUDINARY_CLOUD_NAME) {
            throw new Error('Cloudinary not configured');
        }
        
        // Check if file exists locally
        const fs = require('fs');
        if (!fs.existsSync(file)) {
            throw new Error(`File not found: ${file}`);
        }
        
        const result = await cloudinary.uploader.upload(file, {
            folder: folder,
            resource_type: 'auto'
        });
        return result.secure_url;
    } catch (error) {
        console.error('❌ Cloudinary upload error:', error);
        throw error;
    }
};

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

// Debug endpoint to convert local image URLs to Cloudinary URLs
app.get('/api/image/:type/:filename', async (req, res) => {
    try {
        const { type, filename } = req.params;
        
        // Check if Cloudinary is available
        if (!cloudinary) {
            return res.status(503).json({
                success: false,
                error: 'Cloudinary module not available',
                message: 'Image hosting service not available'
            });
        }
        
        // Check if Cloudinary is configured
        if (!process.env.CLOUDINARY_CLOUD_NAME) {
            return res.status(503).json({
                success: false,
                error: 'Cloudinary not configured',
                message: 'Image hosting service not available'
            });
        }
        
        // Construct the local file path
        const localPath = `uploads/${type}/${filename}`;
        
        // Try to upload to Cloudinary if not already there
        const cloudinaryUrl = await uploadToCloudinary(localPath, `vamo/${type}`);
        
        res.json({
            success: true,
            url: cloudinaryUrl
        });
    } catch (error) {
        console.error('❌ Error serving image:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to serve image',
            details: error.message
        });
    }
});

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

// Debug endpoint to see all chauffeurs
app.get('/api/debug/chauffeurs', async (req, res) => {
    try {
        const result = await db.query('SELECT id_chauffeur, nom, prenom, telephone, statut_validation, disponibilite FROM Chauffeur');
        res.json({
            success: true,
            chauffeurs: result.rows,
            count: result.rowCount
        });
    } catch (error) {
        console.error('❌ Error fetching chauffeurs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch chauffeurs',
            details: error.message
        });
    }
});

// Debug endpoint to see all livreurs
app.get('/api/debug/livreurs', async (req, res) => {
    try {
        const result = await db.query('SELECT id_livreur, nom, prenom, telephone, statut_validation, disponibilite FROM Livreur');
        res.json({
            success: true,
            livreurs: result.rows,
            count: result.rowCount
        });
    } catch (error) {
        console.error('❌ Error fetching livreurs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch livreurs',
            details: error.message
        });
    }
});

// Debug endpoint to create a test chauffeur
app.post('/api/debug/create-test-chauffeur', async (req, res) => {
    try {
        const testChauffeur = {
            nom: 'Test',
            prenom: 'Chauffeur',
            telephone: '+221782957169',
            marque_vehicule: 'Toyota Corolla',
            annee_vehicule: 2020,
            plaque_immatriculation: 'DK-1234-AB',
            statut_validation: 'approuve',
            disponibilite: false
        };

        const result = await db.query(`
            INSERT INTO Chauffeur (nom, prenom, telephone, marque_vehicule, annee_vehicule, plaque_immatriculation, statut_validation, disponibilite)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id_chauffeur, nom, prenom, telephone, statut_validation, disponibilite
        `, [
            testChauffeur.nom,
            testChauffeur.prenom,
            testChauffeur.telephone,
            testChauffeur.marque_vehicule,
            testChauffeur.annee_vehicule,
            testChauffeur.plaque_immatriculation,
            testChauffeur.statut_validation,
            testChauffeur.disponibilite
        ]);

        res.json({
            success: true,
            message: 'Test chauffeur created successfully',
            chauffeur: result.rows[0]
        });
    } catch (error) {
        console.error('❌ Error creating test chauffeur:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create test chauffeur',
            details: error.message
        });
    }
});

// Debug endpoint to approve a chauffeur by phone number
app.post('/api/debug/approve-chauffeur', async (req, res) => {
    try {
        const { telephone } = req.body;
        
        if (!telephone) {
            return res.status(400).json({
                success: false,
                error: 'telephone is required'
            });
        }

        console.log(`🔧 Approving chauffeur with phone: ${telephone}`);

        // Update chauffeur status to approved
        const result = await db.query(`
            UPDATE Chauffeur
            SET statut_validation = 'approuve'
            WHERE telephone = $1
            RETURNING id_chauffeur, nom, prenom, telephone, statut_validation, disponibilite
        `, [telephone]);

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Chauffeur not found with this phone number'
            });
        }

        console.log(`✅ Chauffeur ${telephone} approved successfully`);

        res.json({
            success: true,
            message: 'Chauffeur approved successfully',
            chauffeur: result.rows[0]
        });
    } catch (error) {
        console.error('❌ Error approving chauffeur:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to approve chauffeur',
            details: error.message
        });
    }
});

// Debug endpoint to approve a livreur by phone number
app.post('/api/debug/approve-livreur-by-phone', async (req, res) => {
    try {
        const { telephone } = req.body;
        
        if (!telephone) {
            return res.status(400).json({
                success: false,
                error: 'telephone is required'
            });
        }

        console.log(`🔧 Approving livreur with phone: ${telephone}`);

        // Update livreur status to approved
        const result = await db.query(`
            UPDATE Livreur
            SET statut_validation = 'approuve'
            WHERE telephone = $1
            RETURNING id_livreur, nom, prenom, telephone, statut_validation, disponibilite
        `, [telephone]);

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Livreur not found with this phone number'
            });
        }

        console.log(`✅ Livreur ${telephone} approved successfully`);

        res.json({
            success: true,
            message: 'Livreur approved successfully',
            livreur: result.rows[0]
        });
    } catch (error) {
        console.error('❌ Error approving livreur:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to approve livreur',
            details: error.message
        });
    }
});

// Debug endpoint to check Cloudinary images for a livreur
app.get('/api/debug/check-cloudinary-images', async (req, res) => {
    try {
        const { id_livreur } = req.query;
        
        if (!id_livreur) {
            return res.status(400).json({
                success: false,
                error: 'id_livreur is required'
            });
        }

        console.log(`🔍 Checking Cloudinary images for livreur ID: ${id_livreur}`);

        // Get current livreur data
        const result = await db.query(`
            SELECT photo_cni, photo_selfie, photo_vehicule, nom, prenom
            FROM Livreur 
            WHERE id_livreur = $1
        `, [id_livreur]);

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Livreur not found'
            });
        }

        const livreur = result.rows[0];
        
        // Check if Cloudinary is configured
        let cloudinaryAvailable = false;
        try {
            const cloudinary = require('cloudinary').v2;
            cloudinaryAvailable = !!process.env.CLOUDINARY_CLOUD_NAME;
        } catch (error) {
            cloudinaryAvailable = false;
        }

        res.json({
            success: true,
            livreur: {
                id_livreur,
                nom: livreur.nom,
                prenom: livreur.prenom,
                photos: {
                    cni: livreur.photo_cni,
                    selfie: livreur.photo_selfie,
                    vehicule: livreur.photo_vehicule
                }
            },
            cloudinary_available: cloudinaryAvailable,
            message: 'Current image URLs retrieved'
        });
    } catch (error) {
        console.error('❌ Error checking Cloudinary images:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check Cloudinary images',
            details: error.message
        });
    }
});

// Debug endpoint to update livreur images with working URLs
app.post('/api/debug/update-livreur-images', async (req, res) => {
    try {
        const { id_livreur } = req.body;
        
        if (!id_livreur) {
            return res.status(400).json({
                success: false,
                error: 'id_livreur is required'
            });
        }

        console.log(`🔧 Updating images for livreur ID: ${id_livreur}`);

        // Update with placeholder images that work
        const result = await db.query(`
            UPDATE Livreur 
            SET photo_cni = 'https://via.placeholder.com/400x300/4CAF50/FFFFFF?text=CNI',
                photo_selfie = 'https://via.placeholder.com/400x300/2196F3/FFFFFF?text=Selfie',
                photo_vehicule = 'https://via.placeholder.com/400x300/FF9800/FFFFFF?text=Vehicule'
            WHERE id_livreur = $1
            RETURNING id_livreur, nom, prenom, photo_cni, photo_selfie, photo_vehicule
        `, [id_livreur]);

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Livreur not found'
            });
        }

        console.log(`✅ Livreur ${id_livreur} images updated successfully`);

        res.json({
            success: true,
            message: 'Livreur images updated successfully',
            livreur: result.rows[0]
        });
    } catch (error) {
        console.error('❌ Error updating livreur images:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update livreur images',
            details: error.message
        });
    }
});

// Debug endpoint to approve a livreur
app.post('/api/debug/approve-livreur', async (req, res) => {
    try {
        const { id_livreur } = req.body;
        
        if (!id_livreur) {
            return res.status(400).json({
                success: false,
                error: 'id_livreur is required'
            });
        }

        console.log(`🔧 Approving livreur with ID: ${id_livreur}`);

        const result = await db.query(`
            UPDATE Livreur 
            SET statut_validation = 'approuve'
            WHERE id_livreur = $1
            RETURNING id_livreur, nom, prenom, telephone, statut_validation, disponibilite
        `, [id_livreur]);

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Livreur not found'
            });
        }

        console.log(`✅ Livreur ${id_livreur} approved successfully`);

        res.json({
            success: true,
            message: 'Livreur approved successfully',
            livreur: result.rows[0]
        });
    } catch (error) {
        console.error('❌ Error approving livreur:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to approve livreur',
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

// Load debug routes
console.log('Loading debug routes...');
try {
    const debugRouter = require('./routes/debug');
    app.use('/api/debug', debugRouter);
    console.log('✅ Debug routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading debug routes:', error);
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
      
      // Split schema into individual statements and execute them with error handling
      const statements = schema
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
      
      for (const statement of statements) {
        try {
          await db.query(statement);
        } catch (error) {
          // Ignore "already exists" errors
          if (error.message.includes('already exists') || error.message.includes('duplicate key')) {
            console.log('ℹ️ Table already exists, skipping...');
          } else {
            console.error('❌ Error executing statement:', error.message);
          }
        }
      }
      
      console.log('✅ Database tables initialized successfully');
    } else {
      console.log('⚠️ Schema file not found, skipping database initialization');
    }
  } catch (error) {
    console.error('❌ Error initializing database:', error.message);
    // Don't crash the server if schema creation fails
  }
}

// Debug endpoint to check Cloudinary configuration
app.get('/api/debug/check-cloudinary-config', async (req, res) => {
    try {
        console.log('🔍 Checking Cloudinary configuration...');
        
        // Check environment variables
        const envVars = {
            CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
            CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
            CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET ? '***SET***' : 'NOT_SET'
        };
        
        console.log('📋 Environment variables:', envVars);
        
        // Check if module is available
        let moduleAvailable = false;
        let moduleError = null;
        try {
            const cloudinary = require('cloudinary').v2;
            moduleAvailable = true;
            console.log('✅ Cloudinary module loaded successfully');
        } catch (error) {
            moduleError = error.message;
            console.log('❌ Cloudinary module error:', error.message);
        }
        
        // Check if configuration is valid
        let configValid = false;
        let configError = null;
        if (moduleAvailable && process.env.CLOUDINARY_CLOUD_NAME) {
            try {
                const cloudinary = require('cloudinary').v2;
                cloudinary.config({
                    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
                    api_key: process.env.CLOUDINARY_API_KEY,
                    api_secret: process.env.CLOUDINARY_API_SECRET
                });
                configValid = true;
                console.log('✅ Cloudinary configuration valid');
            } catch (error) {
                configError = error.message;
                console.log('❌ Cloudinary configuration error:', error.message);
            }
        }
        
        res.json({
            success: true,
            module_available: moduleAvailable,
            module_error: moduleError,
            env_vars: envVars,
            config_valid: configValid,
            config_error: configError,
            all_ready: moduleAvailable && configValid
        });
    } catch (error) {
        console.error('❌ Error checking Cloudinary config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check Cloudinary configuration',
            details: error.message
        });
    }
});

// Debug endpoint to upload livreur's local images to Cloudinary
app.post('/api/debug/upload-livreur-to-cloudinary', async (req, res) => {
    try {
        const { id_livreur } = req.body;
        
        if (!id_livreur) {
            return res.status(400).json({
                success: false,
                error: 'id_livreur is required'
            });
        }

        console.log(`🔧 Uploading livreur ${id_livreur} images to Cloudinary...`);

        // Check if Cloudinary is available
        let cloudinary;
        try {
            cloudinary = require('cloudinary').v2;
            if (!process.env.CLOUDINARY_CLOUD_NAME) {
                throw new Error('Cloudinary not configured');
            }
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: 'Cloudinary not available',
                details: error.message
            });
        }

        // Get current livreur data
        const livreurResult = await db.query(`
            SELECT photo_cni, photo_selfie, photo_vehicule, nom, prenom
            FROM Livreur 
            WHERE id_livreur = $1
        `, [id_livreur]);

        if (livreurResult.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Livreur not found'
            });
        }

        const livreur = livreurResult.rows[0];
        const fs = require('fs');
        const path = require('path');

        // Upload each image to Cloudinary
        const uploadPromises = [];
        const imageFields = [
            { field: 'photo_cni', key: 'cni' },
            { field: 'photo_selfie', key: 'selfie' },
            { field: 'photo_vehicule', key: 'vehicule' }
        ];

        for (const { field, key } of imageFields) {
            const localPath = livreur[field];
            if (localPath && localPath.startsWith('uploads/')) {
                const fullPath = path.join(__dirname, '..', localPath);
                
                if (fs.existsSync(fullPath)) {
                    console.log(`📤 Uploading ${key} to Cloudinary: ${localPath}`);
                    uploadPromises.push(
                        cloudinary.uploader.upload(fullPath, {
                            folder: 'vamo/livreurs',
                            resource_type: 'auto'
                        }).then(result => ({
                            field,
                            key,
                            cloudinaryUrl: result.secure_url,
                            success: true
                        })).catch(error => ({
                            field,
                            key,
                            error: error.message,
                            success: false
                        }))
                    );
                } else {
                    console.log(`⚠️ File not found: ${fullPath}`);
                    uploadPromises.push(Promise.resolve({
                        field,
                        key,
                        error: 'File not found',
                        success: false
                    }));
                }
            }
        }

        const uploadResults = await Promise.all(uploadPromises);
        
        // Update database with Cloudinary URLs
        const updates = {};
        uploadResults.forEach(result => {
            if (result.success) {
                updates[result.field] = result.cloudinaryUrl;
            }
        });

        if (Object.keys(updates).length > 0) {
            const updateQuery = `
                UPDATE Livreur 
                SET ${Object.keys(updates).map((field, index) => `${field} = $${index + 2}`).join(', ')}
                WHERE id_livreur = $1
                RETURNING id_livreur, nom, prenom, photo_cni, photo_selfie, photo_vehicule
            `;
            
            const updateValues = [id_livreur, ...Object.values(updates)];
            const updateResult = await db.query(updateQuery, updateValues);

            console.log(`✅ Livreur ${id_livreur} images updated with Cloudinary URLs`);

            res.json({
                success: true,
                message: 'Livreur images uploaded to Cloudinary successfully',
                livreur: updateResult.rows[0],
                uploadResults
            });
        } else {
            res.json({
                success: false,
                message: 'No images were uploaded',
                uploadResults
            });
        }

    } catch (error) {
        console.error('❌ Error uploading livreur to Cloudinary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to upload livreur to Cloudinary',
            details: error.message
        });
    }
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Server is running!',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

