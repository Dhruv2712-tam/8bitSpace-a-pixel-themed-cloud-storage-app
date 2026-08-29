# 8bitSpace Supabase setup

1. Open the Supabase dashboard for the 8bitSpace project.
2. Open **SQL Editor** and create a new query.
3. Paste the complete contents of `8bitspace-setup.sql`.
4. Click **Run** and confirm the query finishes without errors.
5. In **Authentication → URL Configuration**, add `http://127.0.0.1:5173` as a redirect URL for local development.

The script creates private, user-owned profiles, folders, files and activity records. It also creates a private `space-files` Storage bucket with a 100 MB per-file limit. Files must reference a folder, and every table is protected by Row Level Security.

