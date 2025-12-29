# Supabase Setup Instructions

## Database Configuration

The application is now configured to use Supabase (PostgreSQL) instead of SQLite.

## Initial Setup

1. **Create Tables**: Run the PostgreSQL schema in your Supabase SQL editor:
   - Go to your Supabase dashboard
   - Navigate to SQL Editor
   - Copy and paste the contents of `backend/src/db/schema-postgres-supabase.sql`
   - Execute the SQL
   - **Note**: "Success. No rows returned" is normal for CREATE TABLE statements - this means the tables were created successfully!

2. **Environment Variables** (Optional):
   Create a `.env` file in the `backend/` directory:
   ```
   SUPABASE_URL=https://qusvfeposzfmhggrvots.supabase.co
   SUPABASE_ANON_KEY=sb_publishable_PonqAiHcIragHdun58jMxg_bZXwWo5w
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   ```

   **Note**: For full server-side database operations, you should use the **Service Role Key** instead of the publishable/anon key. The service role key can be found in your Supabase dashboard under Settings > API.

3. **Start the Server**: The application will automatically:
   - Connect to Supabase
   - Check if tables exist
   - Seed initial data if the database is empty

## Default Credentials

After seeding, you can log in with:
- **Parents**: 
  - Name: `Rommel` or `Celiane`
  - Password: `password`
- **Children**:
  - Name: `Isabel`, `Nicholas`, or `Laura`
  - Password: (their name in lowercase, e.g., `isabel`)

## Troubleshooting

- If you see "Database tables not found", make sure you've run the schema SQL in Supabase
- If you get permission errors, ensure you're using the Service Role Key for server-side operations
- Check that your Supabase URL and API keys are correct in the `.env` file

