const express = require('express');
const axios = require('axios');
const router = express.Router();

// Fonction d'arrondissement au 50 ou 100 CFA le plus proche
function roundPrice(price, roundTo = 50) {
    return Math.round(price / roundTo) * roundTo;
}

// Fonctions de calcul tarifaire
function calculateServicePrice(serviceRates, distanceKm, zone) {
    const baseFare = serviceRates.base;
    const perKmRate = zone === 'suburb' ? serviceRates.perKmSuburb : serviceRates.perKmCity;
    const distanceFare = Math.round(distanceKm * perKmRate);
    const rawTotal = baseFare + distanceFare;

    // Arrondissement selon le service (50 ou 100 CFA)
    const roundTo = serviceRates.roundTo || 50;
    const total = roundPrice(rawTotal, roundTo);

    return {
        base: baseFare,
        distance: distanceFare,
        rawTotal: rawTotal,
        total: total,
        perKmRate: perKmRate,
        zone: zone,
        waitingFree: serviceRates.waitingFree,
        roundedBy: total - rawTotal
    };
}

function calculateYangoPrice(serviceType, distanceKm, zone) {
    // Prix de référence Yango RÉELS (tarifs officiels 2025)
    const yangoRates = {
        eco: {
            base: 533,           // Prix minimum Yango Éco (inclut 1.1km + 4min)
            perKmCity: 86,       // Max 86 CFA/km en ville (tarif officiel)
            perKmSuburb: 180,    // Max 180 CFA/km en périphérie
            perMinute: 32,       // Max 32 CFA/min
            waitingAfter3Min: 30 // 30 CFA/min après 3 min gratuites
        },
        comfort: {
            base: 650,           // Estimé légèrement plus élevé que Éco
            perKmCity: 100,      // Estimé
            perKmSuburb: 190,    // Estimé
            perMinute: 35,       // Estimé
            waitingAfter3Min: 35 // 35 CFA/min après 3 min
        }
    };

    const rates = yangoRates[serviceType];
    const baseFare = rates.base;
    const perKmRate = zone === 'suburb' ? rates.perKmSuburb : rates.perKmCity;
    const distanceFare = Math.round(distanceKm * perKmRate);
    const rawTotal = baseFare + distanceFare;

    // Yango arrondit au 100 CFA supérieur
    const total = roundPrice(rawTotal, 100);

    return {
        base: baseFare,
        distance: distanceFare,
        rawTotal: rawTotal,
        total: total,
        perKmRate: perKmRate,
        perMinute: rates.perMinute,
        zone: zone,
        waitingPaid: true,
        waitingRate: rates.waitingAfter3Min,
        roundedBy: total - rawTotal
    };
}

function calculateYangoDeliveryPrice(serviceType, distanceKm, zone) {
    // Prix de référence Yango Livraison pour comparaison
    const yangoDeliveryRates = {
        express: {
            base: 220,           // Prise en charge Yango Express Moto
            perKmCity: 120,      // Ville Yango Express Moto (avant dégressif)
            perKmSuburb: 180,    // Périphérie Yango Express Moto
            waitingFreeMinutes: 10, // 10 min gratuites
            waitingAfterFree: 100   // 100 CFA/min après 10 min
        }
    };
    
    const rates = yangoDeliveryRates[serviceType];
    const baseFare = rates.base;
    const perKmRate = zone === 'suburb' ? rates.perKmSuburb : rates.perKmCity;
    const distanceFare = Math.round(distanceKm * perKmRate);
    const total = baseFare + distanceFare;
    
    return {
        base: baseFare,
        distance: distanceFare,
        total: total,
        perKmRate: perKmRate,
        zone: zone,
        waitingFreeMinutes: rates.waitingFreeMinutes,
        waitingRate: rates.waitingAfterFree
    };
}

// Calculate route between origin and destination using Google Directions API
// Supports both GET and POST requests
const calculateRoute = async (req, res) => {
    try {
        // Handle both GET (query params) and POST (body) requests
        const { origin, destination, waypoints, mode = 'driving' } = req.method === 'GET' ? req.query : req.body;
        
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

        // Add waypoints if provided (format: lat1,lng1|lat2,lng2|...)
        if (waypoints && Array.isArray(waypoints) && waypoints.length > 0) {
            // Convert waypoints array to Google API format: "lat1,lng1|lat2,lng2"
            const waypointsString = waypoints
                .map(wp => `${wp.latitude},${wp.longitude}`)
                .join('|');
            params.waypoints = `optimize:false|${waypointsString}`;
            console.log('🛣️ Route with waypoints:', {
                origin,
                waypoints: waypointsString,
                destination,
                count: waypoints.length
            });
        }

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
        // Note: With waypoints, there will be multiple legs (one for each segment)
        const legs = route.legs;
        const polylinePoints = route.overview_polyline.points;

        // Decode polyline for frontend use (optional - can be done on frontend too)
        const coordinates = decodePolyline(polylinePoints);

        // Calculate total distance and duration from all legs
        let totalDistance = 0;
        let totalDuration = 0;
        legs.forEach(leg => {
            totalDistance += leg.distance.value;
            totalDuration += leg.duration.value;
        });

        const distanceKm = totalDistance / 1000;
        
        // Determine zone (simplified - can be enhanced with GPS coordinates)
        const isSuburb = distanceKm > 10; // Simple logic: >10km = suburb
        const zone = isSuburb ? 'suburb' : 'city';
        
        // Grille tarifaire Vamo - OPTIMISÉE 0% COMMISSION
        // Client paie moins + Chauffeur gagne plus = Win-Win !
        // TOUS LES PRIX FINISSENT PAR 00 CFA (arrondis à 100 CFA)
        const pricing = {
            // === COURSES VTC ===
            // Service Vamo (Éco) - 8-12% moins cher que Yango grâce à 0% commission
            vamo: {
                base: 500,           // Base de départ vs 533 CFA Yango
                perKmCity: 80,       // Ville vs 86 CFA/km Yango (~7% moins cher)
                perKmSuburb: 160,    // Périphérie vs 180 CFA/km Yango (~11% moins cher)
                roundTo: 100,        // Arrondissement au 100 CFA uniquement
                waitingFree: true    // Attente GRATUITE vs 30 CFA/min Yango après 3min
            },

            // Service Comfort - Prix similaire à Yango mais meilleure qualité
            comfort: {
                base: 600,           // Base de départ vs 650 CFA Yango
                perKmCity: 100,      // Ville vs 100 CFA/km Yango (même prix/km mais base moins chère)
                perKmSuburb: 180,    // Périphérie vs 190 CFA/km Yango (~5% moins cher)
                roundTo: 100,        // Arrondissement au 100 CFA uniquement
                waitingFree: true    // Attente GRATUITE vs 35 CFA/min Yango après 3min
            },

            // === LIVRAISONS MOTO ===
            // Livraison Express - ~10% moins cher que Yango Express Moto
            express: {
                base: 200,           // Prise en charge vs 220 CFA Yango
                perKmCity: 100,      // Ville vs 120 CFA/km Yango (~17% moins cher)
                perKmSuburb: 160,    // Périphérie vs 180 CFA/km Yango (~11% moins cher)
                roundTo: 100,        // Arrondissement au 100 CFA uniquement
                waitingFreeMinutes: 10,  // 10 min GRATUITES identique à Yango
                waitingAfterFree: 80,    // 80 CFA/min après vs 100 CFA/min Yango
                service: 'express'
            },

            // Livraison Flex - Service économique avec plus d'attente gratuite
            flex: {
                base: 200,           // Base ajustée pour arrondis propres
                perKmCity: 80,       // Plus économique que Express (~33% moins cher)
                perKmSuburb: 140,    // Plus économique en périphérie (~22% moins cher)
                roundTo: 100,        // Arrondissement au 100 CFA uniquement
                waitingFreeMinutes: 15,  // 15 min GRATUITES (5 min de plus que Yango !)
                waitingAfterFree: 60,    // 60 CFA/min après (très compétitif vs 100)
                service: 'flex'
            }
        };
        
        // Calculer les prix pour tous les services
        const vamoPrice = calculateServicePrice(pricing.vamo, distanceKm, zone);
        const comfortPrice = calculateServicePrice(pricing.comfort, distanceKm, zone);
        const expressPrice = calculateServicePrice(pricing.express, distanceKm, zone);
        const flexPrice = calculateServicePrice(pricing.flex, distanceKm, zone);
        
        // Prix Yango pour comparaison (référence)
        const yangoEcoPrice = calculateYangoPrice('eco', distanceKm, zone);
        const yangoComfortPrice = calculateYangoPrice('comfort', distanceKm, zone);
        const yangoExpressPrice = calculateYangoDeliveryPrice('express', distanceKm, zone);
        
        // Default to vamo service for single price display
        const estimatedFare = vamoPrice.total;

        // Prepare response
        const routeData = {
            success: true,
            route: {
                // Route overview
                polyline: polylinePoints,
                coordinates: coordinates,
                bounds: route.bounds,
                
                // Distance and time (totals for all legs)
                distance: {
                    text: `${Math.round(distanceKm * 10) / 10} km`,
                    value: totalDistance, // in meters
                    km: Math.round(distanceKm * 10) / 10 // rounded to 1 decimal
                },
                duration: {
                    text: `${Math.ceil(totalDuration / 60)} min`,
                    value: totalDuration, // in seconds
                    minutes: Math.ceil(totalDuration / 60)
                },

                // Location details (first and last leg)
                start_location: legs[0].start_location,
                end_location: legs[legs.length - 1].end_location,
                start_address: legs[0].start_address,
                end_address: legs[legs.length - 1].end_address,

                // Waypoints details (intermediate stops)
                waypoints_info: waypoints && waypoints.length > 0 ? waypoints.map((wp, index) => ({
                    order: index + 1,
                    address: wp.address || wp.description || `Arrêt ${index + 1}`,
                    latitude: wp.latitude,
                    longitude: wp.longitude,
                    leg_distance: legs[index] ? {
                        text: legs[index].distance.text,
                        value: legs[index].distance.value,
                        km: Math.round((legs[index].distance.value / 1000) * 10) / 10
                    } : null,
                    leg_duration: legs[index] ? {
                        text: legs[index].duration.text,
                        value: legs[index].duration.value,
                        minutes: Math.ceil(legs[index].duration.value / 60)
                    } : null
                })) : [],
                
                // Pricing détaillé avec comparaison Yango
                pricing: {
                    // === COURSES VTC ===
                    // Service Vamo (Éco) - Prix principal affiché
                    vamo: {
                        total: vamoPrice.total,
                        currency: 'CFA',
                        breakdown: {
                            base: vamoPrice.base,
                            distance: vamoPrice.distance,
                            total: vamoPrice.total,
                            zone: vamoPrice.zone,
                            rate_per_km: vamoPrice.perKmRate,
                            waiting: 'GRATUIT'
                        }
                    },
                    
                    // Service Comfort
                    comfort: {
                        total: comfortPrice.total,
                        currency: 'CFA',
                        breakdown: {
                            base: comfortPrice.base,
                            distance: comfortPrice.distance,
                            total: comfortPrice.total,
                            zone: comfortPrice.zone,
                            rate_per_km: comfortPrice.perKmRate,
                            waiting: 'GRATUIT'
                        }
                    },

                    // === LIVRAISONS ===
                    // Livraison Express
                    express: {
                        total: expressPrice.total,
                        currency: 'CFA',
                        breakdown: {
                            base: expressPrice.base,
                            distance: expressPrice.distance,
                            total: expressPrice.total,
                            zone: expressPrice.zone,
                            rate_per_km: expressPrice.perKmRate,
                            waiting: '10 min GRATUITS, puis 80 CFA/min'
                        }
                    },

                    // Livraison Flex
                    flex: {
                        total: flexPrice.total,
                        currency: 'CFA',
                        breakdown: {
                            base: flexPrice.base,
                            distance: flexPrice.distance,
                            total: flexPrice.total,
                            zone: flexPrice.zone,
                            rate_per_km: flexPrice.perKmRate,
                            waiting: '15 min GRATUITS, puis 60 CFA/min'
                        }
                    },
                    
                    // Comparaison avec Yango (pour référence)
                    yango_comparison: {
                        eco: {
                            total: yangoEcoPrice.total,
                            currency: 'CFA',
                            savings: yangoEcoPrice.total - vamoPrice.total,
                            savings_percent: Math.round(((yangoEcoPrice.total - vamoPrice.total) / yangoEcoPrice.total) * 100),
                            waiting: `30 CFA/min après 3min`
                        },
                        comfort: {
                            total: yangoComfortPrice.total,
                            currency: 'CFA',
                            savings: yangoComfortPrice.total - comfortPrice.total,
                            savings_percent: Math.round(((yangoComfortPrice.total - comfortPrice.total) / yangoComfortPrice.total) * 100),
                            waiting: `35 CFA/min après 3min`
                        },
                        express_delivery: {
                            total: yangoExpressPrice.total,
                            currency: 'CFA',
                            savings: yangoExpressPrice.total - expressPrice.total,
                            savings_percent: Math.round(((yangoExpressPrice.total - expressPrice.total) / yangoExpressPrice.total) * 100),
                            waiting: `10 min gratuits, puis 100 CFA/min`
                        }
                    }
                },
                
                // Prix principal pour compatibilité (service Vamo Éco)
                estimated_fare: {
                    amount: estimatedFare,
                    currency: 'CFA',
                    breakdown: {
                        base_fare: vamoPrice.base,
                        distance_fare: vamoPrice.distance,
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