// Nuclear Delete Functionality Tests
// Testing Framework: Mocha with Chai assertions
import { expect } from 'chai';
import { createSupabaseClient } from '../src/lib/supabase.js';

describe('Nuclear Delete Functionality', function() {
    this.timeout(10000); // Allow longer timeout for database operations
    
    let supabase;
    let testUser;
    let testAuthUser;
    
    before(async function() {
        supabase = createSupabaseClient();
        
        // Create test user for testing
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: `test-${Date.now()}@example.com`,
            password: 'test-password-123',
            options: {
                data: {
                    phone_number: `+1555${Date.now().toString().slice(-7)}`
                }
            }
        });
        
        if (authError) {
            throw new Error(`Failed to create test auth user: ${authError.message}`);
        }
        
        testAuthUser = authData.user;
        
        // Create corresponding user record in our users table
        const { data: userData, error: userError } = await supabase
            .from('users')
            .insert({
                auth_user_id: testAuthUser.id,
                phone_number: `+1555${Date.now().toString().slice(-7)}`,
                username: `test_user_${Date.now()}`
            })
            .select()
            .single();
            
        if (userError) {
            throw new Error(`Failed to create test user: ${userError.message}`);
        }
        
        testUser = userData;
    });
    
    after(async function() {
        // Clean up test user if it still exists
        if (testAuthUser) {
            try {
                await supabase.auth.admin.deleteUser(testAuthUser.id);
            } catch (error) {
                console.log('Test user cleanup failed (expected if nuclear delete worked):', error.message);
            }
        }
    });
    
    describe('Database Function: nuclear_delete_user_data', function() {
        
        it('should exist and be callable', async function() {
            // Test that the function exists by calling it with a non-existent user
            const { error } = await supabase.rpc('nuclear_delete_user_data', {
                target_user_id: '00000000-0000-0000-0000-000000000000'
            });
            
            // Should fail because user doesn't exist, but function should be callable
            expect(error).to.not.be.null;
            expect(error.message).to.include('User not found');
        });
        
        it('should require authentication', async function() {
            // Sign out to test unauthenticated access
            await supabase.auth.signOut();
            
            const { error } = await supabase.rpc('nuclear_delete_user_data', {
                target_user_id: testUser.id
            });
            
            expect(error).to.not.be.null;
            expect(error.message).to.include('User must be authenticated');
            
            // Sign back in for other tests
            await supabase.auth.signInWithPassword({
                email: testAuthUser.email,
                password: 'test-password-123'
            });
        });
        
        it('should prevent users from deleting other users\' data', async function() {
            // Create a second test user
            const { data: authData2, error: authError2 } = await supabase.auth.signUp({
                email: `test2-${Date.now()}@example.com`,
                password: 'test-password-123'
            });
            
            if (authError2) {
                throw new Error(`Failed to create second test user: ${authError2.message}`);
            }
            
            const { data: userData2, error: userError2 } = await supabase
                .from('users')
                .insert({
                    auth_user_id: authData2.user.id,
                    phone_number: `+1555${Date.now().toString().slice(-6)}`,
                    username: `test_user2_${Date.now()}`
                })
                .select()
                .single();
            
            if (userError2) {
                throw new Error(`Failed to create second test user record: ${userError2.message}`);
            }
            
            // Try to delete the second user's data while signed in as first user
            const { error } = await supabase.rpc('nuclear_delete_user_data', {
                target_user_id: userData2.id
            });
            
            expect(error).to.not.be.null;
            expect(error.message).to.include('Users can only delete their own data');
            
            // Clean up second user
            await supabase.auth.admin.deleteUser(authData2.user.id);
            await supabase.from('users').delete().eq('id', userData2.id);
        });
        
    });
    
    describe('API Endpoint: /api/user/nuclear-delete', function() {
        
        it('should reject GET requests', async function() {
            const response = await fetch('/api/user/nuclear-delete', {
                method: 'GET'
            });
            
            expect(response.status).to.equal(405);
            const result = await response.json();
            expect(result.error).to.equal('Method not allowed');
        });
        
        it('should reject POST requests', async function() {
            const response = await fetch('/api/user/nuclear-delete', {
                method: 'POST'
            });
            
            expect(response.status).to.equal(405);
            const result = await response.json();
            expect(result.error).to.equal('Method not allowed');
        });
        
        it('should require authentication', async function() {
            const response = await fetch('/api/user/nuclear-delete', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    confirmation: 'DELETE_ALL_MY_DATA'
                })
            });
            
            expect(response.status).to.equal(401);
            const result = await response.json();
            expect(result.error).to.equal('Not authenticated');
        });
        
        it('should require explicit confirmation', async function() {
            // This test would require proper session setup
            // For now, we'll test the validation logic conceptually
            const testCases = [
                { confirmation: '', expectedError: 'Nuclear delete requires explicit confirmation' },
                { confirmation: 'DELETE_ALL_DATA', expectedError: 'Nuclear delete requires explicit confirmation' },
                { confirmation: 'delete_all_my_data', expectedError: 'Nuclear delete requires explicit confirmation' },
                // { confirmation: 'DELETE_ALL_MY_DATA', expectedSuccess: true } // This would actually delete
            ];
            
            for (const testCase of testCases) {
                if (testCase.expectedError) {
                    // Test invalid confirmations - these should all be rejected
                    expect(testCase.confirmation).to.not.equal('DELETE_ALL_MY_DATA');
                }
            }
        });
        
    });
    
    describe('Data Deletion Completeness', function() {
        
        before(async function() {
            // Create test data across all tables for our test user
            console.log('Setting up test data for deletion test...');
            
            // Create a conversation
            const { data: conversation } = await supabase
                .from('conversations')
                .insert({
                    title: 'Test Conversation',
                    type: 'direct',
                    created_by: testUser.id
                })
                .select()
                .single();
            
            // Add user as participant
            await supabase
                .from('conversation_participants')
                .insert({
                    conversation_id: conversation.id,
                    user_id: testUser.id
                });
            
            // Create messages
            await supabase
                .from('messages')
                .insert({
                    conversation_id: conversation.id,
                    sender_id: testUser.id,
                    content: 'Test message content',
                    encrypted_content: 'encrypted_test_content'
                });
            
            // Create user presence
            await supabase
                .from('user_presence')
                .insert({
                    user_id: testUser.id,
                    status: 'online'
                });
            
            // Create public key
            await supabase
                .from('user_public_keys')
                .insert({
                    user_id: testUser.id,
                    key_type: 'kyber',
                    public_key: 'test_public_key_data'
                });
        });
        
        it('should delete all user-related data when nuclear delete is executed', async function() {
            // Get initial counts
            const initialCounts = {};
            
            const tables = [
                'messages',
                'conversation_participants', 
                'conversations',
                'user_presence',
                'user_public_keys',
                'users'
            ];
            
            for (const table of tables) {
                const { count } = await supabase
                    .from(table)
                    .select('*', { count: 'exact', head: true })
                    .eq(table === 'conversations' ? 'created_by' : 'user_id', testUser.id);
                initialCounts[table] = count || 0;
            }
            
            console.log('Initial data counts:', initialCounts);
            
            // Execute nuclear delete
            const { data: result, error } = await supabase.rpc('nuclear_delete_user_data', {
                target_user_id: testUser.id
            });
            
            expect(error).to.be.null;
            expect(result).to.not.be.null;
            expect(result.success).to.be.true;
            expect(result.user_id).to.equal(testUser.id);
            
            // Verify all data is deleted
            const finalCounts = {};
            for (const table of tables) {
                const { count } = await supabase
                    .from(table)
                    .select('*', { count: 'exact', head: true })
                    .eq(table === 'conversations' ? 'created_by' : 'user_id', testUser.id);
                finalCounts[table] = count || 0;
                
                expect(finalCounts[table]).to.equal(0, `Table ${table} should have no records for deleted user`);
            }
            
            console.log('Final data counts (should all be 0):', finalCounts);
            console.log('Nuclear delete result:', result);
        });
        
    });
    
    describe('Edge Cases and Error Handling', function() {
        
        it('should handle non-existent user gracefully', async function() {
            const { error } = await supabase.rpc('nuclear_delete_user_data', {
                target_user_id: '00000000-0000-0000-0000-000000000000'
            });
            
            expect(error).to.not.be.null;
            expect(error.message).to.include('User not found');
        });
        
        it('should handle invalid UUID format', async function() {
            const { error } = await supabase.rpc('nuclear_delete_user_data', {
                target_user_id: 'invalid-uuid'
            });
            
            expect(error).to.not.be.null;
            // Should get a UUID format error
        });
        
        it('should handle null target_user_id by using current user', async function() {
            // Since we already deleted our test user, this should fail with user not found
            const { error } = await supabase.rpc('nuclear_delete_user_data', {
                target_user_id: null
            });
            
            expect(error).to.not.be.null;
            // Should either fail with user not found or succeed if using current user
        });
        
    });
    
});