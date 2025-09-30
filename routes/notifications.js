const express = require('express');
const router = express.Router();
const db = require('../db');
const pushNotificationService = require('../services/pushNotificationService');

/**
 * Notification Routes for Vamo Backend
 * Handles push token registration, notification preferences, and sending notifications
 */

/**
 * Register device push token
 * POST /api/notifications/register-token
 */
router.post('/register-token', async (req, res) => {
    try {
        console.log('📱 Registering device token...');
        
        const { clientId, driverId, deliveryPersonId, pushToken, platform, deviceType } = req.body;

        // Validate required fields
        if (!pushToken || !platform || !deviceType) {
            return res.status(400).json({
                success: false,
                error: 'Push token, platform, and device type are required'
            });
        }

        // Validate push token format
        if (!pushNotificationService.isValidExpoPushToken(pushToken)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid Expo push token format'
            });
        }

        let updateResult;

        // Update appropriate table based on device type
        switch (deviceType) {
            case 'client':
                if (!clientId) {
                    return res.status(400).json({
                        success: false,
                        error: 'Client ID is required for client device type'
                    });
                }

                updateResult = await db.query(`
                    UPDATE client 
                    SET push_token = $1, 
                        platform = $2, 
                        last_token_update = NOW(),
                        updated_at = NOW()
                    WHERE id_client = $3
                    RETURNING id_client, nom, prenom
                `, [pushToken, platform, clientId]);

                if (updateResult.rows.length === 0) {
                    return res.status(404).json({
                        success: false,
                        error: 'Client not found'
                    });
                }
                break;

            case 'driver':
                if (!driverId) {
                    return res.status(400).json({
                        success: false,
                        error: 'Driver ID is required for driver device type'
                    });
                }

                updateResult = await db.query(`
                    UPDATE chauffeur 
                    SET push_token = $1, 
                        platform = $2, 
                        last_token_update = NOW(),
                        updated_at = NOW()
                    WHERE id_chauffeur = $3
                    RETURNING id_chauffeur, nom, prenom
                `, [pushToken, platform, driverId]);

                if (updateResult.rows.length === 0) {
                    return res.status(404).json({
                        success: false,
                        error: 'Driver not found'
                    });
                }
                break;

            case 'delivery_person':
                if (!deliveryPersonId) {
                    return res.status(400).json({
                        success: false,
                        error: 'Delivery person ID is required for delivery person device type'
                    });
                }

                updateResult = await db.query(`
                    UPDATE livreur 
                    SET push_token = $1, 
                        platform = $2, 
                        last_token_update = NOW(),
                        updated_at = NOW()
                    WHERE id_livreur = $3
                    RETURNING id_livreur, nom, prenom
                `, [pushToken, platform, deliveryPersonId]);

                if (updateResult.rows.length === 0) {
                    return res.status(404).json({
                        success: false,
                        error: 'Delivery person not found'
                    });
                }
                break;

            default:
                return res.status(400).json({
                    success: false,
                    error: 'Invalid device type. Must be client, driver, or delivery_person'
                });
        }

        const user = updateResult.rows[0];
        
        console.log(`✅ Push token registered successfully for ${deviceType}:`, {
            id: user[Object.keys(user)[0]], // First key is the ID field
            name: `${user.prenom} ${user.nom}`,
            platform
        });

        res.json({
            success: true,
            message: 'Push token registered successfully',
            user: {
                id: user[Object.keys(user)[0]],
                name: `${user.prenom} ${user.nom}`,
                platform
            }
        });

    } catch (error) {
        console.error('❌ Error registering push token:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * Update notification preferences
 * POST /api/notifications/preferences
 */
router.post('/preferences', async (req, res) => {
    try {
        console.log('📱 Updating notification preferences...');
        
        const { clientId, driverId, deliveryPersonId, preferences } = req.body;

        if (!preferences || typeof preferences !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Preferences object is required'
            });
        }

        let updateResult;

        if (clientId) {
            updateResult = await db.query(`
                UPDATE client 
                SET notification_preferences = $1, updated_at = NOW()
                WHERE id_client = $2
                RETURNING id_client, nom, prenom
            `, [JSON.stringify(preferences), clientId]);
        } else if (driverId) {
            updateResult = await db.query(`
                UPDATE chauffeur 
                SET notification_preferences = $1, updated_at = NOW()
                WHERE id_chauffeur = $2
                RETURNING id_chauffeur, nom, prenom
            `, [JSON.stringify(preferences), driverId]);
        } else if (deliveryPersonId) {
            updateResult = await db.query(`
                UPDATE livreur 
                SET notification_preferences = $1, updated_at = NOW()
                WHERE id_livreur = $2
                RETURNING id_livreur, nom, prenom
            `, [JSON.stringify(preferences), deliveryPersonId]);
        } else {
            return res.status(400).json({
                success: false,
                error: 'User ID (clientId, driverId, or deliveryPersonId) is required'
            });
        }

        if (updateResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        console.log('✅ Notification preferences updated successfully');

        res.json({
            success: true,
            message: 'Notification preferences updated successfully',
            preferences
        });

    } catch (error) {
        console.error('❌ Error updating notification preferences:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * Send notification to client
 * POST /api/notifications/send-to-client
 */
router.post('/send-to-client', async (req, res) => {
    try {
        console.log('📱 Sending notification to client...');
        
        const { clientId, title, body, data, options } = req.body;

        if (!clientId || !title || !body) {
            return res.status(400).json({
                success: false,
                error: 'Client ID, title, and body are required'
            });
        }

        const result = await pushNotificationService.sendNotificationToClient(
            clientId, 
            title, 
            body, 
            data || {}, 
            options || {}
        );

        if (result.success) {
            res.json({
                success: true,
                message: 'Notification sent successfully',
                ticketId: result.ticketId
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }

    } catch (error) {
        console.error('❌ Error sending notification to client:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * Send notification to driver
 * POST /api/notifications/send-to-driver
 */
router.post('/send-to-driver', async (req, res) => {
    try {
        console.log('📱 Sending notification to driver...');
        
        const { driverId, title, body, data, options } = req.body;

        if (!driverId || !title || !body) {
            return res.status(400).json({
                success: false,
                error: 'Driver ID, title, and body are required'
            });
        }

        const result = await pushNotificationService.sendNotificationToDriver(
            driverId, 
            title, 
            body, 
            data || {}, 
            options || {}
        );

        if (result.success) {
            res.json({
                success: true,
                message: 'Notification sent successfully',
                ticketId: result.ticketId
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }

    } catch (error) {
        console.error('❌ Error sending notification to driver:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * Send notification to delivery person
 * POST /api/notifications/send-to-delivery-person
 */
router.post('/send-to-delivery-person', async (req, res) => {
    try {
        console.log('📱 Sending notification to delivery person...');
        
        const { deliveryPersonId, title, body, data, options } = req.body;

        if (!deliveryPersonId || !title || !body) {
            return res.status(400).json({
                success: false,
                error: 'Delivery person ID, title, and body are required'
            });
        }

        const result = await pushNotificationService.sendNotificationToDeliveryPerson(
            deliveryPersonId, 
            title, 
            body, 
            data || {}, 
            options || {}
        );

        if (result.success) {
            res.json({
                success: true,
                message: 'Notification sent successfully',
                ticketId: result.ticketId
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }

    } catch (error) {
        console.error('❌ Error sending notification to delivery person:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * Send ride request to available drivers
 * POST /api/notifications/send-ride-request
 */
router.post('/send-ride-request', async (req, res) => {
    try {
        console.log('📱 Sending ride request to available drivers...');
        
        const rideData = req.body;

        // Validate required fields
        const requiredFields = ['requestId', 'tripId', 'pickupAddress', 'destinationAddress', 
                              'pickupLatitude', 'pickupLongitude', 'estimatedPrice', 'clientId'];
        
        for (const field of requiredFields) {
            if (!rideData[field]) {
                return res.status(400).json({
                    success: false,
                    error: `${field} is required`
                });
            }
        }

        const result = await pushNotificationService.sendRideRequestToAvailableDrivers(
            rideData, 
            req.body.maxDrivers || 5
        );

        if (result.success) {
            res.json({
                success: true,
                message: 'Ride request sent to available drivers',
                driversNotified: result.driversNotified,
                driverIds: result.driverIds
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }

    } catch (error) {
        console.error('❌ Error sending ride request:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * Send delivery request to available delivery persons
 * POST /api/notifications/send-delivery-request
 */
router.post('/send-delivery-request', async (req, res) => {
    try {
        console.log('📱 Sending delivery request to available delivery persons...');
        
        const deliveryData = req.body;

        // Validate required fields
        const requiredFields = ['requestId', 'deliveryId', 'pickupAddress', 'destinationAddress', 
                              'pickupLatitude', 'pickupLongitude', 'estimatedPrice', 'clientId'];
        
        for (const field of requiredFields) {
            if (!deliveryData[field]) {
                return res.status(400).json({
                    success: false,
                    error: `${field} is required`
                });
            }
        }

        const result = await pushNotificationService.sendDeliveryRequestToAvailableDeliveryPersons(
            deliveryData, 
            req.body.maxDeliveryPersons || 5
        );

        if (result.success) {
            res.json({
                success: true,
                message: 'Delivery request sent to available delivery persons',
                deliveryPersonsNotified: result.deliveryPersonsNotified,
                deliveryPersonIds: result.deliveryPersonIds
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }

    } catch (error) {
        console.error('❌ Error sending delivery request:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * Send trip status notification
 * POST /api/notifications/trip-status
 */
router.post('/trip-status', async (req, res) => {
    try {
        console.log('📱 Sending trip status notification...');
        
        const { clientId, tripId, status, driverInfo } = req.body;

        if (!clientId || !tripId || !status) {
            return res.status(400).json({
                success: false,
                error: 'Client ID, trip ID, and status are required'
            });
        }

        const result = await pushNotificationService.sendTripStatusNotification(
            clientId, 
            tripId, 
            status, 
            driverInfo || {}
        );

        if (result.success) {
            res.json({
                success: true,
                message: 'Trip status notification sent successfully',
                ticketId: result.ticketId
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }

    } catch (error) {
        console.error('❌ Error sending trip status notification:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * Send delivery status notification
 * POST /api/notifications/delivery-status
 */
router.post('/delivery-status', async (req, res) => {
    try {
        console.log('📱 Sending delivery status notification...');
        
        const { clientId, deliveryId, status, deliveryPersonInfo } = req.body;

        if (!clientId || !deliveryId || !status) {
            return res.status(400).json({
                success: false,
                error: 'Client ID, delivery ID, and status are required'
            });
        }

        const result = await pushNotificationService.sendDeliveryStatusNotification(
            clientId, 
            deliveryId, 
            status, 
            deliveryPersonInfo || {}
        );

        if (result.success) {
            res.json({
                success: true,
                message: 'Delivery status notification sent successfully',
                ticketId: result.ticketId
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }

    } catch (error) {
        console.error('❌ Error sending delivery status notification:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * Check notification receipt status
 * POST /api/notifications/check-receipts
 */
router.post('/check-receipts', async (req, res) => {
    try {
        console.log('📱 Checking notification receipts...');
        
        const { ticketIds } = req.body;

        if (!ticketIds || !Array.isArray(ticketIds)) {
            return res.status(400).json({
                success: false,
                error: 'Ticket IDs array is required'
            });
        }

        const result = await pushNotificationService.checkReceiptStatus(ticketIds);

        if (result.success) {
            res.json({
                success: true,
                message: 'Receipt status checked successfully',
                results: result.results
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }

    } catch (error) {
        console.error('❌ Error checking receipt status:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * Get notification statistics
 * GET /api/notifications/stats
 */
router.get('/stats', async (req, res) => {
    try {
        console.log('📱 Getting notification statistics...');
        
        const result = await pushNotificationService.getNotificationStats();

        if (result.success) {
            res.json({
                success: true,
                stats: result.stats
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error
            });
        }

    } catch (error) {
        console.error('❌ Error getting notification stats:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * Test notification endpoint
 * POST /api/notifications/test
 */
router.post('/test', async (req, res) => {
    try {
        console.log('📱 Sending test notification...');
        
        const { pushToken, title, body, data } = req.body;

        if (!pushToken || !title || !body) {
            return res.status(400).json({
                success: false,
                error: 'Push token, title, and body are required'
            });
        }

        const result = await pushNotificationService.sendNotificationToDevice(
            pushToken, 
            title, 
            body, 
            data || { type: 'test' }
        );

        if (result.success) {
            res.json({
                success: true,
                message: 'Test notification sent successfully',
                ticketId: result.ticketId
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }

    } catch (error) {
        console.error('❌ Error sending test notification:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router;