<!--
  @fileoverview Direct chat link page
  Redirects to the main chat page with the specific conversation selected
-->

<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  // Get the conversation ID from the URL parameter
  $: conversationId = $page.params.id;

  onMount(() => {
    // Redirect to the main chat page with the conversation ID as a query parameter
    // This allows the main chat page to automatically select and open this conversation
    if (conversationId) {
      goto(`/chat?conversation=${conversationId}`, { replaceState: true });
    } else {
      // If no conversation ID, just go to the main chat page
      goto('/chat', { replaceState: true });
    }
  });
</script>

<!-- Loading state while redirecting -->
<div class="flex items-center justify-center min-h-screen">
  <div class="text-center">
    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
    <p class="text-gray-600">Opening chat...</p>
  </div>
</div>