/**
 * @fileoverview Tests for chat archive functionality
 * Tests database functions, API endpoints, and store methods for archiving conversations
 */

import { expect } from 'chai';
import { createSupabaseClient } from '../src/lib/supabase.js';
import { chat } from '../src/lib/stores/chat.js';

describe('Chat Archive Functionality', () => {
    let supabase;
    let testUserId;
    let testConversationId;

    before(async () => {
        // Initialize Supabase client
        supabase = createSupabaseClient();
        
        // Create a test user for our tests
        const { data: authUser, error: authError } = await supabase.auth.signUp({
            email: `test-archive-${Date.now()}@example.com`,
            password: 'testpassword123'
        });

        if (authError) {
            console.error('Failed to create test user:', authError);
            throw authError;
        }

        testUserId = authUser.user.id;

        // Create a test conversation
        const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .insert({
                type: 'direct',
                name: 'Test Conversation for Archive'
            })
            .select('id')
            .single();

        if (convError) {
            console.error('Failed to create test conversation:', convError);
            throw convError;
        }

        testConversationId = conversation.id;

        // Add user as participant
        await supabase
            .from('conversation_participants')
            .insert({
                conversation_id: testConversationId,
                user_id: testUserId,
                role: 'member'
            });
    });

    after(async () => {
        // Clean up test data
        if (testConversationId) {
            await supabase
                .from('conversation_participants')
                .delete()
                .eq('conversation_id', testConversationId);

            await supabase
                .from('conversations')
                .delete()
                .eq('id', testConversationId);
        }

        if (testUserId) {
            await supabase.auth.admin.deleteUser(testUserId);
        }
    });

    describe('Database Functions', () => {
        it('should archive a conversation for a user', async () => {
            const { data: result, error } = await supabase.rpc('archive_conversation', {
                conversation_uuid: testConversationId,
                user_uuid: testUserId
            });

            expect(error).to.be.null;
            expect(result).to.be.true;

            // Verify the conversation is archived
            const { data: participant } = await supabase
                .from('conversation_participants')
                .select('archived_at')
                .eq('conversation_id', testConversationId)
                .eq('user_id', testUserId)
                .single();

            expect(participant.archived_at).to.not.be.null;
        });

        it('should unarchive a conversation for a user', async () => {
            const { data: result, error } = await supabase.rpc('unarchive_conversation', {
                conversation_uuid: testConversationId,
                user_uuid: testUserId
            });

            expect(error).to.be.null;
            expect(result).to.be.true;

            // Verify the conversation is unarchived
            const { data: participant } = await supabase
                .from('conversation_participants')
                .select('archived_at')
                .eq('conversation_id', testConversationId)
                .eq('user_id', testUserId)
                .single();

            expect(participant.archived_at).to.be.null;
        });

        it('should return false when trying to archive non-existent conversation', async () => {
            const fakeConversationId = '00000000-0000-0000-0000-000000000000';
            
            const { data: result, error } = await supabase.rpc('archive_conversation', {
                conversation_uuid: fakeConversationId,
                user_uuid: testUserId
            });

            expect(error).to.be.null;
            expect(result).to.be.false;
        });

        it('should return false when trying to unarchive non-existent conversation', async () => {
            const fakeConversationId = '00000000-0000-0000-0000-000000000000';
            
            const { data: result, error } = await supabase.rpc('unarchive_conversation', {
                conversation_uuid: fakeConversationId,
                user_uuid: testUserId
            });

            expect(error).to.be.null;
            expect(result).to.be.false;
        });
    });

    describe('Enhanced Conversation Functions', () => {
        beforeEach(async () => {
            // Reset conversation to unarchived state
            await supabase
                .from('conversation_participants')
                .update({ archived_at: null })
                .eq('conversation_id', testConversationId)
                .eq('user_id', testUserId);
        });

        it('should exclude archived conversations by default', async () => {
            // Archive the conversation
            await supabase.rpc('archive_conversation', {
                conversation_uuid: testConversationId,
                user_uuid: testUserId
            });

            // Get conversations without archived ones
            const { data: conversations, error } = await supabase.rpc('get_user_conversations_enhanced', {
                user_uuid: testUserId,
                include_archived: false
            });

            expect(error).to.be.null;
            expect(conversations).to.be.an('array');
            
            const archivedConv = conversations.find(conv => conv.conversation_id === testConversationId);
            expect(archivedConv).to.be.undefined;
        });

        it('should include archived conversations when requested', async () => {
            // Archive the conversation
            await supabase.rpc('archive_conversation', {
                conversation_uuid: testConversationId,
                user_uuid: testUserId
            });

            // Get conversations with archived ones
            const { data: conversations, error } = await supabase.rpc('get_user_conversations_enhanced', {
                user_uuid: testUserId,
                include_archived: true
            });

            expect(error).to.be.null;
            expect(conversations).to.be.an('array');
            
            const archivedConv = conversations.find(conv => conv.conversation_id === testConversationId);
            expect(archivedConv).to.not.be.undefined;
            expect(archivedConv.is_archived).to.be.true;
            expect(archivedConv.archived_at).to.not.be.null;
        });

        it('should return only archived conversations', async () => {
            // Archive the conversation
            await supabase.rpc('archive_conversation', {
                conversation_uuid: testConversationId,
                user_uuid: testUserId
            });

            // Get only archived conversations
            const { data: conversations, error } = await supabase.rpc('get_user_archived_conversations', {
                user_uuid: testUserId
            });

            expect(error).to.be.null;
            expect(conversations).to.be.an('array');
            
            const archivedConv = conversations.find(conv => conv.conversation_id === testConversationId);
            expect(archivedConv).to.not.be.undefined;
            expect(archivedConv.archived_at).to.not.be.null;
        });
    });

    describe('Chat Store Methods', () => {
        let originalFetch;

        beforeEach(() => {
            // Mock fetch for store tests
            originalFetch = global.fetch;
        });

        afterEach(() => {
            // Restore original fetch
            global.fetch = originalFetch;
        });

        it('should archive conversation via store method', async () => {
            // Mock successful API response
            global.fetch = async (url, options) => {
                if (url.includes('/api/chat/conversations') && options.method === 'PATCH') {
                    const body = JSON.parse(options.body);
                    expect(body.conversation_id).to.equal(testConversationId);
                    expect(body.action).to.equal('archive');
                    
                    return {
                        ok: true,
                        json: async () => ({ success: true, message: 'Conversation archived successfully' })
                    };
                }
                return { ok: false, json: async () => ({ error: 'Not found' }) };
            };

            const result = await chat.archiveConversation(testConversationId);
            
            expect(result).to.be.an('object');
            expect(result.success).to.be.true;
        });

        it('should unarchive conversation via store method', async () => {
            // Mock successful API response
            global.fetch = async (url, options) => {
                if (url.includes('/api/chat/conversations') && options.method === 'PATCH') {
                    const body = JSON.parse(options.body);
                    expect(body.conversation_id).to.equal(testConversationId);
                    expect(body.action).to.equal('unarchive');
                    
                    return {
                        ok: true,
                        json: async () => ({ success: true, message: 'Conversation unarchived successfully' })
                    };
                }
                return { ok: false, json: async () => ({ error: 'Not found' }) };
            };

            const result = await chat.unarchiveConversation(testConversationId);
            
            expect(result).to.be.an('object');
            expect(result.success).to.be.true;
        });

        it('should handle archive API errors gracefully', async () => {
            // Mock API error response
            global.fetch = async () => ({
                ok: false,
                json: async () => ({ error: 'Conversation not found' })
            });

            const result = await chat.archiveConversation(testConversationId);
            
            expect(result).to.be.an('object');
            expect(result.success).to.be.false;
            expect(result.error).to.include('Conversation not found');
        });

        it('should load conversations with archive options', async () => {
            const testConversations = [
                { conversation_id: '1', conversation_name: 'Test 1', is_archived: false },
                { conversation_id: '2', conversation_name: 'Test 2', is_archived: true }
            ];

            // Mock API response
            global.fetch = async (url) => {
                const includeArchived = url.includes('include_archived=true');
                const archivedOnly = url.includes('archived_only=true');
                
                let filteredConversations;
                if (archivedOnly) {
                    filteredConversations = testConversations.filter(conv => conv.is_archived);
                } else if (includeArchived) {
                    filteredConversations = testConversations;
                } else {
                    filteredConversations = testConversations.filter(conv => !conv.is_archived);
                }

                return {
                    ok: true,
                    json: async () => ({ conversations: filteredConversations })
                };
            };

            // Test default behavior (no archived)
            await chat.loadConversations('test-user');
            // Test include archived
            await chat.loadConversations('test-user', true);
            // Test archived only
            await chat.loadArchivedConversations();
        });
    });

    describe('Edge Cases', () => {
        it('should handle archiving already archived conversation', async () => {
            // Archive the conversation first
            await supabase.rpc('archive_conversation', {
                conversation_uuid: testConversationId,
                user_uuid: testUserId
            });

            // Try to archive again
            const { data: result, error } = await supabase.rpc('archive_conversation', {
                conversation_uuid: testConversationId,
                user_uuid: testUserId
            });

            expect(error).to.be.null;
            expect(result).to.be.false; // Should return false as it's already archived
        });

        it('should handle unarchiving already unarchived conversation', async () => {
            // Ensure conversation is unarchived
            await supabase
                .from('conversation_participants')
                .update({ archived_at: null })
                .eq('conversation_id', testConversationId)
                .eq('user_id', testUserId);

            // Try to unarchive
            const { data: result, error } = await supabase.rpc('unarchive_conversation', {
                conversation_uuid: testConversationId,
                user_uuid: testUserId
            });

            expect(error).to.be.null;
            expect(result).to.be.false; // Should return false as it's already unarchived
        });
    });
});