// Expiry Sweeper Edge Function
// Runs every minute to tombstone expired deliveries and optionally garbage-collect messages
// Uses Supabase service role for database operations

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

/**
 * Tombstone expired deliveries
 * @param {number} limit - Maximum number of deliveries to process in one batch
 * @returns {Promise<Array>} Array of tombstoned delivery records
 */
async function tombstoneExpiredDeliveries(limit = 1000) {
  const now = new Date().toISOString();
  
  // Find expired deliveries
  const { data: expiredDeliveries, error: selectError } = await supabase
    .from("deliveries")
    .select("message_id, recipient_user_id")
    .lte("expires_at", now)
    .is("deleted_ts", null)
    .limit(limit);

  if (selectError) {
    console.error("Error finding expired deliveries:", selectError);
    throw selectError;
  }

  if (!expiredDeliveries?.length) {
    return [];
  }

  console.log(`Found ${expiredDeliveries.length} expired deliveries to tombstone`);

  // Tombstone expired deliveries in batch
  const tombstonePromises = expiredDeliveries.map(async (delivery) => {
    const { error } = await supabase
      .from("deliveries")
      .update({
        deleted_ts: now,
        deletion_reason: "expired"
      })
      .eq("message_id", delivery.message_id)
      .eq("recipient_user_id", delivery.recipient_user_id);

    if (error) {
      console.error(`Error tombstoning delivery ${delivery.message_id}:${delivery.recipient_user_id}:`, error);
      return null;
    }

    return delivery;
  });

  const results = await Promise.allSettled(tombstonePromises);
  const successful = results
    .filter(result => result.status === 'fulfilled' && result.value !== null)
    .map(result => result.value);

  console.log(`Successfully tombstoned ${successful.length} deliveries`);
  return successful;
}

/**
 * Garbage collect messages with no active deliveries
 * @param {number} limit - Maximum number of messages to process
 * @returns {Promise<Array>} Array of garbage collected message IDs
 */
async function garbageCollectMessages(limit = 100) {
  // Get messages ready for garbage collection
  const { data: gcCandidates, error: gcError } = await supabase
    .rpc("fn_messages_ready_for_gc")
    .limit(limit);

  if (gcError) {
    console.error("Error finding messages for GC:", gcError);
    throw gcError;
  }

  if (!gcCandidates?.length) {
    return [];
  }

  console.log(`Found ${gcCandidates.length} messages ready for garbage collection`);

  // Delete message ciphertext (keep audit trail by only clearing encrypted_content)
  const { data: deletedMessages, error: deleteError } = await supabase
    .from("messages")
    .update({
      encrypted_content: new Uint8Array(0), // Clear encrypted content
      content_type: "deleted",
      has_attachments: false
    })
    .in("id", gcCandidates)
    .select("id");

  if (deleteError) {
    console.error("Error garbage collecting messages:", deleteError);
    throw deleteError;
  }

  console.log(`Garbage collected ${deletedMessages?.length || 0} messages`);
  return deletedMessages?.map(m => m.id) || [];
}

/**
 * Main expiry sweeper function
 */
async function runExpirySweeper() {
  const startTime = Date.now();
  
  try {
    // Step 1: Tombstone expired deliveries
    const tombstonedDeliveries = await tombstoneExpiredDeliveries();
    
    // Step 2: Garbage collect messages (optional, can be disabled for audit requirements)
    const garbageCollectedMessages = await garbageCollectMessages();
    
    const duration = Date.now() - startTime;
    
    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      tombstoned_deliveries: tombstonedDeliveries.length,
      garbage_collected_messages: garbageCollectedMessages.length,
      details: {
        tombstoned: tombstonedDeliveries,
        garbage_collected: garbageCollectedMessages
      }
    };
    
    console.log("Expiry sweep completed:", result);
    return result;
    
  } catch (error) {
    console.error("Expiry sweep failed:", error);
    
    return {
      success: false,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      error: error.message,
      tombstoned_deliveries: 0,
      garbage_collected_messages: 0
    };
  }
}

// Serve the Edge Function
serve(async (req: Request) => {
  // Only allow POST requests (for security)
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }), 
      { 
        status: 405,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  // Optional: Add basic auth check for manual triggers
  const authHeader = req.headers.get("authorization");
  const expectedAuth = Deno.env.get("EXPIRY_FUNCTION_AUTH");
  
  if (expectedAuth && authHeader !== `Bearer ${expectedAuth}`) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }), 
      { 
        status: 401,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  // Run the expiry sweeper
  const result = await runExpirySweeper();
  
  return new Response(
    JSON.stringify(result), 
    {
      status: result.success ? 200 : 500,
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "no-cache"
      }
    }
  );
});