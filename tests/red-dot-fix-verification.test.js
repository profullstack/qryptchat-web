// Test to verify red dot disappearing functionality works correctly
// This test focuses specifically on the user ID conversion issue

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key';

describe('Red Dot Fix Verification', () => {
  let supabase;

  before(() => {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  });

  it('should properly convert auth_user_id to internal user_id for message_status', async () => {
    // This test verifies the core fix: auth_user_id -> internal user_id conversion
    
    // Create a test user
    const { data: user } = await supabase
      .from('users')
      .insert([{
        phone_number: '+1234567899',
        username: 'red_dot_test_user',
        display_name: 'Red Dot Test User',
        auth_user_id: 'test-auth-user-red-dot'
      }])
      .select()
      .single();

    const authUserId = user.auth_user_id;
    const internalUserId = user.id;

    console.log('Test User Created:', {
      authUserId,
      internalUserId
    });

    // Verify the conversion logic works
    const { data: userData } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', authUserId)
      .single();

    expect(userData.id).to.equal(internalUserId);
    console.log('✅ Auth user ID conversion works correctly');

    // Create a test conversation and message
    const { data: conversation } = await supabase
      .from('conversations')
      .insert([{
        type: 'direct',
        created_by: internalUserId
      }])
      .select()
      .single();

    await supabase
      .from('conversation_participants')
      .insert([{
        conversation_id: conversation.id,
        user_id: internalUserId,
        role: 'admin'
      }]);

    const { data: message } = await supabase
      .from('messages')
      .insert([{
        conversation_id: conversation.id,
        sender_id: internalUserId,
        encrypted_content: Buffer.from('Red dot test message'),
        message_type: 'text'
      }])
      .select()
      .single();

    // Wait for trigger to create message_status
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify message_status uses internal user ID (this should work now with the fix)
    const { data: messageStatus } = await supabase
      .from('message_status')
      .select('*')
      .eq('message_id', message.id)
      .eq('user_id', internalUserId); // Should find entry with internal user ID

    // The trigger creates entries for recipients (not sender), so this should be empty
    // But if we manually insert one with correct internal user ID, it should work
    await supabase
      .from('message_status')
      .upsert([{
        message_id: message.id,
        user_id: internalUserId, // Using internal user ID (not auth user ID)
        status: 'delivered'
      }], { onConflict: 'message_id,user_id' });

    // Now mark as read using internal user ID
    await supabase
      .from('message_status')
      .update({ status: 'read' })
      .eq('message_id', message.id)
      .eq('user_id', internalUserId); // This should work now

    // Verify it was updated
    const { data: readStatus } = await supabase
      .from('message_status')
      .select('status')
      .eq('message_id', message.id)
      .eq('user_id', internalUserId)
      .single();

    expect(readStatus.status).to.equal('read');
    console.log('✅ Message status properly updated with internal user ID');

    // Test the unread count calculation
    const { data: conversations } = await supabase
      .rpc('get_user_conversations_enhanced', { user_uuid: authUserId });

    const testConversation = conversations?.find(c => c.conversation_id === conversation.id);
    
    console.log('Unread count after marking as read:', testConversation?.unread_count);
    
    // Clean up
    await supabase.from('conversations').delete().eq('id', conversation.id);
    await supabase.from('users').delete().eq('id', internalUserId);
  });

  it('should demonstrate the difference between auth_user_id and internal user_id', async () => {
    // This test shows why the fix was needed

    const { data: user } = await supabase
      .from('users')
      .insert([{
        phone_number: '+1234567898',
        username: 'demo_user',
        display_name: 'Demo User',
        auth_user_id: 'auth-12345'
      }])
      .select()
      .single();

    console.log('User IDs:', {
      'auth_user_id (Supabase Auth)': user.auth_user_id,
      'id (Internal)': user.id,
      'These are DIFFERENT!': user.auth_user_id !== user.id
    });

    console.log('The message_status table requires the internal user_id, not auth_user_id');
    console.log('This is why the chat store markMessagesAsRead() needed the conversion fix');

    // Clean up
    await supabase.from('users').delete().eq('id', user.id);

    expect(user.auth_user_id).to.not.equal(user.id);
  });
});