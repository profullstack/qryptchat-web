<script>
  import { onMount } from 'svelte';
  
  let plugins = [];
  let loading = true;
  let error = null;

  onMount(async () => {
    try {
      const response = await fetch('/api/plugins');
      if (response.ok) {
        plugins = await response.json();
      } else {
        error = 'Failed to load plugins';
      }
    } catch (err) {
      error = 'Error loading plugins: ' + err.message;
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Community Plugins - QryptChat</title>
  <meta name="description" content="Browse and manage community plugins for QryptChat" />
</svelte:head>

<div class="container mx-auto px-4 py-8">
  <div class="max-w-4xl mx-auto">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-6">
      Community Plugins
    </h1>
    
    <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
      <h2 class="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
        How to use plugins
      </h2>
      <p class="text-blue-800 dark:text-blue-200 mb-2">
        Plugins extend QryptChat with additional functionality. To use a plugin:
      </p>
      <ol class="list-decimal list-inside text-blue-800 dark:text-blue-200 space-y-1">
        <li>Type <code class="bg-blue-100 dark:bg-blue-800 px-1 rounded">/help</code> in any chat to see available commands</li>
        <li>Use plugin commands like <code class="bg-blue-100 dark:bg-blue-800 px-1 rounded">/echo Hello!</code></li>
        <li>Each plugin has its own set of commands and features</li>
      </ol>
    </div>

    {#if loading}
      <div class="flex justify-center items-center py-12">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span class="ml-2 text-gray-600 dark:text-gray-400">Loading plugins...</span>
      </div>
    {:else if error}
      <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p class="text-red-800 dark:text-red-200">{error}</p>
      </div>
    {:else if plugins.length === 0}
      <div class="text-center py-12">
        <p class="text-gray-600 dark:text-gray-400">No plugins available yet.</p>
      </div>
    {:else}
      <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {#each plugins as plugin}
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
            <div class="flex items-start justify-between mb-4">
              <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
                {plugin.name}
              </h3>
              <span class="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                v{plugin.version}
              </span>
            </div>
            
            <p class="text-gray-600 dark:text-gray-300 mb-4">
              {plugin.description}
            </p>
            
            <div class="mb-4">
              <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-2">
                Available Commands:
              </h4>
              <div class="space-y-1">
                {#each plugin.commands as command}
                  <div class="flex items-center justify-between text-sm">
                    <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-blue-600 dark:text-blue-400">
                      {command.command}
                    </code>
                    <span class="text-gray-500 dark:text-gray-400 text-xs ml-2">
                      {command.description}
                    </span>
                  </div>
                {/each}
              </div>
            </div>
            
            <div class="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
              <span>by {plugin.author}</span>
              <span class="bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200 px-2 py-1 rounded text-xs">
                Active
              </span>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  code {
    font-family: 'Courier New', monospace;
  }
</style>