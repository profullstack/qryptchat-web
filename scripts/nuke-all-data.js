#!/usr/bin/env node

/**
 * NUCLEAR DATABASE CLEANUP SCRIPT
 * 
 * ⚠️  WARNING: THIS SCRIPT WILL DELETE ALL USER DATA FROM THE DATABASE ⚠️
 * 
 * This script completely wipes all user data from the database including:
 * - All users
 * - All conversations (including note-to-self)
 * - All messages
 * - All conversation participants
 * - All message status records
 * - All user presence data
 * - All typing indicators
 * - All encrypted files
 * - All deliveries
 * - All voice calls
 * - All user public keys
 * - All encrypted key backups
 * 
 * Usage: node scripts/nuke-all-data.js
 * 
 * Environment variables required:
 * - PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

// Database connection
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing required environment variables:');
    console.error('   - PUBLIC_SUPABASE_URL (or SUPABASE_URL)');
    console.error('   - SUPABASE_SERVICE_ROLE_KEY');
    console.error('');
    console.error('Available environment variables:');
    console.error('   PUBLIC_SUPABASE_URL:', process.env.PUBLIC_SUPABASE_URL ? '✓ Set' : '✗ Missing');
    console.error('   SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ Set' : '✗ Missing');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Delete all records from a table
 */
async function deleteAllFromTable(tableName, description) {
    try {
        console.log(`🔄 ${description}...`);
        
        // First get count for reporting
        const { count: beforeCount } = await supabase
            .from(tableName)
            .select('*', { count: 'exact', head: true });
        
        if (beforeCount === 0) {
            console.log(`✅ ${description} completed (table was already empty)`);
            return true;
        }
        
        // Delete all records
        const { error } = await supabase
            .from(tableName)
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records (using impossible ID)
        
        if (error) {
            console.error(`❌ Error ${description.toLowerCase()}:`, error.message);
            return false;
        }
        
        console.log(`✅ ${description} completed (deleted ${beforeCount} records)`);
        return true;
    } catch (err) {
        console.error(`❌ Exception ${description.toLowerCase()}:`, err.message);
        return false;
    }
}

/**
 * Execute raw SQL (for trigger management)
 */
async function executeRawSQL(sql, description) {
    try {
        console.log(`🔄 ${description}...`);
        
        // Use the REST API directly for raw SQL
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'apikey': supabaseServiceKey
            },
            body: JSON.stringify({ sql })
        });
        
        if (!response.ok) {
            // If exec_sql doesn't exist, skip trigger management
            if (response.status === 404) {
                console.log(`⚠️  ${description} skipped (exec_sql function not available)`);
                return true;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        console.log(`✅ ${description} completed`);
        return true;
    } catch (err) {
        console.log(`⚠️  ${description} skipped:`, err.message);
        return true; // Don't fail the whole process for trigger management
    }
}

/**
 * Nuclear cleanup function
 */
async function nukeAllData() {
    console.log('🚨 NUCLEAR DATABASE CLEANUP INITIATED 🚨');
    console.log('');
    console.log('⚠️  WARNING: This will delete ALL user data from the database!');
    console.log('');
    
    // Confirmation prompt
    const readline = await import('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    const confirm = await new Promise((resolve) => {
        rl.question('Type "NUKE" to confirm complete data deletion: ', (answer) => {
            rl.close();
            resolve(answer);
        });
    });
    
    if (confirm !== 'NUKE') {
        console.log('❌ Operation cancelled. Database remains unchanged.');
        process.exit(0);
    }
    
    console.log('');
    console.log('💥 Beginning nuclear cleanup...');
    console.log('');
    
    // Step 1: Try to disable note-to-self protection trigger (may not work, that's OK)
    await executeRawSQL(`
        DROP TRIGGER IF EXISTS trigger_prevent_note_to_self_deletion ON conversations;
    `, 'Disabling note-to-self protection trigger');
    
    // Step 2: Delete all data in dependency order using Supabase client
    const cleanupOperations = [
        { table: 'deliveries', description: 'Deleting all deliveries' },
        { table: 'message_status', description: 'Deleting all message status records' },
        { table: 'encrypted_files', description: 'Deleting all encrypted files' },
        { table: 'voice_calls', description: 'Deleting all voice calls' },
        { table: 'messages', description: 'Deleting all messages' },
        { table: 'conversation_participants', description: 'Deleting all conversation participants' },
        { table: 'conversations', description: 'Deleting all conversations (including note-to-self)' },
        { table: 'typing_indicators', description: 'Deleting all typing indicators' },
        { table: 'user_presence', description: 'Deleting all user presence data' },
        { table: 'user_public_keys', description: 'Deleting all user public keys' },
        { table: 'encrypted_key_backups', description: 'Deleting all encrypted key backups' },
        { table: 'users', description: 'Deleting all users' }
    ];
    
    let successCount = 0;
    
    for (const { table, description } of cleanupOperations) {
        const success = await deleteAllFromTable(table, description);
        if (success) successCount++;
    }
    
    // Step 3: Try to re-enable note-to-self protection trigger (may not work, that's OK)
    await executeRawSQL(`
        CREATE TRIGGER trigger_prevent_note_to_self_deletion
            BEFORE DELETE ON conversations
            FOR EACH ROW
            EXECUTE FUNCTION prevent_note_to_self_deletion();
    `, 'Re-enabling note-to-self protection trigger');
    
    // Step 4: Verify cleanup
    console.log('');
    console.log('🔍 Verifying cleanup...');
    
    const verificationTables = ['users', 'conversations', 'messages', 'conversation_participants'];
    
    for (const table of verificationTables) {
        try {
            const { count } = await supabase
                .from(table)
                .select('*', { count: 'exact', head: true });
            console.log(`   ${table}: ${count || 0} records`);
        } catch (err) {
            console.log(`   ${table}: Error checking (${err.message})`);
        }
    }
    
    console.log('');
    if (successCount === cleanupOperations.length) {
        console.log('💥 NUCLEAR CLEANUP COMPLETED SUCCESSFULLY! 💥');
        console.log('🧹 All user data has been permanently deleted from the database.');
    } else {
        console.log(`⚠️  PARTIAL CLEANUP: ${successCount}/${cleanupOperations.length} operations succeeded`);
        console.log('Some data may still remain in the database.');
    }
    
    console.log('');
    console.log('Database is now clean and ready for fresh user registrations.');
}

// Execute the nuclear cleanup
nukeAllData().catch((error) => {
    console.error('💥 Nuclear cleanup failed:', error);
    process.exit(1);
});