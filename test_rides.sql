-- Insert sample ride data for testing TrajetsScreen

-- Insert some active rides in Course table
INSERT INTO Course (id_client, adresse_depart, adresse_arrivee, distance_km, duree_min, prix, date_heure_depart, etat_course, est_paye) 
VALUES 
(1, 'Parcelles Assainies, Dakar', 'Plateau, Dakar', 8.5, 25, 1500, '2025-01-27 14:30:00', 'termine', true),
(1, 'Almadies, Dakar', 'Yoff, Dakar', 12.2, 35, 2000, '2025-01-26 09:15:00', 'annule', false),
(1, 'Médina, Dakar', 'Sacré-Cœur, Dakar', 6.8, 18, 1200, '2025-01-25 16:45:00', 'termine', true);

-- Insert some archived rides in HistoriqueCourse table
INSERT INTO HistoriqueCourse (id_course, id_client, adresse_depart, adresse_arrivee, distance_km, duree_min, prix, date_heure_depart, etat_course) 
VALUES 
(100, 1, 'Ouakam, Dakar', 'Grand Yoff, Dakar', 15.3, 42, 2500, '2025-01-20 11:20:00', 'termine'),
(101, 1, 'HLM, Dakar', 'Point E, Dakar', 4.2, 12, 800, '2025-01-18 08:30:00', 'en_attente');