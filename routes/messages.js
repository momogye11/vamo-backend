const express = require('express');
const router = express.Router();
const pool = require('../db/index');

// Récupérer les messages d'un voyage (course)
router.get('/trip/:tripId', async (req, res) => {
    try {
        const { tripId } = req.params;
        
        const query = `
            SELECT 
                id_message as id,
                sender_id as senderId,
                sender_type as senderType,
                receiver_id as receiverId,
                receiver_type as receiverType,
                message_text as text,
                timestamp,
                is_read as isRead
            FROM Messages 
            WHERE trip_id = $1 AND service_type = 'course'
            ORDER BY timestamp ASC
        `;
        
        const result = await pool.query(query, [tripId]);
        
        // Marquer les messages comme lus
        await pool.query(
            'UPDATE Messages SET is_read = true WHERE trip_id = $1 AND service_type = $2',
            [tripId, 'course']
        );
        
        res.json({
            success: true,
            messages: result.rows
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des messages:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de la récupération des messages'
        });
    }
});

// Récupérer les messages d'une livraison
router.get('/delivery/:tripId', async (req, res) => {
    try {
        const { tripId } = req.params;
        
        const query = `
            SELECT 
                id_message as id,
                sender_id as senderId,
                sender_type as senderType,
                receiver_id as receiverId,
                receiver_type as receiverType,
                message_text as text,
                timestamp,
                is_read as isRead
            FROM Messages 
            WHERE trip_id = $1 AND service_type = 'delivery'
            ORDER BY timestamp ASC
        `;
        
        const result = await pool.query(query, [tripId]);
        
        // Marquer les messages comme lus
        await pool.query(
            'UPDATE Messages SET is_read = true WHERE trip_id = $1 AND service_type = $2',
            [tripId, 'delivery']
        );
        
        res.json({
            success: true,
            messages: result.rows
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des messages:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de la récupération des messages'
        });
    }
});

// Envoyer un message pour un voyage (course)
router.post('/trip/send', async (req, res) => {
    try {
        const { tripId, senderId, senderType, message } = req.body;
        
        if (!tripId || !senderId || !senderType || !message) {
            return res.status(400).json({
                success: false,
                error: 'Paramètres manquants: tripId, senderId, senderType, message requis'
            });
        }
        
        // Déterminer le destinataire selon le type d'expéditeur
        let receiverId = null;
        let receiverType = null;
        
        // Vérifier si tripId est un vrai ID de course (nombre) ou un ID temporaire (string)
        const isRealTripId = !isNaN(tripId) && Number.isInteger(Number(tripId));
        
        if (isRealTripId) {
            if (senderType === 'client') {
                // Si c'est un client qui envoie, récupérer l'ID du chauffeur
                const tripQuery = 'SELECT id_chauffeur FROM Course WHERE id_course = $1';
                const tripResult = await pool.query(tripQuery, [parseInt(tripId)]);
                if (tripResult.rows.length > 0) {
                    receiverId = tripResult.rows[0].id_chauffeur;
                    receiverType = 'chauffeur';
                }
            } else if (senderType === 'chauffeur') {
                // Si c'est un chauffeur qui envoie, récupérer l'ID du client
                const tripQuery = 'SELECT id_client FROM Course WHERE id_course = $1';
                const tripResult = await pool.query(tripQuery, [parseInt(tripId)]);
                if (tripResult.rows.length > 0) {
                    receiverId = tripResult.rows[0].id_client;
                    receiverType = 'client';
                }
            }
        } else {
            // Pour les IDs temporaires, utiliser des valeurs par défaut
            console.log('🔍 Using temporary trip ID, setting default receiver');
            if (senderType === 'client') {
                receiverId = 1; // ID du chauffeur par défaut
                receiverType = 'chauffeur';
            } else if (senderType === 'chauffeur') {
                receiverId = 1; // ID du client par défaut  
                receiverType = 'client';
            }
        }
        
        const insertQuery = `
            INSERT INTO Messages (trip_id, sender_id, sender_type, receiver_id, receiver_type, message_text, service_type)
            VALUES ($1, $2, $3, $4, $5, $6, 'course')
            RETURNING *
        `;
        
        const result = await pool.query(insertQuery, [
            tripId, senderId, senderType, receiverId, receiverType, message
        ]);
        
        res.json({
            success: true,
            message: result.rows[0]
        });
    } catch (error) {
        console.error('Erreur lors de l\'envoi du message:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de l\'envoi du message'
        });
    }
});

// Envoyer un message pour une livraison
router.post('/delivery/send', async (req, res) => {
    try {
        const { tripId, senderId, senderType, message } = req.body;
        
        if (!tripId || !senderId || !senderType || !message) {
            return res.status(400).json({
                success: false,
                error: 'Paramètres manquants: tripId, senderId, senderType, message requis'
            });
        }
        
        // Déterminer le destinataire selon le type d'expéditeur
        let receiverId = null;
        let receiverType = null;
        
        // Vérifier si tripId est un vrai ID de livraison (nombre) ou un ID temporaire (string)
        const isRealTripId = !isNaN(tripId) && Number.isInteger(Number(tripId));
        
        if (isRealTripId) {
            if (senderType === 'client') {
                // Si c'est un client qui envoie, récupérer l'ID du livreur
                const deliveryQuery = 'SELECT id_livreur FROM Livraison WHERE id_livraison = $1';
                const deliveryResult = await pool.query(deliveryQuery, [parseInt(tripId)]);
                if (deliveryResult.rows.length > 0) {
                    receiverId = deliveryResult.rows[0].id_livreur;
                    receiverType = 'livreur';
                }
            } else if (senderType === 'livreur') {
                // Si c'est un livreur qui envoie, récupérer l'ID du client
                const deliveryQuery = 'SELECT id_client FROM Livraison WHERE id_livraison = $1';
                const deliveryResult = await pool.query(deliveryQuery, [parseInt(tripId)]);
                if (deliveryResult.rows.length > 0) {
                    receiverId = deliveryResult.rows[0].id_client;
                    receiverType = 'client';
                }
            }
        } else {
            // Pour les IDs temporaires, utiliser des valeurs par défaut
            console.log('🔍 Using temporary delivery ID, setting default receiver');
            if (senderType === 'client') {
                receiverId = 1; // ID du livreur par défaut
                receiverType = 'livreur';
            } else if (senderType === 'livreur') {
                receiverId = 1; // ID du client par défaut  
                receiverType = 'client';
            }
        }
        
        const insertQuery = `
            INSERT INTO Messages (trip_id, sender_id, sender_type, receiver_id, receiver_type, message_text, service_type)
            VALUES ($1, $2, $3, $4, $5, $6, 'delivery')
            RETURNING *
        `;
        
        const result = await pool.query(insertQuery, [
            tripId, senderId, senderType, receiverId, receiverType, message
        ]);
        
        res.json({
            success: true,
            message: result.rows[0]
        });
    } catch (error) {
        console.error('Erreur lors de l\'envoi du message:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de l\'envoi du message'
        });
    }
});

// Récupérer le nombre de messages non lus
router.get('/unread/:userId/:userType', async (req, res) => {
    try {
        const { userId, userType } = req.params;
        
        const query = `
            SELECT COUNT(*) as unread_count
            FROM Messages 
            WHERE receiver_id = $1 AND receiver_type = $2 AND is_read = false
        `;
        
        const result = await pool.query(query, [userId, userType]);
        
        res.json({
            success: true,
            unreadCount: parseInt(result.rows[0].unread_count)
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des messages non lus:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

module.exports = router;