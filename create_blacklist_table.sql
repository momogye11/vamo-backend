CREATE TABLE IF NOT EXISTS ChauffeurBlacklistTemporaire (
    id_blacklist SERIAL PRIMARY KEY,
    id_chauffeur INTEGER REFERENCES Chauffeur(id_chauffeur) ON DELETE CASCADE,
    id_course INTEGER REFERENCES Course(id_course) ON DELETE CASCADE,
    blacklist_jusqu_a TIMESTAMP NOT NULL,
    raison TEXT DEFAULT 'Annulation par le chauffeur',
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(id_chauffeur, id_course)
);

CREATE INDEX IF NOT EXISTS idx_blacklist_expiration ON ChauffeurBlacklistTemporaire(blacklist_jusqu_a);
CREATE INDEX IF NOT EXISTS idx_blacklist_course ON ChauffeurBlacklistTemporaire(id_course);
