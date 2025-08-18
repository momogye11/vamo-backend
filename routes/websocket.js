require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const router = express.Router();

// Store pour les connexions WebSocket des chauffeurs et livreurs
const connectedDrivers = new Map();
const connectedDeliveryDrivers = new Map();
// Store pour les connexions WebSocket des clients
const connectedClients = new Map();

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

        case 'delivery-driver-connect':
            handleDeliveryDriverConnect(ws, message);
            break;

        case 'client-connect':
            handleClientConnect(ws, message);
            break;

        case 'ping':
            handlePing(ws, message);
            break;

        case 'driver-disconnect':
            handleDriverDisconnect(ws, message);
            break;

        case 'delivery-driver-disconnect':
            handleDeliveryDriverDisconnect(ws, message);
            break;

        case 'driver-location-update':
            handleDriverLocationUpdate(ws, message);
            break;

        case 'delivery-driver-location-update':
            handleDeliveryDriverLocationUpdate(ws, message);
            break;

        case 'start-following-driver':
            handleStartFollowingDriver(ws, message);
            break;

        case 'stop-following-driver':
            handleStopFollowingDriver(ws, message);
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

// 🚚 FONCTIONS pour les livreurs
function handleDeliveryDriverConnect(ws, message) {
    const { driverId, driverName } = message.data || message;

    if (!driverId) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Delivery driver ID is required'
        }));
        return;
    }

    // Stocker la connexion du livreur
    ws.driverId = driverId;
    connectedDeliveryDrivers.set(driverId.toString(), {
        ws: ws,
        driverName: driverName || `Livreur ${driverId}`,
        connectedAt: new Date(),
        lastPing: new Date()
    });

    console.log(`✅ Delivery driver connected: ${driverName || 'Unknown'} (ID: ${driverId})`);
    console.log(`📊 Total delivery drivers connected: ${connectedDeliveryDrivers.size}`);

    // Confirmer la connexion
    ws.send(JSON.stringify({
        type: 'delivery-driver-connected',
        message: 'Successfully connected to delivery driver service',
        timestamp: new Date().toISOString()
    }));
}

function handleDeliveryDriverDisconnect(ws, message) {
    const { driverId } = message.data || message;
    const targetDriverId = driverId || ws.driverId;

    if (targetDriverId && connectedDeliveryDrivers.has(targetDriverId.toString())) {
        const driverData = connectedDeliveryDrivers.get(targetDriverId.toString());
        console.log(`👋 Delivery driver disconnecting: ${driverData.driverName} (ID: ${targetDriverId})`);
        connectedDeliveryDrivers.delete(targetDriverId.toString());
    }

    // Close with proper code
    if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Delivery driver disconnected');
    }
}

// Handler pour les connexions clients
function handleClientConnect(ws, message) {
    const { clientId, clientName } = message.data || message;
    
    if (!clientId) {
        console.error('❌ Client connection missing clientId');
        ws.send(JSON.stringify({
            type: 'error',
            message: 'clientId is required'
        }));
        return;
    }

    // Stocker la connexion client
    ws.clientId = clientId.toString();
    ws.clientName = clientName || `Client-${clientId}`;
    ws.lastPing = new Date();

    connectedClients.set(clientId.toString(), {
        ws: ws,
        clientId: clientId.toString(),
        clientName: ws.clientName,
        connectedAt: new Date(),
        lastPing: new Date()
    });

    console.log(`👤 Client connected: ${ws.clientName} (ID: ${clientId})`);
    console.log(`📊 Total clients connected: ${connectedClients.size}`);

    // Confirmer la connexion
    ws.send(JSON.stringify({
        type: 'client-connected',
        data: {
            success: true,
            message: 'Connected to client service successfully',
            clientId: clientId,
            timestamp: new Date().toISOString()
        }
    }));
}

function handleClientDisconnect(ws, message) {
    const { clientId } = message.data || message;
    const targetClientId = clientId || ws.clientId;

    if (targetClientId && connectedClients.has(targetClientId.toString())) {
        const clientData = connectedClients.get(targetClientId.toString());
        console.log(`👋 Client disconnecting: ${clientData.clientName} (ID: ${targetClientId})`);
        connectedClients.delete(targetClientId.toString());
    }

    console.log(`📊 Total clients connected: ${connectedClients.size}`);
}

// 🚀 FONCTION - Notifier un client spécifique via WebSocket
async function notifyClient(clientId, notification) {
    console.log(`📱 Notifying client ${clientId}:`, notification.type);
    
    const clientData = connectedClients.get(clientId.toString());
    
    if (!clientData) {
        console.log(`⚠️ Client ${clientId} not connected to WebSocket`);
        return false;
    }

    try {
        if (clientData.ws.readyState === WebSocket.OPEN) {
            clientData.ws.send(JSON.stringify(notification));
            console.log(`✅ Notification sent to client ${clientId}`);
            return true;
        } else {
            console.log(`⚠️ Client ${clientId} WebSocket connection not open`);
            connectedClients.delete(clientId.toString());
            return false;
        }
    } catch (error) {
        console.error(`❌ Error sending notification to client ${clientId}:`, error);
        connectedClients.delete(clientId.toString());
        return false;
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

// 🚚 FONCTION - Broadcast WebSocket à tous les livreurs disponibles
async function notifyAllDeliveryDrivers(availableDriversList, deliveryNotification) {
    console.log(`📡 Broadcasting delivery via WebSocket to ${availableDriversList.length} available delivery drivers`);
    console.log(`🔌 Currently connected delivery drivers: ${connectedDeliveryDrivers.size}`);

    let notifiedCount = 0;

    // Parcourir tous les livreurs disponibles
    for (const driver of availableDriversList) {
        const driverId = driver.id_livreur.toString();
        
        if (connectedDeliveryDrivers.has(driverId)) {
            const connectionData = connectedDeliveryDrivers.get(driverId);
            const ws = connectionData.ws;
            
            // Vérifier que la connexion est toujours ouverte
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    ws.send(JSON.stringify(deliveryNotification));
                    notifiedCount++;
                    console.log(`✅ Delivery notification sent to livreur: ${connectionData.driverName} (ID: ${driverId})`);
                } catch (error) {
                    console.error(`❌ Error sending delivery notification to livreur ${driverId}:`, error);
                    // Remove broken connection
                    connectedDeliveryDrivers.delete(driverId);
                }
            } else {
                console.log(`⚠️ Livreur ${driverId} connection is not open (state: ${ws.readyState}), removing from connected list`);
                connectedDeliveryDrivers.delete(driverId);
            }
        } else {
            console.log(`⚠️ Livreur ${driver.nom} ${driver.prenom} (ID: ${driverId}) is available in DB but not connected via WebSocket`);
        }
    }

    console.log(`📊 Delivery notification summary: ${notifiedCount}/${availableDriversList.length} livreurs notified`);
    return notifiedCount;
}

// Fonction pour obtenir les connexions WebSocket
function getWebSocketConnections() {
    const connections = {
        drivers: [],
        deliveryDrivers: []
    };
    
    // Connexions des chauffeurs
    for (const [driverId, data] of connectedDrivers.entries()) {
        connections.drivers.push({
            driverId: driverId,
            driverName: data.driverName,
            connectedAt: data.connectedAt,
            lastPing: data.lastPing,
            connected: data.ws.readyState === WebSocket.OPEN
        });
    }
    
    // Connexions des livreurs
    for (const [driverId, data] of connectedDeliveryDrivers.entries()) {
        connections.deliveryDrivers.push({
            driverId: driverId,
            driverName: data.driverName,
            connectedAt: data.connectedAt,
            lastPing: data.lastPing,
            connected: data.ws.readyState === WebSocket.OPEN
        });
    }
    
    return connections;
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

// Fonction pour notifier un chauffeur spécifique
async function notifyDriver(driverId, type, data) {
    console.log(`📡 Notifying driver ${driverId} with type: ${type}`);
    
    const driverData = connectedDrivers.get(driverId.toString());
    
    if (!driverData) {
        console.log(`⚠️ Driver ${driverId} not connected`);
        return { success: false, error: 'Driver not connected' };
    }

    if (driverData.ws.readyState !== WebSocket.OPEN) {
        console.log(`⚠️ Driver ${driverId} connection not open`);
        connectedDrivers.delete(driverId.toString());
        return { success: false, error: 'Driver connection not open' };
    }

    try {
        const notification = {
            type: type,
            data: {
                ...data,
                timestamp: new Date().toISOString()
            }
        };

        console.log(`📡 Sending notification to driver ${driverId}:`, notification);
        driverData.ws.send(JSON.stringify(notification));
        
        console.log(`✅ Notification sent successfully to driver ${driverId}`);
        return { success: true };
    } catch (error) {
        console.error(`❌ Error sending notification to driver ${driverId}:`, error);
        connectedDrivers.delete(driverId.toString());
        return { success: false, error: error.message };
    }
}

// 📍 NOUVELLES FONCTIONS - Gestion des mises à jour de position GPS temps réel

// Gestion des mises à jour de position des chauffeurs (ride-sharing)
function handleDriverLocationUpdate(ws, message) {
    const { driverId, latitude, longitude, heading, speed, accuracy } = message.data || {};
    
    if (!driverId || !latitude || !longitude) {
        console.error('❌ Invalid location update data:', message.data);
        ws.send(JSON.stringify({
            type: 'error',
            message: 'driverId, latitude, and longitude are required'
        }));
        return;
    }

    // Vérifier que le chauffeur est connecté
    const driverData = connectedDrivers.get(driverId.toString());
    if (!driverData) {
        console.log(`⚠️ Location update from non-connected driver: ${driverId}`);
        return;
    }

    console.log(`📍 Driver ${driverId} location update:`, { latitude, longitude, heading, speed });

    // Mettre à jour les données de position du chauffeur
    driverData.lastLocation = {
        latitude,
        longitude,
        heading: heading || null,
        speed: speed || null,
        accuracy: accuracy || null,
        timestamp: new Date().toISOString()
    };
    driverData.lastPing = new Date();

    // 📡 Trouver et notifier les clients qui suivent ce chauffeur
    notifyClientsFollowingDriver(driverId, driverData.lastLocation);

    // Confirmer la réception
    ws.send(JSON.stringify({
        type: 'location-update-received',
        data: {
            driverId,
            timestamp: new Date().toISOString()
        }
    }));
}

// Gestion des mises à jour de position des livreurs (delivery)
function handleDeliveryDriverLocationUpdate(ws, message) {
    const { driverId, latitude, longitude, heading, speed, accuracy } = message.data || {};
    
    if (!driverId || !latitude || !longitude) {
        console.error('❌ Invalid delivery driver location update data:', message.data);
        ws.send(JSON.stringify({
            type: 'error',
            message: 'driverId, latitude, and longitude are required'
        }));
        return;
    }

    // Vérifier que le livreur est connecté
    const driverData = connectedDeliveryDrivers.get(driverId.toString());
    if (!driverData) {
        console.log(`⚠️ Location update from non-connected delivery driver: ${driverId}`);
        return;
    }

    console.log(`📍 Delivery driver ${driverId} location update:`, { latitude, longitude, heading, speed });

    // Mettre à jour les données de position du livreur
    driverData.lastLocation = {
        latitude,
        longitude,
        heading: heading || null,
        speed: speed || null,
        accuracy: accuracy || null,
        timestamp: new Date().toISOString()
    };
    driverData.lastPing = new Date();

    // 📡 Trouver et notifier les clients qui suivent ce livreur
    notifyClientsFollowingDeliveryDriver(driverId, driverData.lastLocation);

    // Confirmer la réception
    ws.send(JSON.stringify({
        type: 'delivery-location-update-received',
        data: {
            driverId,
            timestamp: new Date().toISOString()
        }
    }));
}

// Fonction pour notifier les clients qui suivent un chauffeur spécifique
function notifyClientsFollowingDriver(driverId, location) {
    console.log(`📡 Looking for clients following driver ${driverId}`);
    
    let notifiedClients = 0;
    
    // Parcourir tous les clients connectés
    for (const [clientId, clientData] of connectedClients.entries()) {
        // Vérifier si ce client suit ce chauffeur (vous devrez adapter cette logique selon votre système)
        if (clientData.followingDriverId === driverId) {
            try {
                if (clientData.ws.readyState === WebSocket.OPEN) {
                    clientData.ws.send(JSON.stringify({
                        type: 'driver-location-update',
                        data: {
                            driverId,
                            location,
                            timestamp: new Date().toISOString()
                        }
                    }));
                    notifiedClients++;
                    console.log(`✅ Location sent to client ${clientId}`);
                } else {
                    console.log(`⚠️ Client ${clientId} connection not open`);
                    connectedClients.delete(clientId);
                }
            } catch (error) {
                console.error(`❌ Error sending location to client ${clientId}:`, error);
                connectedClients.delete(clientId);
            }
        }
    }
    
    console.log(`📊 Driver location sent to ${notifiedClients} clients`);
}

// Fonction pour notifier les clients qui suivent un livreur spécifique
function notifyClientsFollowingDeliveryDriver(driverId, location) {
    console.log(`📡 Looking for clients following delivery driver ${driverId}`);
    
    let notifiedClients = 0;
    
    // Parcourir tous les clients connectés
    for (const [clientId, clientData] of connectedClients.entries()) {
        // Vérifier si ce client suit ce livreur
        if (clientData.followingDeliveryDriverId === driverId) {
            try {
                if (clientData.ws.readyState === WebSocket.OPEN) {
                    clientData.ws.send(JSON.stringify({
                        type: 'delivery-driver-location-update',
                        data: {
                            driverId,
                            location,
                            timestamp: new Date().toISOString()
                        }
                    }));
                    notifiedClients++;
                    console.log(`✅ Delivery location sent to client ${clientId}`);
                } else {
                    console.log(`⚠️ Client ${clientId} connection not open`);
                    connectedClients.delete(clientId);
                }
            } catch (error) {
                console.error(`❌ Error sending delivery location to client ${clientId}:`, error);
                connectedClients.delete(clientId);
            }
        }
    }
    
    console.log(`📊 Delivery driver location sent to ${notifiedClients} clients`);
}

// Fonction pour qu'un client commence à suivre un chauffeur
function setClientFollowingDriver(clientId, driverId, isDelivery = false) {
    const clientData = connectedClients.get(clientId.toString());
    
    if (clientData) {
        if (isDelivery) {
            clientData.followingDeliveryDriverId = driverId.toString();
            console.log(`👤 Client ${clientId} now following delivery driver ${driverId}`);
        } else {
            clientData.followingDriverId = driverId.toString();
            console.log(`👤 Client ${clientId} now following driver ${driverId}`);
        }
        return true;
    }
    
    console.log(`⚠️ Cannot set following - client ${clientId} not connected`);
    return false;
}

// Fonction pour arrêter le suivi
function stopClientFollowing(clientId) {
    const clientData = connectedClients.get(clientId.toString());
    
    if (clientData) {
        clientData.followingDriverId = null;
        clientData.followingDeliveryDriverId = null;
        console.log(`👤 Client ${clientId} stopped following drivers`);
        return true;
    }
    
    return false;
}

// Gestion du message "start-following-driver" du client
function handleStartFollowingDriver(ws, message) {
    const { clientId, driverId, isDelivery } = message.data || {};
    
    if (!clientId || !driverId) {
        console.error('❌ Invalid start following data:', message.data);
        ws.send(JSON.stringify({
            type: 'error',
            message: 'clientId and driverId are required'
        }));
        return;
    }

    // Démarrer le suivi
    const success = setClientFollowingDriver(clientId, driverId, isDelivery);
    
    if (success) {
        console.log(`✅ Client ${clientId} now following ${isDelivery ? 'delivery ' : ''}driver ${driverId}`);
        
        // Confirmer au client
        ws.send(JSON.stringify({
            type: 'following-started',
            data: {
                driverId,
                isDelivery,
                timestamp: new Date().toISOString()
            }
        }));

        // Envoyer immédiatement la dernière position connue si disponible
        const driverData = isDelivery ? 
            connectedDeliveryDrivers.get(driverId.toString()) : 
            connectedDrivers.get(driverId.toString());
        
        if (driverData && driverData.lastLocation) {
            console.log(`📍 Sending last known location to client ${clientId}`);
            ws.send(JSON.stringify({
                type: isDelivery ? 'delivery-driver-location-update' : 'driver-location-update',
                data: {
                    driverId,
                    location: driverData.lastLocation,
                    timestamp: new Date().toISOString()
                }
            }));
        }
    } else {
        console.error(`❌ Failed to start following for client ${clientId}`);
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to start following driver'
        }));
    }
}

// Gestion du message "stop-following-driver" du client
function handleStopFollowingDriver(ws, message) {
    const { clientId } = message.data || {};
    
    if (!clientId) {
        console.error('❌ Invalid stop following data:', message.data);
        ws.send(JSON.stringify({
            type: 'error',
            message: 'clientId is required'
        }));
        return;
    }

    // Arrêter le suivi
    const success = stopClientFollowing(clientId);
    
    if (success) {
        console.log(`✅ Client ${clientId} stopped following drivers`);
        
        // Confirmer au client
        ws.send(JSON.stringify({
            type: 'following-stopped',
            data: {
                timestamp: new Date().toISOString()
            }
        }));
    } else {
        console.error(`❌ Failed to stop following for client ${clientId}`);
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to stop following driver'
        }));
    }
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
    notifyAllDeliveryDrivers,
    notifyClient,
    notifyDriver,
    getWebSocketConnections,
    notifyTripTaken,
    // 📍 Nouvelles fonctions pour le GPS temps réel
    setClientFollowingDriver,
    stopClientFollowing,
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