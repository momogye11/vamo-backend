const express = require('express');
const axios = require('axios');
const router = express.Router();

// Calculate route between origin and destination using Google Directions API
// Supports both GET and POST requests
const calculateRoute = async (req, res) => {
    try {
        // Handle both GET (query params) and POST (body) requests
        const { origin, destination, mode = 'driving' } = req.method === 'GET' ? req.query : req.body;
        
        // Validate required parameters
        if (!origin || !destination) {
            return res.status(400).json({
                error: 'Origin and destination coordinates are required',
                format: 'Use latitude,longitude format (e.g., 14.7167,-17.4677)',
                example: '/api/directions/route?origin=14.7167,-17.4677&destination=14.6928,-17.4467'
            });
        }

        // Validate coordinate format
        const originParts = origin.split(',');
        const destinationParts = destination.split(',');
        
        if (originParts.length !== 2 || destinationParts.length !== 2) {
            return res.status(400).json({
                error: 'Invalid coordinate format',
                required: 'Use latitude,longitude format',
                received: { origin, destination }
            });
        }

        const originLat = parseFloat(originParts[0]);
        const originLng = parseFloat(originParts[1]);
        const destLat = parseFloat(destinationParts[0]);
        const destLng = parseFloat(destinationParts[1]);

        // Validate coordinate ranges (Senegal bounds: lat 12-17, lng -18 to -11)
        if (isNaN(originLat) || isNaN(originLng) || isNaN(destLat) || isNaN(destLng)) {
            return res.status(400).json({
                error: 'Invalid coordinate values - must be valid numbers',
                received: { origin, destination }
            });
        }

        // Check if coordinates are within Senegal (approximate bounds)
        const isOriginInSenegal = originLat >= 12 && originLat <= 17 && originLng >= -18 && originLng <= -11;
        const isDestInSenegal = destLat >= 12 && destLat <= 17 && destLng >= -18 && destLng <= -11;
        
        if (!isOriginInSenegal || !isDestInSenegal) {
            console.warn('⚠️ Coordinates outside Senegal bounds:', { 
                origin: { lat: originLat, lng: originLng, inSenegal: isOriginInSenegal },
                destination: { lat: destLat, lng: destLng, inSenegal: isDestInSenegal }
            });
        }

        // Enhanced fallback with Google API validation
        if (!process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY === 'your_google_api_key') {
            console.log('⚠️ Google API key not configured or placeholder, using enhanced mock route data');
            
            // Calculate realistic mock data based on coordinates
            const mockDistance = 25.5;
            const mockDuration = Math.ceil(mockDistance * 2.5); // Rough estimate
            const mockFare = Math.round(500 + (mockDistance * 200));
            
            return res.json({
                success: true,
                mock: true,
                route: {
                    polyline: 'enhanced_mock_polyline_data',
                    coordinates: [], // Removed hardcoded test coordinates
                    distance: {
                        text: `${mockDistance} km`,
                        value: mockDistance * 1000,
                        km: mockDistance
                    },
                    duration: {
                        text: `${mockDuration} min`,
                        value: mockDuration * 60,
                        minutes: mockDuration
                    },
                    start_location: null, // Requires real GPS data
                    end_location: null, // Requires real GPS data
                    start_address: origin || 'Location non fournie',
                    end_address: destination || 'Destination non fournie',
                    estimated_fare: {
                        amount: mockFare,
                        currency: 'CFA',
                        breakdown: {
                            base_fare: 500,
                            distance_fare: mockFare - 500,
                            total: mockFare
                        }
                    },
                    via_waypoints: [],
                    warnings: ['Mock data - Google API not configured'],
                    copyrights: 'Mock route data for development'
                }
            });
        }

        // Build Google Directions API request
        const directionsUrl = 'https://maps.googleapis.com/maps/api/directions/json';
        const params = {
            origin: origin,
            destination: destination,
            mode: mode, // driving, walking, bicycling, transit
            key: process.env.GOOGLE_API_KEY,
            language: 'fr', // French for Senegal
            region: 'sn', // Senegal region code
            alternatives: false, // Get only the best route
            avoid: 'tolls' // Avoid tolls for better experience in Senegal
        };

        console.log('🗺️ Calculating precise route:', { 
            origin: `${originLat},${originLng}`, 
            destination: `${destLat},${destLng}`, 
            mode,
            validatedCoordinates: true
        });

        // Make request to Google Directions API
        const response = await axios.get(directionsUrl, { params });
        
        if (response.data.status !== 'OK') {
            console.error('Google Directions API error:', response.data.status);
            return res.status(400).json({
                error: 'Route calculation failed',
                status: response.data.status,
                message: response.data.error_message || 'Unable to calculate route'
            });
        }

        const route = response.data.routes[0];
        if (!route) {
            return res.status(404).json({
                error: 'No route found between origin and destination'
            });
        }

        // Extract route information
        const leg = route.legs[0];
        const polylinePoints = route.overview_polyline.points;

        // Decode polyline for frontend use (optional - can be done on frontend too)
        const coordinates = decodePolyline(polylinePoints);

        // Calculate estimated fare based on distance (basic calculation)
        const distanceKm = leg.distance.value / 1000;
        const baseFare = 500; // Base fare in CFA
        const perKmRate = 200; // Rate per km in CFA
        const estimatedFare = Math.round(baseFare + (distanceKm * perKmRate));

        // Prepare response
        const routeData = {
            success: true,
            route: {
                // Route overview
                polyline: polylinePoints,
                coordinates: coordinates,
                bounds: route.bounds,
                
                // Distance and time
                distance: {
                    text: leg.distance.text,
                    value: leg.distance.value, // in meters
                    km: Math.round(distanceKm * 10) / 10 // rounded to 1 decimal
                },
                duration: {
                    text: leg.duration.text,
                    value: leg.duration.value, // in seconds
                    minutes: Math.ceil(leg.duration.value / 60)
                },
                
                // Location details
                start_location: leg.start_location,
                end_location: leg.end_location,
                start_address: leg.start_address,
                end_address: leg.end_address,
                
                // Pricing
                estimated_fare: {
                    amount: estimatedFare,
                    currency: 'CFA',
                    breakdown: {
                        base_fare: baseFare,
                        distance_fare: Math.round(distanceKm * perKmRate),
                        total: estimatedFare
                    }
                },
                
                // Additional info
                via_waypoints: route.via_waypoints || [],
                warnings: route.warnings || [],
                copyrights: route.copyrights
            }
        };

        console.log('✅ Route calculated successfully:', {
            distance: routeData.route.distance.text,
            duration: routeData.route.duration.text,
            fare: routeData.route.estimated_fare.amount + ' CFA'
        });

        res.json(routeData);

    } catch (error) {
        console.error('❌ Error calculating route:', error.message);
        
        if (error.response) {
            // Google API returned an error
            return res.status(error.response.status).json({
                error: 'Google Directions API error',
                message: error.response.data?.error_message || error.message
            });
        }
        
        // Network or other error
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to calculate route at this time'
        });
    }
};

// GET /api/directions/route
router.get('/route', calculateRoute);

// POST /api/directions/route (for frontend compatibility)
router.post('/route', calculateRoute);

// Helper function to decode Google polyline
function decodePolyline(encoded) {
    const coordinates = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
        let b;
        let shift = 0;
        let result = 0;
        
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        
        const dlat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
        lat += dlat;

        shift = 0;
        result = 0;
        
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        
        const dlng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
        lng += dlng;

        coordinates.push({
            latitude: lat / 1E5,
            longitude: lng / 1E5
        });
    }

    return coordinates;
}

module.exports = router;