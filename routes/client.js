const express = require('express');
const router = express.Router();
const pool = require('../db'); // Import du pool de connexion PostgreSQL

// GET tous les clients
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM Client');
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des clients :', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET client profile by phone number - consolidated endpoint
router.get('/profile/:phone', async (req, res) => {
  try {
    // Decode the URL-encoded phone number for compatibility
    const phone = decodeURIComponent(req.params.phone);
    console.log(`📱 Getting client profile for: ${phone}`);
    
    // Get client data with rating calculation (comprehensive query)
    const clientQuery = `
      SELECT 
        c.id_client,
        c.nom,
        c.prenom,
        c.telephone,
        c.device_token,
        COALESCE(AVG(n.note), 0) as average_rating,
        COUNT(n.note) as total_ratings
      FROM Client c
      LEFT JOIN Course course_table ON c.id_client = course_table.id_client
      LEFT JOIN Note n ON course_table.id_course = n.id_course
      WHERE c.telephone = $1
      GROUP BY c.id_client, c.nom, c.prenom, c.telephone, c.device_token
    `;

    const result = await pool.query(clientQuery, [phone]);
    
    if (result.rows.length === 0) {
      console.log('❌ Client non trouvé');
      return res.status(404).json({ 
        success: false,
        error: 'Client non trouvé' 
      });
    }
    
    const client = result.rows[0];
    console.log(`✅ Client profile found:`, {
      phone: client.telephone,
      name: `${client.prenom} ${client.nom}`,
      rating: parseFloat(client.average_rating).toFixed(1)
    });
    
    res.json({
      success: true,
      data: {
        profile: {
          id_client: client.id_client,
          nom: client.nom,
          prenom: client.prenom,
          // Frontend compatibility fields
          firstName: client.prenom,
          lastName: client.nom,
          phone: client.telephone,
          telephone: client.telephone,
          rating: {
            average_rating: parseFloat(client.average_rating).toFixed(1),
            total_ratings: parseInt(client.total_ratings),
            display: `${parseFloat(client.average_rating).toFixed(1)}/5`
          },
          totalRatings: parseInt(client.total_ratings),
          deviceToken: client.device_token
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting client profile:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur' 
    });
  }
});

// POST - Complete client registration
router.post('/complete', async (req, res) => {
  console.log('🧑‍💼 Tentative de completion du profil client:');
  console.log('  Body reçu:', req.body);
  
  try {
    const { telephone, prenom, nom } = req.body;
    
    console.log('📋 Champs extraits du body:');
    console.log('  telephone:', telephone);
    console.log('  prenom:', prenom);
    console.log('  nom:', nom);

    // Validation des champs requis
    if (!telephone || !prenom || !nom) {
      console.error('❌ Champs manquants:', { telephone: !!telephone, prenom: !!prenom, nom: !!nom });
      return res.status(400).json({ 
        error: 'Tous les champs sont requis (telephone, prenom, nom)' 
      });
    }

    // Vérifier si le client existe déjà
    console.log('🔍 Vérification de l\'existence du client...');
    const existingClient = await pool.query(
      'SELECT id_client FROM Client WHERE telephone = $1',
      [telephone]
    );

    if (existingClient.rows.length > 0) {
      console.log('✅ Client existant trouvé, mise à jour...');
      // Mettre à jour les informations du client existant
      const updateResult = await pool.query(
        'UPDATE Client SET nom = $1, prenom = $2 WHERE telephone = $3 RETURNING *',
        [nom, prenom, telephone]
      );
      
      console.log('✅ Client mis à jour avec succès:', updateResult.rows[0]);
      return res.status(200).json({
        success: true,
        message: 'Profil client mis à jour avec succès',
        client: updateResult.rows[0]
      });
    } else {
      console.log('➕ Création d\'un nouveau client...');
      // Créer un nouveau client
      const insertResult = await pool.query(
        'INSERT INTO Client (nom, prenom, telephone) VALUES ($1, $2, $3) RETURNING *',
        [nom, prenom, telephone]
      );
      
      console.log('✅ Nouveau client créé avec succès:', insertResult.rows[0]);
      return res.status(201).json({
        success: true,
        message: 'Profil client créé avec succès',
        client: insertResult.rows[0]
      });
    }

  } catch (error) {
    console.error('❌ Erreur lors de la completion du profil client:', error);
    console.error('❌ Stack trace:', error.stack);
    res.status(500).json({ 
      error: 'Erreur serveur lors de la completion du profil',
      details: error.message 
    });
  }
});

// GET - Check if client exists and is complete
router.get('/check/:telephone', async (req, res) => {
  try {
    // Decode the URL-encoded phone number
    const telephone = decodeURIComponent(req.params.telephone);
    
    console.log('🔍 Vérification du client:');
    console.log('  Raw param:', req.params.telephone);
    console.log('  Decoded phone:', telephone);
    
    const result = await pool.query(
      'SELECT id_client, nom, prenom, telephone FROM Client WHERE telephone = $1',
      [telephone]
    );

    if (result.rows.length > 0) {
      const client = result.rows[0];
      const isComplete = !!(client.nom && client.prenom);
      
      console.log('✅ Client trouvé:', client);
      console.log('📋 Profil complet:', isComplete);
      
      res.json({
        exists: true,
        complete: isComplete,
        client: client
      });
    } else {
      console.log('❌ Client non trouvé');
      res.json({
        exists: false,
        complete: false,
        client: null
      });
    }

  } catch (error) {
    console.error('❌ Erreur lors de la vérification du client:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET - Fetch client ride history (active + archived)
router.get('/rides/:telephone', async (req, res) => {
  try {
    // Decode the URL-encoded phone number
    const telephone = decodeURIComponent(req.params.telephone);
    
    console.log('🚗 Récupération historique des courses:');
    console.log('  Téléphone:', telephone);
    
    // First, get the client ID
    const clientResult = await pool.query(
      'SELECT id_client FROM Client WHERE telephone = $1',
      [telephone]
    );

    if (clientResult.rows.length === 0) {
      console.log('❌ Client non trouvé');
      return res.json({
        success: true,
        rides: []
      });
    }

    const clientId = clientResult.rows[0].id_client;
    console.log('👤 Client ID:', clientId);

    // Query for active rides from Course table
    const activeRidesQuery = `
      SELECT
        c.id_course,
        c.adresse_depart,
        c.adresse_arrivee,
        c.distance_km,
        c.duree_min,
        c.prix,
        c.date_heure_depart,
        c.date_heure_arrivee,
        c.etat_course,
        c.est_paye,
        ch.nom as chauffeur_nom,
        ch.prenom as chauffeur_prenom,
        p.mode as mode_paiement,
        n.note as rating,
        'active' as source_table
      FROM Course c
      LEFT JOIN Chauffeur ch ON c.id_chauffeur = ch.id_chauffeur
      LEFT JOIN Paiement p ON c.id_course = p.id_course
      LEFT JOIN Note n ON c.id_course = n.id_course
      WHERE c.id_client = $1
      AND c.etat_course IN ('terminee', 'annulee')
    `;

    // Query for archived rides from HistoriqueCourse table  
    const archivedRidesQuery = `
      SELECT 
        hc.id_course,
        hc.adresse_depart,
        hc.adresse_arrivee,
        hc.distance_km,
        hc.duree_min,
        hc.prix,
        hc.date_heure_depart,
        hc.date_heure_arrivee,
        hc.etat_course,
        false as est_paye,
        null as chauffeur_nom,
        null as chauffeur_prenom,
        null as mode_paiement,
        null as rating,
        'archived' as source_table
      FROM HistoriqueCourse hc
      WHERE hc.id_client = $1
    `;

    const [activeRides, archivedRides] = await Promise.all([
      pool.query(activeRidesQuery, [clientId]),
      pool.query(archivedRidesQuery, [clientId])
    ]);

    // Combine and sort by date (most recent first)
    const allRides = [...activeRides.rows, ...archivedRides.rows]
      .sort((a, b) => new Date(b.date_heure_depart || b.archived_at) - new Date(a.date_heure_depart || a.archived_at));

    console.log(`✅ Trouvé ${allRides.length} courses:`);
    console.log(`  - Active: ${activeRides.rows.length}`);
    console.log(`  - Archivées: ${archivedRides.rows.length}`);

    res.json({
      success: true,
      rides: allRides.map(ride => ({
        id: ride.id_course,
        departure: ride.adresse_depart,
        arrival: ride.adresse_arrivee,
        distance: ride.distance_km,
        duration: ride.duree_min,
        price: ride.prix,
        departureTime: ride.date_heure_depart,
        arrivalTime: ride.date_heure_arrivee,
        status: ride.etat_course,
        isPaid: ride.est_paye,
        driver: ride.chauffeur_nom && ride.chauffeur_prenom ? 
          `${ride.chauffeur_prenom} ${ride.chauffeur_nom}` : null,
        paymentMethod: ride.mode_paiement,
        rating: ride.rating,
        source: ride.source_table
      }))
    });

  } catch (error) {
    console.error('❌ Erreur lors de la récupération des courses:', error);
    console.error('❌ Stack trace:', error.stack);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur lors de la récupération des courses',
      details: error.message 
    });
  }
});


// PUT - Update client profile
router.put('/profile/:telephone', async (req, res) => {
  try {
    // Decode the URL-encoded phone number
    const currentPhone = decodeURIComponent(req.params.telephone);
    const { prenom, nom, telephone: newPhone } = req.body;
    
    console.log('✏️ Mise à jour du profil client:');
    console.log('  Téléphone actuel:', currentPhone);
    console.log('  Nouvelles données:', { prenom, nom, newPhone });

    // Validation des champs requis
    if (!prenom || !nom || !newPhone) {
      console.error('❌ Champs manquants');
      return res.status(400).json({ 
        success: false,
        error: 'Tous les champs sont requis (prenom, nom, telephone)' 
      });
    }

    // Check if client exists
    const clientExists = await pool.query(
      'SELECT id_client FROM Client WHERE telephone = $1',
      [currentPhone]
    );

    if (clientExists.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Client non trouvé'
      });
    }

    // If phone number is changing, check if new number already exists
    if (newPhone !== currentPhone) {
      const phoneExists = await pool.query(
        'SELECT id_client FROM Client WHERE telephone = $1 AND telephone != $2',
        [newPhone, currentPhone]
      );

      if (phoneExists.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Ce numéro de téléphone est déjà utilisé'
        });
      }
    }

    // Update client profile
    const updateResult = await pool.query(
      'UPDATE Client SET nom = $1, prenom = $2, telephone = $3 WHERE telephone = $4 RETURNING *',
      [nom, prenom, newPhone, currentPhone]
    );

    console.log('✅ Profil client mis à jour:', updateResult.rows[0]);

    res.json({
      success: true,
      message: 'Profil mis à jour avec succès',
      profile: {
        id: updateResult.rows[0].id_client,
        firstName: updateResult.rows[0].prenom,
        lastName: updateResult.rows[0].nom,
        phone: updateResult.rows[0].telephone
      }
    });

  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour du profil:', error);
    console.error('❌ Stack trace:', error.stack);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur lors de la mise à jour du profil',
      details: error.message 
    });
  }
});

// GET - Get client delivery history (active + archived)
router.get('/deliveries/:telephone', async (req, res) => {
  try {
    // Decode the URL-encoded phone number
    const telephone = decodeURIComponent(req.params.telephone);
    
    console.log('📦 Récupération historique des livraisons:');
    console.log('  Téléphone:', telephone);
    
    // First, get the client ID
    const clientResult = await pool.query(
      'SELECT id_client FROM Client WHERE telephone = $1',
      [telephone]
    );

    if (clientResult.rows.length === 0) {
      console.log('❌ Client non trouvé');
      return res.json({
        success: true,
        deliveries: []
      });
    }

    const clientId = clientResult.rows[0].id_client;
    console.log('👤 Client ID:', clientId);

    // Query for active deliveries from Livraison table
    const activeDeliveriesQuery = `
      SELECT
        l.id_livraison,
        l.adresse_depart,
        l.adresse_arrivee,
        l.destinataire_nom,
        l.destinataire_telephone,
        l.instructions,
        l.taille_colis,
        l.prix,
        l.date_heure_depart,
        l.date_heure_arrivee,
        l.etat_livraison,
        l.est_paye,
        liv.nom as livreur_nom,
        liv.prenom as livreur_prenom,
        p.mode as mode_paiement,
        n.note as rating,
        t.nom as type_livraison,
        'active' as source_table
      FROM Livraison l
      LEFT JOIN Livreur liv ON l.id_livreur = liv.id_livreur
      LEFT JOIN PaiementLivraison p ON l.id_livraison = p.id_livraison
      LEFT JOIN NoteLivraison n ON l.id_livraison = n.id_livraison
      LEFT JOIN TypeLivraison t ON l.id_type = t.id_type
      WHERE l.id_client = $1
      AND l.etat_livraison IN ('terminee', 'annulee')
    `;

    // Query for archived deliveries from HistoriqueLivraison table  
    const archivedDeliveriesQuery = `
      SELECT 
        hl.id_livraison,
        hl.adresse_depart,
        hl.adresse_arrivee,
        hl.destinataire_nom,
        hl.destinataire_telephone,
        hl.instructions,
        hl.taille_colis,
        hl.prix,
        hl.date_heure_depart,
        hl.date_heure_arrivee,
        hl.etat_livraison,
        false as est_paye,
        null as livreur_nom,
        null as livreur_prenom,
        null as mode_paiement,
        null as rating,
        null as type_livraison,
        'archived' as source_table
      FROM HistoriqueLivraison hl
      WHERE hl.id_client = $1
    `;

    const [activeDeliveries, archivedDeliveries] = await Promise.all([
      pool.query(activeDeliveriesQuery, [clientId]),
      pool.query(archivedDeliveriesQuery, [clientId])
    ]);

    // Combine and sort by date (most recent first)
    const allDeliveries = [...activeDeliveries.rows, ...archivedDeliveries.rows]
      .sort((a, b) => new Date(b.date_heure_depart || b.archived_at) - new Date(a.date_heure_depart || a.archived_at));

    console.log(`✅ Trouvé ${allDeliveries.length} livraisons:`);
    console.log(`  - Active: ${activeDeliveries.rows.length}`);
    console.log(`  - Archivées: ${archivedDeliveries.rows.length}`);

    res.json({
      success: true,
      deliveries: allDeliveries.map(delivery => ({
        id: delivery.id_livraison,
        departure: delivery.adresse_depart,
        arrival: delivery.adresse_arrivee,
        recipient: {
          name: delivery.destinataire_nom,
          phone: delivery.destinataire_telephone
        },
        instructions: delivery.instructions,
        packageSize: delivery.taille_colis,
        price: delivery.prix,
        departureTime: delivery.date_heure_depart,
        arrivalTime: delivery.date_heure_arrivee,
        status: delivery.etat_livraison,
        isPaid: delivery.est_paye,
        deliveryPerson: delivery.livreur_nom && delivery.livreur_prenom ? 
          `${delivery.livreur_prenom} ${delivery.livreur_nom}` : null,
        paymentMethod: delivery.mode_paiement,
        rating: delivery.rating,
        deliveryType: delivery.type_livraison,
        source: delivery.source_table
      }))
    });

  } catch (error) {
    console.error('❌ Erreur lors de la récupération des livraisons:', error);
    console.error('❌ Stack trace:', error.stack);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur lors de la récupération des livraisons',
      details: error.message 
    });
  }
});

// GET - Get client's current active trip with driver details
router.get('/current/:clientId', async (req, res) => {
  const { clientId } = req.params;
  
  try {
    console.log(`🚗 Fetching current trip for client: ${clientId}`);
    
    // Get current trip with full driver and vehicle details
    const result = await db.query(`
      SELECT 
        c.id_course,
        c.adresse_depart,
        c.adresse_arrivee,
        c.distance_km,
        c.duree_min,
        c.prix,
        c.mode_paiement,
        c.mode_silencieux,
        c.latitude_depart,
        c.longitude_depart,
        c.latitude_arrivee,
        c.longitude_arrivee,
        c.telephone_client,
        c.nom_client,
        c.date_heure_depart,
        c.date_heure_debut_course,
        c.etat_course,
        ch.id_chauffeur,
        ch.nom AS chauffeur_nom,
        ch.prenom AS chauffeur_prenom,
        ch.telephone AS chauffeur_telephone,
        v.marque AS vehicule_marque,
        v.modele AS vehicule_modele,
        v.plaque_immatriculation,
        v.couleur AS vehicule_couleur
      FROM Course c
      LEFT JOIN Chauffeur ch ON c.id_chauffeur = ch.id_chauffeur
      LEFT JOIN Vehicule v ON v.id_chauffeur = ch.id_chauffeur
      WHERE c.id_client = $1 
      AND c.etat_course IN ('acceptee', 'en_route_pickup', 'arrivee_pickup', 'en_cours')
      ORDER BY c.date_heure_depart DESC
      LIMIT 1
    `, [clientId]);

    console.log(`📊 Found ${result.rowCount} active trips for client ${clientId}`);

    if (result.rowCount === 0) {
      return res.json({
        success: true,
        hasActiveTrip: false,
        message: 'Aucune course active'
      });
    }

    const trip = result.rows[0];
    
    // Format the response
    const response = {
      success: true,
      hasActiveTrip: true,
      trip: {
        id: trip.id_course,
        pickup: trip.adresse_depart,
        destination: trip.adresse_arrivee,
        distance: trip.distance_km,
        duration: trip.duree_min,
        price: trip.prix,
        paymentMode: trip.mode_paiement,
        silentMode: trip.mode_silencieux,
        status: trip.etat_course,
        departureTime: trip.date_heure_depart,
        startTime: trip.date_heure_debut_course,
        chauffeur: trip.id_chauffeur ? {
          id: trip.id_chauffeur,
          nom: `${trip.chauffeur_prenom || ''} ${trip.chauffeur_nom || ''}`.trim(),
          telephone: trip.chauffeur_telephone,
          vehicule: {
            marque: trip.vehicule_marque,
            modele: trip.vehicule_modele,
            plaque: trip.plaque_immatriculation,
            couleur: trip.vehicule_couleur
          }
        } : null,
        pickupCoords: trip.latitude_depart && trip.longitude_depart ? {
          latitude: parseFloat(trip.latitude_depart),
          longitude: parseFloat(trip.longitude_depart)
        } : null,
        destinationCoords: trip.latitude_arrivee && trip.longitude_arrivee ? {
          latitude: parseFloat(trip.latitude_arrivee),
          longitude: parseFloat(trip.longitude_arrivee)
        } : null
      }
    };

    console.log(`✅ Returning trip details:`, {
      tripId: response.trip.id,
      status: response.trip.status,
      hasDriver: !!response.trip.chauffeur,
      driverName: response.trip.chauffeur?.nom
    });

    res.json(response);

  } catch (err) {
    console.error(`❌ Error fetching current trip for client ${clientId}:`, err);
    console.error('❌ Stack trace:', err.stack);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur',
      details: err.message
    });
  }
});

// GET - Get client's current active delivery with delivery person details
router.get('/current-delivery/:clientId', async (req, res) => {
  const { clientId } = req.params;

  try {
    console.log(`📦 Fetching current delivery for client: ${clientId}`);

    // Get current delivery with full delivery person details
    const result = await pool.query(`
      SELECT
        l.id_livraison,
        l.adresse_depart,
        l.adresse_arrivee,
        l.destinataire_nom,
        l.destinataire_telephone,
        l.taille_colis,
        l.prix,
        l.mode_paiement,
        l.latitude_depart,
        l.longitude_depart,
        l.latitude_arrivee,
        l.longitude_arrivee,
        l.date_heure_depart,
        l.date_heure_debut_livraison,
        l.etat_livraison,
        l.instructions,
        liv.id_livreur,
        liv.nom AS livreur_nom,
        liv.prenom AS livreur_prenom,
        liv.telephone AS livreur_telephone,
        liv.photo AS livreur_photo,
        t.nom AS type_livraison
      FROM Livraison l
      LEFT JOIN Livreur liv ON l.id_livreur = liv.id_livreur
      LEFT JOIN TypeLivraison t ON l.id_type = t.id_type
      WHERE l.id_client = $1
      AND l.etat_livraison IN ('acceptee', 'en_route_pickup', 'arrivee_pickup', 'en_cours')
      ORDER BY l.date_heure_depart DESC
      LIMIT 1
    `, [clientId]);

    console.log(`📊 Found ${result.rowCount} active deliveries for client ${clientId}`);

    if (result.rowCount === 0) {
      return res.json({
        success: true,
        hasActiveDelivery: false,
        message: 'Aucune livraison active'
      });
    }

    const delivery = result.rows[0];

    // Format the response
    const response = {
      success: true,
      hasActiveDelivery: true,
      delivery: {
        id: delivery.id_livraison,
        pickup: delivery.adresse_depart,
        destination: delivery.adresse_arrivee,
        recipientName: delivery.destinataire_nom,
        recipientPhone: delivery.destinataire_telephone,
        packageSize: delivery.taille_colis,
        price: delivery.prix,
        paymentMode: delivery.mode_paiement,
        status: delivery.etat_livraison,
        instructions: delivery.instructions,
        departureTime: delivery.date_heure_depart,
        startTime: delivery.date_heure_debut_livraison,
        deliveryPerson: delivery.id_livreur ? {
          id: delivery.id_livreur,
          nom: `${delivery.livreur_prenom || ''} ${delivery.livreur_nom || ''}`.trim(),
          telephone: delivery.livreur_telephone,
          photo: delivery.livreur_photo
        } : null,
        deliveryType: delivery.type_livraison,
        pickupCoords: delivery.latitude_depart && delivery.longitude_depart ? {
          latitude: parseFloat(delivery.latitude_depart),
          longitude: parseFloat(delivery.longitude_depart)
        } : null,
        destinationCoords: delivery.latitude_arrivee && delivery.longitude_arrivee ? {
          latitude: parseFloat(delivery.latitude_arrivee),
          longitude: parseFloat(delivery.longitude_arrivee)
        } : null
      }
    };

    console.log(`✅ Returning delivery details:`, {
      deliveryId: response.delivery.id,
      status: response.delivery.status,
      hasDeliveryPerson: !!response.delivery.deliveryPerson,
      deliveryPersonName: response.delivery.deliveryPerson?.nom
    });

    res.json(response);

  } catch (err) {
    console.error(`❌ Error fetching current delivery for client ${clientId}:`, err);
    console.error('❌ Stack trace:', err.stack);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur',
      details: err.message
    });
  }
});

module.exports = router;
