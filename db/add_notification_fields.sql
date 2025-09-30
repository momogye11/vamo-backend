-- Add notification-related fields to existing tables
-- Execute this script to add push notification support to your database

-- Add notification fields to client table
ALTER TABLE client 
ADD COLUMN IF NOT EXISTS push_token TEXT,
ADD COLUMN IF NOT EXISTS platform VARCHAR(20),
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"trip_updates": true, "promotions": true, "reminders": true}'::jsonb,
ADD COLUMN IF NOT EXISTS last_token_update TIMESTAMP;

-- Add notification fields to chauffeur table
ALTER TABLE chauffeur 
ADD COLUMN IF NOT EXISTS push_token TEXT,
ADD COLUMN IF NOT EXISTS platform VARCHAR(20),
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"ride_requests": true, "trip_updates": true, "earnings": true, "ratings": true}'::jsonb,
ADD COLUMN IF NOT EXISTS last_token_update TIMESTAMP;

-- Add notification fields to livreur table
ALTER TABLE livreur 
ADD COLUMN IF NOT EXISTS push_token TEXT,
ADD COLUMN IF NOT EXISTS platform VARCHAR(20),
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"delivery_requests": true, "delivery_updates": true, "earnings": true, "ratings": true}'::jsonb,
ADD COLUMN IF NOT EXISTS last_token_update TIMESTAMP;

-- Create notification_log table for tracking sent notifications
CREATE TABLE IF NOT EXISTS notification_log (
    id SERIAL PRIMARY KEY,
    recipient_type VARCHAR(20) NOT NULL, -- 'client', 'driver', 'delivery_person'
    recipient_id INTEGER NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    data JSONB,
    push_token TEXT,
    expo_ticket_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'sent', -- 'sent', 'delivered', 'failed'
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    delivered_at TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_client_push_token ON client(push_token) WHERE push_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chauffeur_push_token ON chauffeur(push_token) WHERE push_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_livreur_push_token ON livreur(push_token) WHERE push_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_log_recipient ON notification_log(recipient_type, recipient_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_status ON notification_log(status);
CREATE INDEX IF NOT EXISTS idx_notification_log_created_at ON notification_log(created_at);

-- Add comments for documentation
COMMENT ON COLUMN client.push_token IS 'Expo push notification token for this client';
COMMENT ON COLUMN client.platform IS 'Platform: ios, android, web';
COMMENT ON COLUMN client.notification_preferences IS 'JSON object containing notification preferences';
COMMENT ON COLUMN client.last_token_update IS 'Timestamp of last push token update';

COMMENT ON COLUMN chauffeur.push_token IS 'Expo push notification token for this driver';
COMMENT ON COLUMN chauffeur.platform IS 'Platform: ios, android, web';
COMMENT ON COLUMN chauffeur.notification_preferences IS 'JSON object containing notification preferences';
COMMENT ON COLUMN chauffeur.last_token_update IS 'Timestamp of last push token update';

COMMENT ON COLUMN livreur.push_token IS 'Expo push notification token for this delivery person';
COMMENT ON COLUMN livreur.platform IS 'Platform: ios, android, web';
COMMENT ON COLUMN livreur.notification_preferences IS 'JSON object containing notification preferences';
COMMENT ON COLUMN livreur.last_token_update IS 'Timestamp of last push token update';

COMMENT ON TABLE notification_log IS 'Log of all push notifications sent through the system';

-- Grant permissions (adjust as needed for your database setup)
-- GRANT SELECT, INSERT, UPDATE ON notification_log TO your_app_user;
-- GRANT USAGE, SELECT ON SEQUENCE notification_log_id_seq TO your_app_user;

-- Example queries to test the new fields:
-- SELECT id_client, nom, prenom, push_token, platform, notification_preferences FROM client WHERE push_token IS NOT NULL;
-- SELECT id_chauffeur, nom, prenom, push_token, platform, notification_preferences FROM chauffeur WHERE push_token IS NOT NULL;
-- SELECT id_livreur, nom, prenom, push_token, platform, notification_preferences FROM livreur WHERE push_token IS NOT NULL;

-- View recent notifications
-- SELECT * FROM notification_log ORDER BY created_at DESC LIMIT 10;