-- Restore tyapp_app_feature.name from the pre-migration CSV.
-- Paste into the Supabase SQL editor and run once.
--
-- This puts every row back to its original display_name.
-- "TY Web App Logs" is the only intentional rename: it stays "Development".

UPDATE public.tyapp_app_feature AS f
SET name = v.name
FROM (VALUES
  ('00f69962-2ef7-48b8-97ee-499201688d42'::uuid, 'Article'),
  ('03216432-fc54-4c5b-b84c-d30e599001fe'::uuid, 'Tyweb'),
  ('0f60cb2a-b2d2-4b7e-84bf-ccc461c1f9c3'::uuid, 'T&T'),
  ('1d202738-605f-4fca-b955-3433dbbdd7d4'::uuid, 'Development'),
  ('234c6e4b-faf6-4417-ad56-aa8623adfcda'::uuid, 'TY Web App'),
  ('3239a786-3f96-4221-8c4e-c584227bf6c8'::uuid, 'Yuytre'),
  ('3315ca76-a78d-4dda-8f21-7e1c5b522759'::uuid, '525'),
  ('44a488d0-cc8e-4786-ae38-a66e08b789ad'::uuid, 'test'),
  ('490fd467-183d-4308-b00c-2d99fcdf4274'::uuid, 'test'),
  ('6316c29d-7825-438c-9c7a-8e50f3a923ad'::uuid, 'Sports'),
  ('66310ca1-0689-492a-8c69-aa00ca13655f'::uuid, 'Fit'),
  ('6a79e8a1-e9ac-4d91-866f-83ef81fd2eb6'::uuid, 'Wealth Management'),
  ('77c975c5-6a90-484d-b29a-880085bf4c0c'::uuid, 'test'),
  ('8c1dc9ab-9bb5-419e-9431-0291ab91af5a'::uuid, 'Bill'),
  ('8dbd0344-abe6-4964-ac0d-fb3edc009975'::uuid, 'Chat'),
  ('a3bb36cc-e72d-4f09-8053-1a951830cd02'::uuid, 'Section: Share'),
  ('a99c4ed5-7ece-4c35-a5de-36674a5af59a'::uuid, 'Workout'),
  ('bd947a69-2668-46aa-9a04-c4de076acd68'::uuid, 'testtesttest'),
  ('c04a9560-05b1-4d57-a3c5-b88a40f8345d'::uuid, 'Settings'),
  ('c4507a7c-465e-49ff-9821-2d38bb814f9b'::uuid, 'Work'),
  ('efadeb51-bad8-49ef-952f-6ec27b8c3895'::uuid, 'Section: Filelink'),
  ('f72e5406-c028-45ac-8e0c-64f3d9a340fe'::uuid, 'yy525'),
  ('f8dd8537-1f62-43c7-bd8c-f2dfd1edbdfb'::uuid, 'Filelink')
) AS v(id, name)
WHERE f.tb_tyapp_ap_ftr_id = v.id;
