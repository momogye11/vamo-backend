-- Enhanced schema for complete trip lifecycle management

-- Add new columns to Course table for trip state management
ALTER TABLE Course ADD COLUMN IF NOT EXISTS mode_paiement VARCHAR(20) CHECK (mode_paiement IN ('wave', 'orange_money', 'especes'));
ALTER TABLE Course ADD COLUMN IF NOT EXISTS mode_silencieux BOOLEAN DEFAULT FALSE;
ALTER TABLE Course ADD COLUMN IF NOT EXISTS date_heure_arrivee_pickup TIMESTAMP;
ALTER TABLE Course ADD COLUMN IF NOT EXISTS date_heure_debut_course TIMESTAMP;
ALTER TABLE Course ADD COLUMN IF NOT EXISTS latitude_depart DECIMAL(9, 6);
ALTER TABLE Course ADD COLUMN IF NOT EXISTS longitude_depart DECIMAL(9, 6);
ALTER TABLE Course ADD COLUMN IF NOT EXISTS latitude_arrivee DECIMAL(9, 6);
ALTER TABLE Course ADD COLUMN IF NOT EXISTS longitude_arrivee DECIMAL(9, 6);
ALTER TABLE Course ADD COLUMN IF NOT EXISTS telephone_client VARCHAR(20);
ALTER TABLE Course ADD COLUMN IF NOT EXISTS nom_client VARCHAR(100);

-- Update etat_course to include all necessary states
-- States: 'en_attente', 'acceptee', 'en_route_pickup', 'arrivee_pickup', 'en_cours', 'terminee', 'annulee'

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_course_etat ON Course(etat_course);
CREATE INDEX IF NOT EXISTS idx_course_chauffeur ON Course(id_chauffeur);
CREATE INDEX IF NOT EXISTS idx_course_date ON Course(date_heure_depart);

-- Create real-time notifications table for drivers
CREATE TABLE IF NOT EXISTS NotificationChauffeur (
    id_notification SERIAL PRIMARY KEY,
    id_chauffeur INTEGER REFERENCES Chauffeur(id_chauffeur) ON DELETE CASCADE,
    id_course INTEGER REFERENCES Course(id_course) ON DELETE CASCADE,
    type_notification VARCHAR(50) NOT NULL, -- 'nouvelle_course', 'course_annulee', etc.
    message TEXT,
    lu BOOLEAN DEFAULT FALSE,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create trip status tracking table
CREATE TABLE IF NOT EXISTS EtatCourse (
    id_etat SERIAL PRIMARY KEY,
    id_course INTEGER REFERENCES Course(id_course) ON DELETE CASCADE,
    ancien_etat VARCHAR(20),
    nouvel_etat VARCHAR(20),
    date_changement TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    commentaire TEXT
);

-- Sample data for testing
INSERT INTO Client (nom, prenom, telephone) VALUES 
('Diallo', 'Fatou', '+221776543210'),
('Ndiaye', 'Moussa', '+221779876543')
ON CONFLICT (telephone) DO NOTHING;

-- Insert a test course request
INSERT INTO Course (
    id_client, 
    adresse_depart, 
    adresse_arrivee, 
    distance_km, 
    duree_min, 
    prix, 
    mode_paiement,
    mode_silencieux,
    latitude_depart,
    longitude_depart,
    latitude_arrivee,
    longitude_arrivee,
    telephone_client,
    nom_client,
    date_heure_depart,
    etat_course
) VALUES (
    1,
    'Almadies, Dakar',
    'Aéroport International Blaise Diagne',
    25.5,
    35,
    4500,
    'wave',
    false,
    14.7167,
    -17.4677,
    14.6707,
    -17.0732,
    '+221776543210',
    'Fatou Diallo',
    NOW(),
    'en_attente'
) ON CONFLICT DO NOTHING;