<script>
	let webhooks = $state([]);
	let url = $state('');
	let events = $state('message.created');
	let loading = $state(false);
	let error = $state('');

	const EVENT_OPTIONS = [
		'message.created',
		'conversation.created',
		'message.deleted'
	];

	async function loadWebhooks() {
		const res = await fetch('/api/webhooks');
		if (res.ok) {
			const data = await res.json();
			webhooks = data.webhooks;
		}
	}

	async function addWebhook() {
		error = '';
		if (!url) return;

		loading = true;
		try {
			const res = await fetch('/api/webhooks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url, events: events.split(',').map((e) => e.trim()) })
			});
			const data = await res.json();
			if (!res.ok) {
				error = data.error;
			} else {
				webhooks = [data.webhook, ...webhooks];
				url = '';
			}
		} finally {
			loading = false;
		}
	}

	async function removeWebhook(id) {
		const res = await fetch(`/api/webhooks/${id}`, { method: 'DELETE' });
		if (res.ok) {
			webhooks = webhooks.filter((w) => w.id !== id);
		}
	}

	$effect(() => {
		loadWebhooks();
	});
</script>

<div class="space-y-4">
	<h3 class="text-lg font-semibold">Webhooks</h3>
	<p class="text-sm text-gray-500">Receive HTTP POST notifications when events occur.</p>

	<form onsubmit={(e) => { e.preventDefault(); addWebhook(); }} class="flex flex-col gap-2">
		<input
			type="url"
			bind:value={url}
			placeholder="https://example.com/webhook"
			required
			class="rounded border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
		/>
		<select bind:value={events} class="rounded border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700">
			{#each EVENT_OPTIONS as opt}
				<option value={opt}>{opt}</option>
			{/each}
		</select>
		{#if error}
			<p class="text-red-500 text-sm">{error}</p>
		{/if}
		<button
			type="submit"
			disabled={loading}
			class="self-start rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
		>
			{loading ? 'Adding...' : 'Add Webhook'}
		</button>
	</form>

	{#if webhooks.length > 0}
		<ul class="divide-y dark:divide-gray-700">
			{#each webhooks as hook (hook.id)}
				<li class="flex items-center justify-between py-2">
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-mono">{hook.url}</p>
						<p class="text-xs text-gray-500">{hook.events.join(', ')}</p>
					</div>
					<button
						onclick={() => removeWebhook(hook.id)}
						class="ml-4 text-sm text-red-500 hover:text-red-700"
					>
						Remove
					</button>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-sm text-gray-400">No webhooks configured.</p>
	{/if}
</div>
