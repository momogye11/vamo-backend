-- ======================================
--    TABLE MESSAGES POUR LE CHAT
-- ======================================

-- Supprimer la table si elle existe (pour réinitialisation)
DROP TABLE IF EXISTS Messages CASCADE;

-- Créer la table Messages
CREATE TABLE Messages (
    id_message SERIAL PRIMARY KEY,
    trip_id VARCHAR(100) NOT NULL,  -- Support pour IDs numériques et temporaires (ex: "chat_driver_123")
    sender_id INTEGER NOT NULL,
    sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('client', 'chauffeur', 'livreur')),
    receiver_id INTEGER,
    receiver_type VARCHAR(20) CHECK (receiver_type IN ('client', 'chauffeur', 'livreur')),
    message_text TEXT NOT NULL,
    service_type VARCHAR(20) NOT NULL CHECK (service_type IN ('course', 'delivery')),
    is_read BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour accélérer les requêtes
CREATE INDEX idx_messages_trip_id ON Messages(trip_id);
CREATE INDEX idx_messages_trip_service ON Messages(trip_id, service_type);
CREATE INDEX idx_messages_receiver ON Messages(receiver_id, receiver_type, is_read);
CREATE INDEX idx_messages_timestamp ON Messages(trip_id, timestamp DESC);

-- Commentaires pour documentation
COMMENT ON TABLE Messages IS 'Table pour stocker les messages de chat entre clients et chauffeurs/livreurs';
COMMENT ON COLUMN Messages.trip_id IS 'ID du trip/livraison (peut être numérique ou temporaire comme chat_driver_123)';
COMMENT ON COLUMN Messages.sender_type IS 'Type d''expéditeur: client, chauffeur, ou livreur';
COMMENT ON COLUMN Messages.service_type IS 'Type de service: course (VTC) ou delivery (livraison)';
COMMENT ON COLUMN Messages.is_read IS 'Indique si le message a été lu par le destinataire';
