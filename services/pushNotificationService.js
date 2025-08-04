const { Expo } = require('expo-server-sdk');
const db = require('../db');

/**
 * Push Notification Service for Vamo Backend
 * Handles sending push notifications to clients and drivers using Expo Push API
 */
class PushNotificationService {
    constructor() {
        // Create a new Expo SDK client
        this.expo = new Expo({
            accessToken: process.env.EXPO_ACCESS_TOKEN, // Optional: for higher rate limits
            useFcmV1: true // Use FCM v1 API for better reliability
        });
        
        this.isInitialized = false;
        this.initialize();
    }

    /**
     * Initialize the push notification service
     */
    async initialize() {
        try {
            console.log('📱 Initializing Push Notification Service...');
            this.isInitialized = true;
            console.log('✅ Push Notification Service initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize Push Notification Service:', error);
        }
    }

    /**
     * Validate if a push token is valid Expo push token
     */
    isValidExpoPushToken(pushToken) {
        return Expo.isExpoPushToken(pushToken);
    }

    /**
     * Send notification to a single device
     */
    async sendNotificationToDevice(pushToken, title, body, data = {}, options = {}) {
        try {
            if (!this.isValidExpoPushToken(pushToken)) {
                console.error('❌ Invalid Expo push token:', pushToken);
                return { success: false, error: 'Invalid push token' };
            }

            const message = {
                to: pushToken,
                sound: options.sound || 'default',
                title: title,
                body: body,
                data: data,
                priority: options.priority || 'high',
                badge: options.badge || null,
                channelId: options.channelId || 'default',
                ...options
            };

            console.log('📱 Sending push notification:', {
                to: pushToken.substring(0, 20) + '...',
                title,
                body,
                data
            });

            const tickets = await this.expo.sendPushNotificationsAsync([message]);
            
            if (tickets[0].status === 'error') {
                console.error('❌ Push notification error:', tickets[0].message);
                return { success: false, error: tickets[0].message };
            }

            console.log('✅ Push notification sent successfully:', tickets[0].id);
            return { success: true, ticketId: tickets[0].id };

        } catch (error) {
            console.error('❌ Error sending push notification:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send notifications to multiple devices
     */
    async sendNotificationToMultipleDevices(pushTokens, title, body, data = {}, options = {}) {
        try {
            // Validate and filter valid tokens
            const validTokens = pushTokens.filter(token => this.isValidExpoPushToken(token));
            
            if (validTokens.length === 0) {
                console.error('❌ No valid push tokens provided');
                return { success: false, error: 'No valid push tokens' };
            }

            const messages = validTokens.map(pushToken => ({
                to: pushToken,
                sound: options.sound || 'default',
                title: title,
                body: body,
                data: data,
                priority: options.priority || 'high',
                badge: options.badge || null,
                channelId: options.channelId || 'default',
                ...options
            }));

            console.log(`📱 Sending push notifications to ${validTokens.length} devices`);

            // Send notifications in chunks of 100 (Expo limit)
            const chunks = this.expo.chunkPushNotifications(messages);
            const tickets = [];

            for (let chunk of chunks) {
                try {
                    const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
                    tickets.push(...ticketChunk);
                } catch (error) {
                    console.error('❌ Error sending notification chunk:', error);
                }
            }

            const successCount = tickets.filter(ticket => ticket.status === 'ok').length;
            const errorCount = tickets.filter(ticket => ticket.status === 'error').length;

            console.log(`✅ Push notifications sent: ${successCount} successful, ${errorCount} failed`);
            
            return { 
                success: true, 
                tickets, 
                successCount, 
                errorCount,
                totalSent: tickets.length 
            };

        } catch (error) {
            console.error('❌ Error sending bulk push notifications:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send notification to client by ID
     */
    async sendNotificationToClient(clientId, title, body, data = {}, options = {}) {
        try {
            console.log(`📱 Sending notification to client ${clientId}`);

            // Get client's push token from database
            const result = await db.query(
                'SELECT push_token, notification_preferences FROM client WHERE id_client = $1',
                [clientId]
            );

            if (result.rows.length === 0) {
                console.error('❌ Client not found:', clientId);
                return { success: false, error: 'Client not found' };
            }

            const client = result.rows[0];
            const pushToken = client.push_token;

            if (!pushToken) {
                console.error('❌ Client has no push token:', clientId);
                return { success: false, error: 'Client has no push token' };
            }

            // Check notification preferences
            const preferences = client.notification_preferences || {};
            const notificationType = data.type || 'general';
            
            if (preferences[notificationType] === false) {
                console.log(`📱 Client ${clientId} has disabled ${notificationType} notifications`);
                return { success: true, message: 'Notification disabled by user preference' };
            }

            return await this.sendNotificationToDevice(pushToken, title, body, {
                ...data,
                clientId: clientId
            }, options);

        } catch (error) {
            console.error('❌ Error sending notification to client:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send notification to driver by ID
     */
    async sendNotificationToDriver(driverId, title, body, data = {}, options = {}) {
        try {
            console.log(`📱 Sending notification to driver ${driverId}`);

            // Get driver's push token from database
            const result = await db.query(
                'SELECT push_token, notification_preferences FROM chauffeur WHERE id_chauffeur = $1',
                [driverId]
            );

            if (result.rows.length === 0) {
                console.error('❌ Driver not found:', driverId);
                return { success: false, error: 'Driver not found' };
            }

            const driver = result.rows[0];
            const pushToken = driver.push_token;

            if (!pushToken) {
                console.error('❌ Driver has no push token:', driverId);
                return { success: false, error: 'Driver has no push token' };
            }

            // Check notification preferences
            const preferences = driver.notification_preferences || {};
            const notificationType = data.type || 'general';
            
            if (preferences[notificationType] === false) {
                console.log(`📱 Driver ${driverId} has disabled ${notificationType} notifications`);
                return { success: true, message: 'Notification disabled by user preference' };
            }

            return await this.sendNotificationToDevice(pushToken, title, body, {
                ...data,
                driverId: driverId
            }, options);

        } catch (error) {
            console.error('❌ Error sending notification to driver:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send notification to delivery person by ID
     */
    async sendNotificationToDeliveryPerson(deliveryPersonId, title, body, data = {}, options = {}) {
        try {
            console.log(`📱 Sending notification to delivery person ${deliveryPersonId}`);

            // Get delivery person's push token from database
            const result = await db.query(
                'SELECT push_token, notification_preferences FROM livreur WHERE id_livreur = $1',
                [deliveryPersonId]
            );

            if (result.rows.length === 0) {
                console.error('❌ Delivery person not found:', deliveryPersonId);
                return { success: false, error: 'Delivery person not found' };
            }

            const deliveryPerson = result.rows[0];
            const pushToken = deliveryPerson.push_token;

            if (!pushToken) {
                console.error('❌ Delivery person has no push token:', deliveryPersonId);
                return { success: false, error: 'Delivery person has no push token' };
            }

            // Check notification preferences
            const preferences = deliveryPerson.notification_preferences || {};
            const notificationType = data.type || 'general';
            
            if (preferences[notificationType] === false) {
                console.log(`📱 Delivery person ${deliveryPersonId} has disabled ${notificationType} notifications`);
                return { success: true, message: 'Notification disabled by user preference' };
            }

            return await this.sendNotificationToDevice(pushToken, title, body, {
                ...data,
                deliveryPersonId: deliveryPersonId
            }, options);

        } catch (error) {
            console.error('❌ Error sending notification to delivery person:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send ride request notification to available drivers
     */
    async sendRideRequestToAvailableDrivers(rideData, maxDrivers = 5) {
        try {
            console.log('📱 Sending ride request to available drivers');

            // Get available drivers near the pickup location
            const result = await db.query(`
                SELECT c.id_chauffeur, c.push_token, c.nom, c.prenom, pc.latitude, pc.longitude
                FROM chauffeur c
                JOIN position_chauffeur pc ON c.id_chauffeur = pc.id_chauffeur
                WHERE c.disponibilite = true 
                AND c.statut_validation = 'approuve'
                AND c.push_token IS NOT NULL
                AND pc.timestamp > NOW() - INTERVAL '10 minutes'
                ORDER BY ST_Distance(
                    ST_MakePoint(pc.longitude, pc.latitude),
                    ST_MakePoint($1, $2)
                ) ASC
                LIMIT $3
            `, [rideData.pickupLongitude, rideData.pickupLatitude, maxDrivers]);

            if (result.rows.length === 0) {
                console.log('❌ No available drivers found');
                return { success: false, error: 'No available drivers found' };
            }

            const drivers = result.rows;
            const title = 'Nouvelle demande de course';
            const body = `Course depuis ${rideData.pickupAddress} - ${rideData.estimatedPrice} FCFA`;
            
            const notificationData = {
                type: 'ride_request',
                requestId: rideData.requestId,
                tripId: rideData.tripId,
                pickup: rideData.pickupAddress,
                destination: rideData.destinationAddress,
                distance: rideData.distance,
                duration: rideData.duration,
                estimatedPrice: rideData.estimatedPrice,
                paymentMethod: rideData.paymentMethod,
                clientId: rideData.clientId,
                pickupLatitude: rideData.pickupLatitude,
                pickupLongitude: rideData.pickupLongitude,
                destinationLatitude: rideData.destinationLatitude,
                destinationLongitude: rideData.destinationLongitude
            };

            const pushTokens = drivers.map(driver => driver.push_token);
            
            const result_send = await this.sendNotificationToMultipleDevices(
                pushTokens, 
                title, 
                body, 
                notificationData,
                {
                    sound: 'ride-request.wav',
                    priority: 'high',
                    channelId: 'ride_requests'
                }
            );

            console.log(`✅ Ride request sent to ${drivers.length} drivers`);
            
            return {
                success: true,
                driversNotified: drivers.length,
                driverIds: drivers.map(d => d.id_chauffeur),
                notifications: result_send
            };

        } catch (error) {
            console.error('❌ Error sending ride request to drivers:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send delivery request notification to available delivery persons
     */
    async sendDeliveryRequestToAvailableDeliveryPersons(deliveryData, maxDeliveryPersons = 5) {
        try {
            console.log('📱 Sending delivery request to available delivery persons');

            // Get available delivery persons near the pickup location
            const result = await db.query(`
                SELECT l.id_livreur, l.push_token, l.nom, l.prenom, pl.latitude, pl.longitude
                FROM livreur l
                JOIN position_livreur pl ON l.id_livreur = pl.id_livreur
                WHERE l.disponibilite = true 
                AND l.statut_validation = 'approuve'
                AND l.push_token IS NOT NULL
                AND pl.timestamp > NOW() - INTERVAL '10 minutes'
                ORDER BY ST_Distance(
                    ST_MakePoint(pl.longitude, pl.latitude),
                    ST_MakePoint($1, $2)
                ) ASC
                LIMIT $3
            `, [deliveryData.pickupLongitude, deliveryData.pickupLatitude, maxDeliveryPersons]);

            if (result.rows.length === 0) {
                console.log('❌ No available delivery persons found');
                return { success: false, error: 'No available delivery persons found' };
            }

            const deliveryPersons = result.rows;
            const title = 'Nouvelle demande de livraison';
            const body = `Livraison depuis ${deliveryData.pickupAddress} - ${deliveryData.estimatedPrice} FCFA`;
            
            const notificationData = {
                type: 'delivery_request',
                requestId: deliveryData.requestId,
                deliveryId: deliveryData.deliveryId,
                pickup: deliveryData.pickupAddress,
                destination: deliveryData.destinationAddress,
                packageSize: deliveryData.packageSize,
                packageDescription: deliveryData.packageDescription,
                distance: deliveryData.distance,
                duration: deliveryData.duration,
                estimatedPrice: deliveryData.estimatedPrice,
                paymentMethod: deliveryData.paymentMethod,
                clientId: deliveryData.clientId,
                pickupLatitude: deliveryData.pickupLatitude,
                pickupLongitude: deliveryData.pickupLongitude,
                destinationLatitude: deliveryData.destinationLatitude,
                destinationLongitude: deliveryData.destinationLongitude
            };

            const pushTokens = deliveryPersons.map(person => person.push_token);
            
            const result_send = await this.sendNotificationToMultipleDevices(
                pushTokens, 
                title, 
                body, 
                notificationData,
                {
                    sound: 'delivery-request.wav',
                    priority: 'high',
                    channelId: 'delivery_requests'
                }
            );

            console.log(`✅ Delivery request sent to ${deliveryPersons.length} delivery persons`);
            
            return {
                success: true,
                deliveryPersonsNotified: deliveryPersons.length,
                deliveryPersonIds: deliveryPersons.map(d => d.id_livreur),
                notifications: result_send
            };

        } catch (error) {
            console.error('❌ Error sending delivery request to delivery persons:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send trip status update notification to client
     */
    async sendTripStatusNotification(clientId, tripId, status, driverInfo = {}) {
        try {
            let title, body, notificationType;
            
            switch (status) {
                case 'driver_assigned':
                    title = 'Chauffeur assigné';
                    body = `${driverInfo.name || 'Votre chauffeur'} va venir vous chercher`;
                    notificationType = 'trip_updates';
                    break;
                    
                case 'driver_arrived':
                    title = 'Chauffeur arrivé';
                    body = `${driverInfo.name || 'Votre chauffeur'} est arrivé au point de rendez-vous`;
                    notificationType = 'trip_updates';
                    break;
                    
                case 'trip_started':
                    title = 'Voyage commencé';
                    body = 'Votre voyage a commencé. Bon voyage !';
                    notificationType = 'trip_updates';
                    break;
                    
                case 'trip_completed':
                    title = 'Voyage terminé';
                    body = 'Vous êtes arrivé à destination. Évaluez votre chauffeur !';
                    notificationType = 'trip_updates';
                    break;
                    
                default:
                    title = 'Mise à jour de voyage';
                    body = 'Votre voyage a été mis à jour';
                    notificationType = 'trip_updates';
            }

            return await this.sendNotificationToClient(clientId, title, body, {
                type: status,
                tripId: tripId,
                driverInfo: driverInfo
            }, {
                channelId: 'trip_updates'
            });

        } catch (error) {
            console.error('❌ Error sending trip status notification:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send delivery status update notification to client
     */
    async sendDeliveryStatusNotification(clientId, deliveryId, status, deliveryPersonInfo = {}) {
        try {
            let title, body, notificationType;
            
            switch (status) {
                case 'delivery_person_assigned':
                    title = 'Livreur assigné';
                    body = `${deliveryPersonInfo.name || 'Votre livreur'} va récupérer votre colis`;
                    notificationType = 'delivery_updates';
                    break;
                    
                case 'pickup_arrived':
                    title = 'Livreur au point de récupération';
                    body = 'Votre livreur est arrivé pour récupérer le colis';
                    notificationType = 'delivery_updates';
                    break;
                    
                case 'package_collected':
                    title = 'Colis récupéré';
                    body = 'Votre colis a été récupéré et est en route vers vous';
                    notificationType = 'delivery_updates';
                    break;
                    
                case 'delivery_completed':
                    title = 'Livraison terminée';
                    body = 'Votre colis a été livré avec succès !';
                    notificationType = 'delivery_updates';
                    break;
                    
                default:
                    title = 'Mise à jour de livraison';
                    body = 'Votre livraison a été mise à jour';
                    notificationType = 'delivery_updates';
            }

            return await this.sendNotificationToClient(clientId, title, body, {
                type: status,
                deliveryId: deliveryId,
                deliveryPersonInfo: deliveryPersonInfo
            }, {
                channelId: 'delivery_updates'
            });

        } catch (error) {
            console.error('❌ Error sending delivery status notification:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Check receipt status for notifications
     */
    async checkReceiptStatus(ticketIds) {
        try {
            if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
                return { success: false, error: 'No ticket IDs provided' };
            }

            console.log(`📱 Checking receipt status for ${ticketIds.length} notifications`);

            const receiptIds = await this.expo.getPushNotificationReceiptsAsync(ticketIds);
            
            const results = {
                success: 0,
                error: 0,
                details: receiptIds
            };

            Object.values(receiptIds).forEach(receipt => {
                if (receipt.status === 'ok') {
                    results.success++;
                } else {
                    results.error++;
                    console.error('❌ Notification receipt error:', receipt);
                }
            });

            console.log(`✅ Receipt check completed: ${results.success} successful, ${results.error} failed`);
            
            return { success: true, results };

        } catch (error) {
            console.error('❌ Error checking receipt status:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get notification statistics
     */
    async getNotificationStats() {
        try {
            // This would query your database for notification statistics
            // For now, return basic stats
            return {
                success: true,
                stats: {
                    totalSent: 0,
                    totalDelivered: 0,
                    totalFailed: 0,
                    activeTokens: 0
                }
            };
        } catch (error) {
            console.error('❌ Error getting notification stats:', error);
            return { success: false, error: error.message };
        }
    }
}

// Export singleton instance
module.exports = new PushNotificationService();