const express = require('express');
const router = express.Router();
const pool = require('../db/index');

function getLocationIcon(type_lieu) {
    const icons = {
        'recent': '🕒',
        'airport': '✈️',
        'market': '🛍️',
        'train_station': '🚆',
        'bus_station': '🚌',
        'restaurant': '🍽️',
        'hotel': '🏨',
        'hospital': '🏥',
        'school': '🏫',
        'office': '🏢',
        'home': '🏠',
        'work': '💼'
    };
    return icons[type_lieu] || '🕒';
}

function categorizePlace(placeTypes) {
    if (!placeTypes || !Array.isArray(placeTypes)) return 'recent';
    
    const typeMapping = {
        'airport': 'airport',
        'shopping_mall': 'market',
        'supermarket': 'market',
        'train_station': 'train_station',
        'transit_station': 'train_station',
        'bus_station': 'bus_station',
        'restaurant': 'restaurant',
        'food': 'restaurant',
        'lodging': 'hotel',
        'hospital': 'hospital',
        'health': 'hospital',
        'school': 'school',
        'university': 'school',
        'establishment': 'office'
    };
    
    for (const type of placeTypes) {
        if (typeMapping[type]) {
            return typeMapping[type];
        }
    }
    
    return 'recent';
}

router.post('/save-location', async (req, res) => {
    try {
        const { 
            id_client, 
            adresse, 
            adresse_detaillee, 
            latitude, 
            longitude, 
            place_id, 
            place_types 
        } = req.body;

        if (!id_client || !adresse) {
            return res.status(400).json({ 
                error: 'id_client et adresse sont requis' 
            });
        }

        const type_lieu = categorizePlace(place_types);

        const checkQuery = `
            SELECT id_adresse, nombre_utilisations 
            FROM HistoriqueAdresseClient 
            WHERE id_client = $1 AND (place_id = $2 OR adresse = $3)
        `;
        
        const existingLocation = await pool.query(checkQuery, [id_client, place_id, adresse]);

        if (existingLocation.rows.length > 0) {
            const updateQuery = `
                UPDATE HistoriqueAdresseClient 
                SET nombre_utilisations = nombre_utilisations + 1,
                    date_utilisation = CURRENT_TIMESTAMP
                WHERE id_adresse = $1
                RETURNING *
            `;
            
            const result = await pool.query(updateQuery, [existingLocation.rows[0].id_adresse]);
            
            return res.json({
                success: true,
                message: 'Adresse mise à jour',
                location: {
                    ...result.rows[0],
                    icon: getLocationIcon(result.rows[0].type_lieu)
                }
            });
        }

        const insertQuery = `
            INSERT INTO HistoriqueAdresseClient 
            (id_client, adresse, adresse_detaillee, latitude, longitude, place_id, type_lieu)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;
        
        const values = [id_client, adresse, adresse_detaillee, latitude, longitude, place_id, type_lieu];
        const result = await pool.query(insertQuery, values);

        res.json({
            success: true,
            message: 'Adresse sauvegardée',
            location: {
                ...result.rows[0],
                icon: getLocationIcon(result.rows[0].type_lieu)
            }
        });

    } catch (error) {
        console.error('Erreur sauvegarde adresse:', error);
        res.status(500).json({ 
            error: 'Erreur serveur lors de la sauvegarde' 
        });
    }
});

router.get('/recent/:id_client', async (req, res) => {
    try {
        const { id_client } = req.params;
        const { limit = 6 } = req.query;

        if (!id_client) {
            return res.status(400).json({ 
                error: 'id_client requis' 
            });
        }

        const query = `
            SELECT * FROM HistoriqueAdresseClient 
            WHERE id_client = $1 
            ORDER BY date_utilisation DESC, nombre_utilisations DESC
            LIMIT $2
        `;
        
        const result = await pool.query(query, [id_client, parseInt(limit)]);
        
        const locations = result.rows.map(location => ({
            ...location,
            icon: getLocationIcon(location.type_lieu)
        }));

        res.json({
            success: true,
            locations
        });

    } catch (error) {
        console.error('Erreur récupération adresses:', error);
        res.status(500).json({ 
            error: 'Erreur serveur lors de la récupération' 
        });
    }
});

router.get('/home-suggestions/:id_client', async (req, res) => {
    try {
        const { id_client } = req.params;

        if (!id_client) {
            return res.status(400).json({ 
                error: 'id_client requis' 
            });
        }

        const query = `
            SELECT * FROM HistoriqueAdresseClient 
            WHERE id_client = $1 
            ORDER BY date_utilisation DESC, nombre_utilisations DESC
            LIMIT 3
        `;
        
        const result = await pool.query(query, [id_client]);
        
        const suggestions = result.rows.map(location => ({
            id: location.id_adresse.toString(),
            title: location.adresse,
            subtitle: location.adresse_detaillee || location.adresse,
            icon: getLocationIcon(location.type_lieu),
            latitude: location.latitude,
            longitude: location.longitude,
            place_id: location.place_id
        }));

        res.json({
            success: true,
            suggestions
        });

    } catch (error) {
        console.error('Erreur suggestions home:', error);
        res.status(500).json({ 
            error: 'Erreur serveur lors de la récupération des suggestions' 
        });
    }
});

router.delete('/location/:id_adresse', async (req, res) => {
    try {
        const { id_adresse } = req.params;
        const { id_client } = req.body;

        if (!id_adresse || !id_client) {
            return res.status(400).json({ 
                error: 'id_adresse et id_client requis' 
            });
        }

        const query = `
            DELETE FROM HistoriqueAdresseClient 
            WHERE id_adresse = $1 AND id_client = $2
            RETURNING *
        `;
        
        const result = await pool.query(query, [id_adresse, id_client]);

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Adresse non trouvée' 
            });
        }

        res.json({
            success: true,
            message: 'Adresse supprimée'
        });

    } catch (error) {
        console.error('Erreur suppression adresse:', error);
        res.status(500).json({ 
            error: 'Erreur serveur lors de la suppression' 
        });
    }
});

module.exports = router;