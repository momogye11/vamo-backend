const express = require('express');
const router = express.Router();
const axios = require('axios');

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// Simple test route
router.get('/test', (req, res) => {
    res.json({ 
        message: 'Places API is working!',
        hasApiKey: !!GOOGLE_API_KEY
    });
});

function categorizeGooglePlace(types) {
    if (!types || !Array.isArray(types)) return 'recent';
    
    const typeMapping = {
        'airport': 'airport',
        'shopping_mall': 'market',
        'supermarket': 'market',
        'store': 'market',
        'train_station': 'train_station',
        'transit_station': 'train_station',
        'subway_station': 'train_station',
        'bus_station': 'bus_station',
        'restaurant': 'restaurant',
        'food': 'restaurant',
        'meal_takeaway': 'restaurant',
        'lodging': 'hotel',
        'hospital': 'hospital',
        'health': 'hospital',
        'school': 'school',
        'university': 'school',
        'establishment': 'office',
        'point_of_interest': 'recent'
    };
    
    for (const type of types) {
        if (typeMapping[type]) {
            return typeMapping[type];
        }
    }
    
    return 'recent';
}

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

function formatGooglePlaceResult(place) {
    const type_lieu = categorizeGooglePlace(place.types);
    
    return {
        place_id: place.place_id,
        title: place.name || place.structured_formatting?.main_text || 'Lieu sans nom',
        subtitle: place.formatted_address || place.structured_formatting?.secondary_text || place.description || '',
        icon: getLocationIcon(type_lieu),
        type_lieu: type_lieu,
        location: place.geometry ? {
            lat: place.geometry.location.lat,
            lng: place.geometry.location.lng
        } : null,
        types: place.types || []
    };
}

router.get('/autocomplete', async (req, res) => {
    try {
        const { query, sessiontoken } = req.query;

        if (!query || query.trim().length < 2) {
            return res.json({
                success: true,
                predictions: []
            });
        }

        if (!GOOGLE_API_KEY) {
            return res.json({
                success: false,
                error: 'Configuration Google Places manquante',
                predictions: []
            });
        }

        const url = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';

        // 🌍 En production : restreindre au Sénégal uniquement
        // 🧪 En développement : permettre tous les pays pour tester
        const isProduction = process.env.NODE_ENV === 'production';

        const params = {
            input: query.trim(),
            key: GOOGLE_API_KEY,
            language: 'fr',
            components: isProduction ? 'country:sn' : undefined, // Restriction conditionnelle
            sessiontoken: sessiontoken || undefined
        };

        const response = await axios.get(url, { params });

        if (response.data.status === 'ZERO_RESULTS') {
            return res.json({
                success: true,
                predictions: []
            });
        }

        if (response.data.status !== 'OK') {
            console.error('Erreur Google Places API:', response.data.status, response.data.error_message);
            return res.json({
                success: false,
                error: 'Erreur API Google Places',
                predictions: []
            });
        }

        const predictions = response.data.predictions?.map(prediction => {
            const type_lieu = categorizeGooglePlace(prediction.types);
            return {
                place_id: prediction.place_id,
                title: prediction.structured_formatting?.main_text || prediction.description,
                subtitle: prediction.structured_formatting?.secondary_text || '',
                description: prediction.description,
                icon: getLocationIcon(type_lieu),
                type_lieu: type_lieu,
                types: prediction.types || [],
                // Ajouter les coordonnées si disponibles dans la géométrie
                latitude: prediction.geometry?.location?.lat || null,
                longitude: prediction.geometry?.location?.lng || null,
                location: prediction.geometry ? {
                    lat: prediction.geometry.location.lat,
                    lng: prediction.geometry.location.lng
                } : null
            };
        }) || [];

        res.json({
            success: true,
            predictions
        });

    } catch (error) {
        console.error('Erreur Google Places Autocomplete:', error.message);
        res.json({
            success: false,
            error: 'Erreur serveur lors de la recherche',
            predictions: []
        });
    }
});

router.get('/details/:place_id', async (req, res) => {
    try {
        const { place_id } = req.params;
        const { sessiontoken } = req.query;

        if (!place_id) {
            return res.status(400).json({
                error: 'place_id requis'
            });
        }

        if (!GOOGLE_API_KEY) {
            return res.status(500).json({
                error: 'Configuration Google Places manquante'
            });
        }

        const url = 'https://maps.googleapis.com/maps/api/place/details/json';
        const params = {
            place_id: place_id,
            key: GOOGLE_API_KEY,
            language: 'fr',
            fields: 'place_id,name,formatted_address,geometry,types',
            sessiontoken: sessiontoken || undefined
        };

        const response = await axios.get(url, { params });

        if (response.data.status !== 'OK') {
            console.error('Erreur Google Places Details API:', response.data.status, response.data.error_message);
            return res.status(500).json({
                error: 'Erreur lors de la récupération des détails du lieu'
            });
        }

        const place = response.data.result;
        const formattedPlace = formatGooglePlaceResult(place);

        res.json({
            success: true,
            place: formattedPlace
        });

    } catch (error) {
        console.error('Erreur Google Places Details:', error.message);
        res.status(500).json({
            error: 'Erreur serveur lors de la récupération des détails'
        });
    }
});

router.get('/nearby', async (req, res) => {
    try {
        const { latitude, longitude, radius = 5000, type } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                error: 'latitude et longitude requises'
            });
        }

        if (!GOOGLE_API_KEY) {
            return res.status(500).json({
                error: 'Configuration Google Places manquante'
            });
        }

        const url = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
        const params = {
            location: `${latitude},${longitude}`,
            radius: parseInt(radius),
            key: GOOGLE_API_KEY,
            language: 'fr'
        };

        if (type) {
            params.type = type;
        }

        const response = await axios.get(url, { params });

        if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
            console.error('Erreur Google Places Nearby API:', response.data.status, response.data.error_message);
            return res.status(500).json({
                error: 'Erreur lors de la recherche de lieux à proximité'
            });
        }

        const places = response.data.results?.map(formatGooglePlaceResult) || [];

        res.json({
            success: true,
            places
        });

    } catch (error) {
        console.error('Erreur Google Places Nearby:', error.message);
        res.status(500).json({
            error: 'Erreur serveur lors de la recherche à proximité'
        });
    }
});

// Reverse geocoding - Convert coordinates to address
router.get('/reverse-geocode', async (req, res) => {
    try {
        const { latitude, longitude } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                error: 'latitude et longitude requises'
            });
        }

        if (!GOOGLE_API_KEY) {
            return res.status(500).json({
                success: false,
                error: 'Configuration Google Places manquante'
            });
        }

        console.log('🌍 Reverse geocoding for:', { latitude, longitude });

        const url = 'https://maps.googleapis.com/maps/api/geocode/json';
        const params = {
            latlng: `${latitude},${longitude}`,
            key: GOOGLE_API_KEY,
            language: 'fr'
            // Removed result_type restriction to allow any address type
        };

        const response = await axios.get(url, { params });

        console.log('🌍 Google Geocoding API response status:', response.data.status);
        console.log('🌍 Google Geocoding API results count:', response.data.results?.length || 0);

        if (response.data.status !== 'OK') {
            console.error('❌ Google Geocoding API Error:', {
                status: response.data.status,
                error_message: response.data.error_message,
                results_length: response.data.results?.length || 0
            });
            return res.json({
                success: false,
                error: `Erreur API Google: ${response.data.status}`,
                address: null
            });
        }

        // Get the most relevant result (usually the first one)
        const result = response.data.results[0];
        
        if (!result) {
            return res.json({
                success: false,
                error: 'Aucune adresse trouvée pour cette position',
                address: null
            });
        }

        // Extract street address or formatted address
        let formattedAddress = result.formatted_address;
        
        // Try to get a shorter, more readable address
        const addressComponents = result.address_components;
        let shortAddress = '';
        
        // Look for street number and route
        const streetNumber = addressComponents.find(comp => comp.types.includes('street_number'))?.long_name || '';
        const route = addressComponents.find(comp => comp.types.includes('route'))?.long_name || '';
        const locality = addressComponents.find(comp => comp.types.includes('locality'))?.long_name || '';
        const sublocality = addressComponents.find(comp => comp.types.includes('sublocality'))?.long_name || '';
        
        if (streetNumber && route) {
            shortAddress = `${streetNumber} ${route}`;
            if (sublocality) {
                shortAddress += `, ${sublocality}`;
            } else if (locality) {
                shortAddress += `, ${locality}`;
            }
        } else if (route) {
            shortAddress = route;
            if (sublocality) {
                shortAddress += `, ${sublocality}`;
            } else if (locality) {
                shortAddress += `, ${locality}`;
            }
        } else {
            // Fallback to formatted address, but try to shorten it
            const parts = formattedAddress.split(',');
            shortAddress = parts.slice(0, Math.min(2, parts.length)).join(',').trim();
        }

        console.log('✅ Reverse geocoding result:', {
            formatted: formattedAddress,
            short: shortAddress
        });

        res.json({
            success: true,
            address: {
                formatted: formattedAddress,
                short: shortAddress || formattedAddress,
                components: {
                    streetNumber,
                    route,
                    locality,
                    sublocality
                },
                location: {
                    lat: parseFloat(latitude),
                    lng: parseFloat(longitude)
                }
            }
        });

    } catch (error) {
        console.error('Erreur Reverse Geocoding:', error.message);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors du reverse geocoding',
            address: null
        });
    }
});

module.exports = router;