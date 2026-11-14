# Supabase setup (accounts and saved fields)

Accounts use Supabase Auth (email + password). Each person's fields live in the `public.fields`
table. Row Level Security means a signed-in user can only see and change their own rows, and
visitors without an account cannot read the table at all. PostGIS works out each field's area
and perimeter on the server.

1. Create a project at https://supabase.com (free tier is fine).
2. In the dashboard, open **SQL Editor**, paste `migrations/0001_user_fields.sql` and run it.
   With the Supabase CLI you can run `supabase db push` instead.
3. Open **Project Settings > API** and copy the Project URL and the `anon` public key into
   `frontend/.env`:

   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
   VITE_SUPABASE_ANON_KEY=...
   ```

4. Restart `npm run dev`.

Email confirmation is on by default (Authentication > Providers > Email). New users must click
the link in their email before they can sign in. For local testing you can turn "Confirm email"
off.

Without these two variables the app still works for searching any location; the account and
"My fields" pages show a "not set up" message.
