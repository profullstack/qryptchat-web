// Force update any remaining old format identifiers in the database
// Run with: node debug/force-update-identifiers.js

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase environment variables');
    console.log('Make sure PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function forceUpdateIdentifiers() {
    console.log('🔄 Force updating old format identifiers...');
    
    try {
        // Find all users with old format identifiers (QC prefix, length 10)
        const { data: oldFormatUsers, error: selectError } = await supabase
            .from('users')
            .select('id, username, unique_identifier')
            .like('unique_identifier', 'QC%')
            .eq('unique_identifier', 'QCE92DZEIG'); // Specifically target the one you're seeing
        
        if (selectError) {
            console.error('❌ Error finding old format users:', selectError);
            return;
        }
        
        console.log(`📊 Found ${oldFormatUsers?.length || 0} users with old format identifiers`);
        
        if (oldFormatUsers && oldFormatUsers.length > 0) {
            for (const user of oldFormatUsers) {
                console.log(`🔄 Updating user ${user.username} (${user.id})`);
                console.log(`   Old ID: ${user.unique_identifier}`);
                
                // Generate new identifier using database function
                const { data: newIdData, error: generateError } = await supabase
                    .rpc('ensure_unique_identifier');
                
                if (generateError) {
                    console.error(`❌ Error generating new ID for ${user.username}:`, generateError);
                    continue;
                }
                
                const newIdentifier = newIdData;
                console.log(`   New ID: ${newIdentifier}`);
                
                // Update the user's identifier
                const { error: updateError } = await supabase
                    .from('users')
                    .update({ unique_identifier: newIdentifier })
                    .eq('id', user.id);
                
                if (updateError) {
                    console.error(`❌ Error updating ${user.username}:`, updateError);
                } else {
                    console.log(`✅ Successfully updated ${user.username}`);
                }
            }
        } else {
            console.log('✅ No old format identifiers found');
        }
        
        // Check final state
        const { data: allUsers, error: finalError } = await supabase
            .from('users')
            .select('username, unique_identifier')
            .order('username');
        
        if (finalError) {
            console.error('❌ Error checking final state:', finalError);
        } else {
            console.log('\n📋 Current user identifiers:');
            allUsers?.forEach(user => {
                console.log(`   ${user.username}: ${user.unique_identifier}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Unexpected error:', error);
    }
}

forceUpdateIdentifiers();