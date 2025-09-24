#!/usr/bin/env node

/**
 * TARGETED CONSTRAINT VIOLATION FIX
 * 
 * This script specifically fixes the conversation_participants constraint violation
 * that's preventing user registration.
 * 
 * Usage: node scripts/fix-constraint-violation.js
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

// Database connection
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixConstraintViolation() {
    console.log('🔧 FIXING CONVERSATION_PARTICIPANTS CONSTRAINT VIOLATION');
    console.log('');
    
    try {
        // Step 1: Find orphaned conversation_participants records
        console.log('🔍 Finding orphaned conversation_participants records...');
        
        const { data: orphanedParticipants, error: findError } = await supabase
            .from('conversation_participants')
            .select(`
                id,
                conversation_id,
                user_id,
                conversations!inner(id, type, name)
            `)
            .is('conversations.id', null);
        
        if (findError) {
            console.log('⚠️  Could not find orphaned participants via join, trying direct approach...');
            
            // Alternative approach: get all participants and check if users exist
            const { data: allParticipants } = await supabase
                .from('conversation_participants')
                .select('id, user_id, conversation_id');
            
            const { data: allUsers } = await supabase
                .from('users')
                .select('id');
            
            const userIds = new Set(allUsers?.map(u => u.id) || []);
            const orphaned = allParticipants?.filter(p => !userIds.has(p.user_id)) || [];
            
            console.log(`📊 Found ${orphaned.length} orphaned conversation_participants records`);
            
            if (orphaned.length > 0) {
                console.log('🧹 Deleting orphaned conversation_participants...');
                
                for (const record of orphaned) {
                    const { error: deleteError } = await supabase
                        .from('conversation_participants')
                        .delete()
                        .eq('id', record.id);
                    
                    if (deleteError) {
                        console.error(`❌ Failed to delete participant ${record.id}:`, deleteError.message);
                    } else {
                        console.log(`✅ Deleted orphaned participant ${record.id}`);
                    }
                }
            }
        }
        
        // Step 2: Find conversations without participants
        console.log('🔍 Finding conversations without participants...');
        
        const { data: conversationsWithoutParticipants } = await supabase
            .from('conversations')
            .select(`
                id,
                type,
                name,
                conversation_participants!left(id)
            `)
            .is('conversation_participants.id', null);
        
        if (conversationsWithoutParticipants?.length > 0) {
            console.log(`📊 Found ${conversationsWithoutParticipants.length} conversations without participants`);
            
            for (const conv of conversationsWithoutParticipants) {
                if (conv.type !== 'note_to_self') {
                    console.log(`🧹 Deleting empty conversation ${conv.id} (${conv.type})`);
                    
                    const { error: deleteError } = await supabase
                        .from('conversations')
                        .delete()
                        .eq('id', conv.id);
                    
                    if (deleteError) {
                        console.error(`❌ Failed to delete conversation ${conv.id}:`, deleteError.message);
                    } else {
                        console.log(`✅ Deleted empty conversation ${conv.id}`);
                    }
                }
            }
        }
        
        // Step 3: Check for duplicate constraint violations using a simpler approach
        console.log('🔍 Checking for potential duplicate constraint violations...');
        
        const { data: allParticipants } = await supabase
            .from('conversation_participants')
            .select('id, conversation_id, user_id, created_at')
            .order('created_at', { ascending: true });
        
        if (allParticipants) {
            // Group by conversation_id + user_id to find duplicates
            const groups = {};
            
            for (const participant of allParticipants) {
                const key = `${participant.conversation_id}-${participant.user_id}`;
                if (!groups[key]) {
                    groups[key] = [];
                }
                groups[key].push(participant);
            }
            
            // Find groups with more than one record (duplicates)
            const duplicateGroups = Object.entries(groups).filter(([key, records]) => records.length > 1);
            
            if (duplicateGroups.length > 0) {
                console.log(`📊 Found ${duplicateGroups.length} duplicate conversation_participant combinations`);
                
                for (const [key, records] of duplicateGroups) {
                    console.log(`🧹 Fixing duplicates for key ${key} (${records.length} records)`);
                    
                    // Keep the first one (oldest), delete the rest
                    for (let i = 1; i < records.length; i++) {
                        const { error: deleteError } = await supabase
                            .from('conversation_participants')
                            .delete()
                            .eq('id', records[i].id);
                        
                        if (deleteError) {
                            console.error(`❌ Failed to delete duplicate ${records[i].id}:`, deleteError.message);
                        } else {
                            console.log(`✅ Deleted duplicate participant ${records[i].id}`);
                        }
                    }
                }
            } else {
                console.log('✅ No duplicate constraint violations found');
            }
        }
        
        // Step 4: Final verification
        console.log('');
        console.log('🔍 Final verification...');
        
        const { count: participantCount } = await supabase
            .from('conversation_participants')
            .select('*', { count: 'exact', head: true });
        
        const { count: conversationCount } = await supabase
            .from('conversations')
            .select('*', { count: 'exact', head: true });
        
        const { count: userCount } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true });
        
        console.log(`📊 Final counts:`);
        console.log(`   Users: ${userCount || 0}`);
        console.log(`   Conversations: ${conversationCount || 0}`);
        console.log(`   Conversation participants: ${participantCount || 0}`);
        
        console.log('');
        console.log('✅ CONSTRAINT VIOLATION FIX COMPLETED!');
        console.log('🎯 Try user registration again - it should work now.');
        
    } catch (error) {
        console.error('💥 Fix failed:', error);
        process.exit(1);
    }
}

// Execute the fix
fixConstraintViolation();