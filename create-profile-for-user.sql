-- Run this in Supabase SQL Editor to create a profile for your auth user
-- Replace 'YOUR_USER_UUID_HERE' with the actual UUID from auth.users table

-- First, find your user UUID:
-- SELECT id, email FROM auth.users;

-- Then create the profile (replace YOUR_USER_UUID_HERE):
INSERT INTO profiles (id, username)
VALUES ('YOUR_USER_UUID_HERE', 'YourUsername')
ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username;
