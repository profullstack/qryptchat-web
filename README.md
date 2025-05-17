# Qrypt Chat

A service for generating Qrypt Chat.

## Automatic Deployment with GitHub Actions

This repository is configured to automatically deploy to the production server when changes are pushed to the `master` or `main` branch.

### Setup Instructions

1. **Generate an SSH key pair**:
   ```bash
   ssh-keygen -t ed25519 -C "github-actions-deploy"
   ```
   This will create a private key (`id_ed25519`) and a public key (`id_ed25519.pub`).

2. **Add the public key to your server**:
   ```bash
   # Copy the public key
   cat ~/.ssh/id_ed25519.pub
   
   # Then on your server, add it to authorized_keys
   ssh ubuntu@convert2doc.com "mkdir -p ~/.ssh && chmod 700 ~/.ssh"
   ssh ubuntu@convert2doc.com "echo 'your-public-key-here' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
   ```

3. **Add the required secrets to GitHub**:
   - Go to your GitHub repository
   - Click on "Settings" > "Secrets and variables" > "Actions"
   - Add the following secrets:
   
   a. **SSH Private Key**:
   - Click "New repository secret"
   - Name: `SSH_PRIVATE_KEY`
   - Value: Copy the entire content of your private key file (`~/.ssh/id_ed25519`)
   - Click "Add secret"
   
   b. **Environment Variables**:
   - Click "New repository secret"
   - Name: `ENV_FILE_CONTENT`
   - Value: Copy the entire content of your .env file
   - Click "Add secret"
   
   c. **Supabase Configuration**:
   - Click "New repository secret"
   - Name: `SUPABASE_URL`
   - Value: Your Supabase project URL (e.g., https://your-project-ref.supabase.co)
   - Click "Add secret"
   
   - Click "New repository secret"
   - Name: `SUPABASE_KEY`
   - Value: Your Supabase service role API key
   - Click "Add secret"
   
   - Click "New repository secret"
   - Name: `SUPABASE_DB_PASSWORD`
   - Value: Your Supabase database password
   - Click "Add secret"
   
   - Click "New repository secret"
   - Name: `SUPABASE_ACCESS_TOKEN`
   - Value: Your Supabase access token (from https://supabase.com/dashboard/account/tokens)
   - Click "Add secret"
   
   d. **Server Known Hosts** (as a fallback):
   - Run this command locally to get the server's SSH key fingerprint (using the correct port):
     ```bash
     ssh-keyscan -p 2048 104.36.23.197
     ```
   - Click "New repository secret"
   - Name: `SERVER_KNOWN_HOSTS`
   - Value: Paste the output from the ssh-keyscan command
   - Click "Add secret"

4. **Important Note About SSH Configuration**:
   - GitHub Actions doesn't have access to your local `~/.ssh/config` file
   - All scripts now use the direct IP address, port, and user:
     - IP: `104.36.23.197`
     - Port: `2048`
     - User: `ubuntu`
   - The workflow creates an SSH config file with these settings
   - If you need to use different connection details, update them in:
     - `.github/workflows/deploy.yml`
     - `bin/deploy.sh`
     - `bin/check-deployment.sh`
     - `bin/manual-deploy.sh`

4. **Verify GitHub Actions is enabled**:
   - Go to your repository on GitHub
   - Click on the "Actions" tab
   - Make sure Actions are enabled for the repository

5. **Test the workflow**:
   - Make a small change to your repository
   - Commit and push to master/main
   - Go to the "Actions" tab in your GitHub repository to monitor the workflow
   - The workflow will run the `bin/test-github-actions.sh` script on the server to verify deployment
   - Check for a new file named `github-actions-test-*.txt` on your server to confirm success

### Troubleshooting

If the deployment fails, check the following:

1. **SSH Key Issues**:
   - Make sure the public key is correctly added to the server's `~/.ssh/authorized_keys` file
   - Verify the private key is correctly added to GitHub Secrets

2. **Server Connection Issues**:
   - Check if the server hostname is correct in the workflow file
   - Make sure the server is accessible from GitHub Actions

3. **Permission Issues**:
   - Ensure the deploy script has execute permissions
   - Check if the user has permission to write to the deployment directory

4. **Environment Variables Issues**:
   - Make sure the `ENV_FILE_CONTENT` secret is properly set in GitHub Secrets
   - Verify that all required environment variables are included in the secret
   - Check if the .env file is being created correctly in the workflow logs

5. **Script Issues**:
   - Review the deploy.sh script for any errors
   - Check the GitHub Actions logs for detailed error messages

## Deployment Troubleshooting Scripts

This repository includes several scripts to help troubleshoot deployment issues:

### Check Deployment Status

Run the following script to check if GitHub Actions deployment is working correctly:

```bash
./bin/check-deployment.sh
```

This script will:
- Test SSH connection to the server
- Check if the remote directory exists
- Look for GitHub Actions test files
- Create a new test file to verify write access
- Check local Git configuration

### Manual Deployment

If GitHub Actions deployment isn't working, you can manually deploy using:

```bash
./bin/manual-deploy.sh
```

This script will:
- Deploy your code using rsync
- Make scripts executable on the remote host
- Run the test script to verify deployment
- Reload systemd daemon
- Optionally install/restart the service

### Deployment with Database Migrations

To deploy your code and run database migrations in one step:

```bash
./bin/deploy-with-migrations.sh
```

This script will:
1. Deploy your code using the regular deploy script
2. Run database migrations using the Supabase CLI
3. Restart the service to apply all changes

This is the recommended way to deploy when you have database schema changes. The GitHub Actions workflow has been updated to use this script automatically, ensuring that migrations are applied during CI/CD deployments.

#### CI/CD with Migrations

The GitHub Actions workflow has been configured to:
1. Install the Supabase CLI and set up the project
2. Run migrations as part of the deployment process

This ensures that your database schema is always in sync with your code. The workflow uses the same `supabase-db.sh` script that you can use locally.

### Test Script

The test script creates a timestamped file on the server to verify deployment:

```bash
./bin/test-github-actions.sh
```

This is automatically run by both GitHub Actions and the manual deployment script.

### Check GitHub Actions Status

To check the status of your GitHub Actions workflows:

```bash
./bin/check-github-actions.sh
```

This script will:
- Determine your GitHub repository from git remote
- Check workflow status using GitHub CLI (if installed)
- Fall back to using curl with a GITHUB_TOKEN
- Show recent workflow runs and their status

This is particularly useful for diagnosing issues with GitHub Actions not running or failing.

### Test File for Triggering Workflows

The repository includes a test file that can be modified to trigger a workflow run:

```
github-actions-test.txt
```

To trigger a new workflow run:
1. Edit the file
2. Increment the "Deployment test" number
3. Commit and push to master/main
4. Check the Actions tab on GitHub to see if the workflow runs

This provides a simple way to test if GitHub Actions is properly configured without making significant code changes.

## Database Setup

This project uses Supabase as its database. You need to set up the required tables before the application will work correctly.

### Setting Up Supabase Tables

1. **Using Migrations**:
   ```bash
   ./bin/supabase-db.sh migrate
   ```
   This will run all migrations in the `supabase/migrations` directory.

2. **Manual Setup**:
   - Go to the Supabase dashboard: https://app.supabase.io
   - Select your project
   - Go to the SQL Editor
   - Copy the contents of `supabase/migrations/20250419014200_initial_schema.sql`
   - Paste into the SQL Editor and run the query

### Required Tables

The application requires the following tables:
- `users` - For storing user information
- `api_keys` - For storing API keys
- `subscriptions` - For storing subscription information
- `payments` - For recording payment transactions
- `document_generations` - For storing document generation history

These tables are defined in the Supabase migrations in the `supabase/migrations` directory.

If you're experiencing 500 Internal Server Error when using the subscription API, it's likely because these tables don't exist in your Supabase database.

### Database Migrations with Supabase CLI

This project uses the Supabase CLI for database migrations. Migrations are stored in the `supabase/migrations` directory and are managed by the Supabase CLI.

#### Installing Supabase CLI

The Supabase CLI is automatically installed when you run the service installation script:

```bash
sudo ./bin/install-service.sh
```

Alternatively, you can use our database management script which will install the CLI if needed:

```bash
./bin/supabase-db.sh setup
```

#### Database Management

We've created a single script to handle all Supabase database operations:

```bash
./bin/supabase-db.sh [command]
```

Available commands:

1. **Setup** - Install Supabase CLI and link to your cloud project:
   ```bash
   ./bin/supabase-db.sh setup
   ```

2. **Migrate** - Run migrations on your Supabase database:
   ```bash
   ./bin/supabase-db.sh migrate
   ```

3. **Create New Migration** - Create a new migration file:
   ```bash
   ./bin/supabase-db.sh new add_user_preferences
   ```

**Note:** You need to add `SUPABASE_DB_PASSWORD` to your .env file. This is your database password from the Supabase dashboard.

#### Migration Files

Migration files are stored in the `supabase/migrations` directory with timestamp prefixes. Here's an example migration file:

```sql
-- Add user_preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT DEFAULT 'light',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on user_id
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
```
For more information on Supabase migrations, see the [Supabase CLI documentation](https://supabase.com/docs/reference/cli/supabase-db-push).

## Supabase Storage Configuration

This application uses Supabase Storage to store generated documents (PDFs, DOCs, etc.). The application requires a properly configured storage bucket to function correctly.

### Storage Bucket Setup

The application uses a storage bucket named `documents` to store all generated files. During deployment, the `setup-supabase-storage.js` script is automatically run to ensure this bucket exists:

```bash
node bin/setup-supabase-storage.js
```

This script:
1. Checks if the `documents` bucket exists
2. Creates it if it doesn't exist
3. Configures appropriate permissions
4. Tests the bucket with a sample upload

### Manual Bucket Creation

If you need to manually create the storage bucket:

1. Go to the Supabase dashboard
2. Navigate to Storage
3. Create a new bucket named `documents`
4. Set it to private (not public)
5. Configure RLS policies to allow authenticated users to access their own documents

### Authentication and Storage

The application uses Supabase's service role key for storage operations to ensure reliability even when user JWT tokens expire. This approach:

1. Prevents "Bucket not found" errors
2. Handles JWT token expiration gracefully
3. Associates documents with existing users in the database

Note: The application only associates documents with existing users and does not create new users. If a user doesn't exist in the database, the document will still be generated but won't be recorded in the document history.

## Puppeteer Configuration

This application uses Puppeteer for HTML to PDF conversion. Puppeteer requires a Chrome executable to function properly. The application is configured to automatically detect the appropriate Chrome path based on the environment.

### Chrome Path Detection

The application uses the following strategy to determine the Chrome executable path:

1. **Environment Variable**: If `PUPPETEER_EXECUTABLE_PATH` is set in the `.env` file, it will be used directly.
2. **Auto-detection**: If no environment variable is set, the application will attempt to detect the Chrome path based on the current user:
   - Production path (ubuntu user): `/home/ubuntu/.cache/puppeteer/chrome/linux-135.0.7049.114/chrome-linux64/chrome`
   - Local development path: `/home/username/.cache/puppeteer/chrome/linux-135.0.7049.114/chrome-linux64/chrome`

### Deployment Configuration

During deployment, the `setup-puppeteer.sh` script is automatically run to configure the Chrome path in the production environment. This script:

1. Detects the current user and environment
2. Checks if Chrome exists at the expected path
3. Updates the `.env` file with the correct `PUPPETEER_EXECUTABLE_PATH` if needed

### Manual Configuration

If you need to manually configure the Chrome path:

1. Find your Chrome executable path:
   ```bash
   find ~/.cache/puppeteer -name chrome
   ```

2. Add the path to your `.env` file:
   ```
   PUPPETEER_EXECUTABLE_PATH=/path/to/chrome
   ```

3. Restart the application

### Testing PDF Generation

You can test PDF generation with the correct Chrome path using:

```bash
node scripts/test-pdf-generation.js
```

This script will generate a test PDF and output the detected Chrome path.
