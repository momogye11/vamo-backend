require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const router = express.Router();

// Store pour les connexions WebSocket des chauffeurs
const connectedDrivers = new Map();

/**
 * 🚀 WEBSOCKET avec bibliothèque 'ws' (compatible React Native)
 */

// Initialiser WebSocket server avec la bibliothèque ws
function initializeWebSocket(server) {
    console.log('🚀 WebSocket Server initialized (using ws library)');

    // Créer le serveur WebSocket
    const wss = new WebSocket.Server({
        server: server,
        path: '/api/ws'
    });

    console.log('📡 WebSocket server listening on path: /api/ws');

    wss.on('connection', (ws, request) => {
        console.log(`🔌 New WebSocket connection from ${request.socket.remoteAddress}`);
        console.log(`📡 Connection URL: ${request.url}`);
        console.log(`📊 Total connections: ${wss.clients.size}`);

        // Assigner un ID unique à cette connexion
        ws.id = generateUniqueId();
        ws.isAlive = true;
        ws.driverId = null;

        // Gestion des messages reçus
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log('📨 WebSocket message received:', message);
                handleWebSocketMessage(ws, message);
            } catch (error) {
                console.error('❌ Error parsing WebSocket message:', error);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Invalid JSON format'
                }));
            }
        });

        // Gestion de la fermeture de connexion
        ws.on('close', (code, reason) => {
            console.log(`🔌 WebSocket disconnected: ${ws.id}, code: ${code}, reason: ${reason}`);

            // Supprimer le chauffeur de la Map si connecté
            if (ws.driverId) {
                const driverData = connectedDrivers.get(ws.driverId.toString());
                if (driverData) {
                    console.log(`👋 Driver ${driverData.driverName} (ID: ${ws.driverId}) disconnected`);
                    connectedDrivers.delete(ws.driverId.toString());
                }
            }

            console.log(`📊 Remaining connected drivers: ${connectedDrivers.size}`);
        });

        // Gestion des erreurs
        ws.on('error', (error) => {
            console.error('❌ WebSocket error:', error);
        });

        // Ping/Pong pour vérifier la connexion
        ws.on('pong', () => {
            ws.isAlive = true;
        });

        // Envoyer un message de bienvenue
        ws.send(JSON.stringify({
            type: 'connection-established',
            data: {
                message: 'WebSocket connection established',
                connectionId: ws.id,
                timestamp: new Date().toISOString()
            }
        }));
    });

    // Ping périodique pour vérifier les connexions
    const pingInterval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (!ws.isAlive) {
                console.log(`💀 Terminating dead connection: ${ws.id}`);
                return ws.terminate();
            }

            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);

    wss.on('close', () => {
        clearInterval(pingInterval);
    });

    return wss;
}

// Générer un ID unique
function generateUniqueId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Gestion des messages WebSocket
function handleWebSocketMessage(ws, message) {
    if (!message || !message.type) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Message type is required'
        }));
        return;
    }

    switch (message.type) {
        case 'driver-connect':
            handleDriverConnect(ws, message);
            break;

        case 'ping':
            handlePing(ws, message);
            break;

        case 'driver-disconnect':
            handleDriverDisconnect(ws, message);
            break;

        default:
            console.log(`⚠️ Unknown message type: ${message.type}`);
            ws.send(JSON.stringify({
                type: 'error',
                message: `Unknown message type: ${message.type}`
            }));
    }
}

// Chauffeur se connecte et s'identifie
function handleDriverConnect(ws, message) {
    const { driverId, driverName } = message.data || message;

    if (!driverId) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Driver ID is required'
        }));
        return;
    }

    // Stocker la connexion du chauffeur
    ws.driverId = driverId;
    connectedDrivers.set(driverId.toString(), {
        ws: ws,
        driverName: driverName || `Driver ${driverId}`,
        connectedAt: new Date(),
        lastPing: new Date()
    });

    console.log(`✅ Driver connected: ${driverName || 'Unknown'} (ID: ${driverId})`);
    console.log(`📊 Total connected drivers: ${connectedDrivers.size}`);

    // Confirmer la connexion au chauffeur
    ws.send(JSON.stringify({
        type: 'driver-connected',
        data: {
            success: true,
            message: 'Connected to WebSocket successfully',
            driverId: driverId,
            connectionId: ws.id,
            timestamp: new Date().toISOString()
        }
    }));
}

// Gestion du ping
function handlePing(ws, message) {
    const driverId = message.data?.driverId || ws.driverId;

    if (driverId && connectedDrivers.has(driverId.toString())) {
        const driverData = connectedDrivers.get(driverId.toString());
        driverData.lastPing = new Date();

        ws.send(JSON.stringify({
            type: 'pong',
            data: {
                timestamp: new Date().toISOString(),
                driverId: driverId
            }
        }));
    } else {
        ws.send(JSON.stringify({
            type: 'pong',
            data: {
                timestamp: new Date().toISOString()
            }
        }));
    }
}

// Déconnexion propre
function handleDriverDisconnect(ws, message) {
    const { driverId } = message.data || message;
    const targetDriverId = driverId || ws.driverId;

    if (targetDriverId && connectedDrivers.has(targetDriverId.toString())) {
        const driverData = connectedDrivers.get(targetDriverId.toString());
        console.log(`👋 Driver disconnecting: ${driverData.driverName} (ID: ${targetDriverId})`);
        connectedDrivers.delete(targetDriverId.toString());
    }

    // Close with proper code
    if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Driver disconnected');
    }
}

// 🚀 FONCTION - Broadcast WebSocket à tous les chauffeurs disponibles
async function notifyAllDrivers(availableDriversList, rideNotification) {
    console.log(`📡 Broadcasting via WebSocket to ${availableDriversList.length} available drivers`);
    console.log(`🔌 Currently connected: ${connectedDrivers.size} drivers`);

    let notifiedCount = 0;

    // Parcourir tous les chauffeurs disponibles en base
    for (const driver of availableDriversList) {
        const driverId = driver.id_chauffeur.toString();

        // Vérifier si ce chauffeur est connecté via WebSocket
        if (connectedDrivers.has(driverId)) {
            const driverData = connectedDrivers.get(driverId);

            try {
                const notification = {
                    type: 'ride-notification',
                    data: {
                        notificationType: 'new_ride',
                        rideData: rideNotification.data,
                        timestamp: new Date().toISOString(),
                        driverName: `${driver.prenom} ${driver.nom}`
                    }
                };

                // Envoyer via WebSocket si la connexion est active
                if (driverData.ws.readyState === WebSocket.OPEN) {
                    driverData.ws.send(JSON.stringify(notification));
                    console.log(`✅ WebSocket notification sent to ${driver.prenom} ${driver.nom} (ID: ${driverId})`);
                    notifiedCount++;
                } else {
                    console.log(`🔌 WebSocket closed for driver ${driverId}, removing from connected list`);
                    connectedDrivers.delete(driverId);
                }

            } catch (error) {
                console.error(`❌ Error sending WebSocket to driver ${driverId}:`, error.message);
                connectedDrivers.delete(driverId);
            }
        } else {
            console.log(`⚠️ Driver ${driver.prenom} ${driver.nom} (ID: ${driverId}) not connected via WebSocket`);
        }
    }

    console.log(`📊 WebSocket broadcast completed: ${notifiedCount}/${availableDriversList.length} drivers notified`);
    return notifiedCount;
}

// Fonction pour notifier qu'une course a été prise
function notifyTripTaken(tripId, takenByDriverId) {
    console.log(`📢 Broadcasting trip taken: ${tripId} by driver ${takenByDriverId}`);

    const notification = {
        type: 'ride-notification',
        data: {
            notificationType: 'trip_taken',
            tripId: tripId,
            takenBy: takenByDriverId,
            message: 'Course prise par un autre chauffeur',
            timestamp: new Date().toISOString()
        }
    };

    // Envoyer à tous les chauffeurs connectés (sauf celui qui a pris)
    let notifiedCount = 0;
    for (const [driverId, driverData] of connectedDrivers.entries()) {
        if (driverId !== takenByDriverId.toString()) {
            try {
                if (driverData.ws.readyState === WebSocket.OPEN) {
                    driverData.ws.send(JSON.stringify(notification));
                    notifiedCount++;
                } else {
                    connectedDrivers.delete(driverId);
                }
            } catch (error) {
                console.error(`❌ Error notifying driver ${driverId}:`, error.message);
                connectedDrivers.delete(driverId);
            }
        }
    }

    console.log(`📊 Trip taken notification sent to ${notifiedCount} drivers`);
}

// Route de debug pour voir les connexions
router.get('/debug/connections', (req, res) => {
    const connections = [];
    for (const [driverId, data] of connectedDrivers.entries()) {
        connections.push({
            driverId: driverId,
            driverName: data.driverName,
            connectedAt: data.connectedAt,
            lastPing: data.lastPing,
            connected: data.ws.readyState === WebSocket.OPEN
        });
    }

    const status = {
        totalConnections: connectedDrivers.size,
        connections: connections,
        serverType: 'WebSocket (ws library)'
    };

    console.log('📊 WebSocket Connection Status:', status);
    res.json(status);
});

// Route de test WebSocket
router.get('/test', (req, res) => {
    console.log('📡 WebSocket test endpoint hit');
    res.json({
        success: true,
        message: 'WebSocket endpoint accessible',
        path: '/api/ws',
        serverType: 'ws library',
        connectedDrivers: connectedDrivers.size,
        timestamp: new Date().toISOString()
    });
});

// Nettoyage des connexions mortes toutes les 2 minutes
setInterval(() => {
    const now = new Date();
    const maxInactivity = 2 * 60 * 1000; // 2 minutes

    for (const [driverId, driverData] of connectedDrivers.entries()) {
        const inactiveTime = now - driverData.lastPing;

        if (inactiveTime > maxInactivity || driverData.ws.readyState !== WebSocket.OPEN) {
            console.log(`🧹 Cleaning up inactive driver: ${driverData.driverName} (ID: ${driverId})`);
            connectedDrivers.delete(driverId);
        }
    }
}, 2 * 60 * 1000);

// Export des fonctions
module.exports = {
    router,
    initializeWebSocket,
    notifyAllDrivers,
    notifyTripTaken,
    getConnectedDriversCount: () => connectedDrivers.size,
    getConnectionStatus: () => {
        const connections = [];
        for (const [driverId, data] of connectedDrivers.entries()) {
            connections.push({
                driverId,
                driverName: data.driverName,
                connected: data.ws.readyState === WebSocket.OPEN,
                connectedAt: data.connectedAt
            });
        }
        return {
            totalConnections: connectedDrivers.size,
            connections,
            serverType: 'WebSocket (ws library)'
        };
    }
};