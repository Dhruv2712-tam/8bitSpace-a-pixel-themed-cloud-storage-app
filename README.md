# 8bitSpace

A pixel-themed, folder-first cloud storage application built with React, Vite and Supabase.

## Features

- Supabase email/password authentication
- Private user-owned folders and files
- Folder-first uploads enforced by the database
- Private Supabase Storage with expiring signed links
- Starred items, trash, restore and activity history
- Pixel avatar and profile preferences
- Responsive desktop and mobile interface

## Local development

1. Copy `.env.example` to `.env.local` and add the Supabase project URL and publishable key.
2. Install dependencies with `npm install`.
3. Start the app with `npm run dev`.

The database and Storage setup is documented in `supabase/8bitspace-setup.sql`.

