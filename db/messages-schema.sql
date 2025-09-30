-- ======================================
--         TABLE MESSAGES POUR VAMO
-- ======================================

-- Table pour stocker les messages de chat entre clients et chauffeurs/livreurs
CREATE TABLE IF NOT EXISTS Messages (
    id_message SERIAL PRIMARY KEY,
    trip_id VARCHAR(100) NOT NULL,  -- ID du voyage ou de la livraison
    sender_id INTEGER NOT NULL,     -- ID de l'expéditeur (client, chauffeur, ou livreur)
    sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('client', 'chauffeur', 'livreur')),
    receiver_id INTEGER,            -- ID du destinataire (optionnel pour les chats de groupe)
    receiver_type VARCHAR(20) CHECK (receiver_type IN ('client', 'chauffeur', 'livreur')),
    message_text TEXT NOT NULL,     -- Contenu du message
    service_type VARCHAR(20) NOT NULL CHECK (service_type IN ('course', 'delivery')),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_read BOOLEAN DEFAULT FALSE
);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_trip_messages ON Messages (trip_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_sender_messages ON Messages (sender_id, sender_type);
CREATE INDEX IF NOT EXISTS idx_unread_messages ON Messages (receiver_id, is_read);

-- Note: Les contraintes FK sont omises car trip_id peut référencer différentes tables
-- selon le service_type (Course pour 'course', Livraison pour 'delivery')