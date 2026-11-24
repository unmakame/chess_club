SET search_path=club,public;
INSERT INTO coach(slug,name,hourly_kopecks)
VALUES ('baldynov','Тамир Балдынов',300000)
ON CONFLICT (slug) DO NOTHING;
