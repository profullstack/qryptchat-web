<script>
	import { createEventDispatcher } from 'svelte';

	// Props
	let { 
		group, 
		expanded = false 
	} = $props();

	const dispatch = createEventDispatcher();

	// Handle toggle
	function handleToggle() {
		dispatch('toggle');
	}

	// Format member count
	function formatMemberCount(count) {
		if (count === 1) return '1 member';
		return `${count} members`;
	}

	// Format room count
	function formatRoomCount(count) {
		if (count === 1) return '1 room';
		return `${count} rooms`;
	}
</script>

<button
	class="group-item"
	class:expanded
	onclick={handleToggle}
>
	<div class="group-avatar">
		{#if group.group_avatar_url}
			<img src={group.group_avatar_url} alt={group.group_name} />
		{:else}
			<div class="avatar-placeholder">
				{(group.group_name || 'G').charAt(0).toUpperCase()}
			</div>
		{/if}
	</div>

	<div class="group-content">
		<div class="group-header">
			<div class="group-name">
				{group.group_name || 'Unknown Group'}
			</div>
			
			<div class="expand-icon" class:rotated={expanded}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
					<path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
				</svg>
			</div>
		</div>

		<div class="group-info">
			<span class="room-count">{formatRoomCount(group.room_count)}</span>
			<span class="separator">•</span>
			<span class="member-count">{formatMemberCount(group.member_count)}</span>
			
			{#if group.user_role === 'owner'}
				<span class="role-badge owner">Owner</span>
			{:else if group.user_role === 'admin'}
				<span class="role-badge admin">Admin</span>
			{:else if group.user_role === 'moderator'}
				<span class="role-badge moderator">Mod</span>
			{/if}
		</div>
	</div>
</button>

<style>
	.group-item {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		transition: background-color 0.2s ease;
		border-radius: 0;
	}

	.group-item:hover {
		background: var(--color-surface-hover);
	}

	.group-item.expanded {
		background: var(--color-primary-50);
	}

	.group-avatar {
		width: 40px;
		height: 40px;
		border-radius: 0.5rem;
		overflow: hidden;
		flex-shrink: 0;
	}

	.group-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.avatar-placeholder {
		width: 100%;
		height: 100%;
		background: var(--color-primary-500);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		font-size: 1.125rem;
	}

	.group-content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.group-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.group-name {
		font-weight: 600;
		color: var(--color-text-primary);
		font-size: 0.875rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.expand-icon {
		color: var(--color-text-secondary);
		transition: transform 0.2s ease;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.expand-icon.rotated {
		transform: rotate(180deg);
	}

	.group-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.separator {
		color: var(--color-text-secondary);
		opacity: 0.5;
	}

	.role-badge {
		font-size: 0.625rem;
		font-weight: 600;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}

	.role-badge.owner {
		background: var(--color-yellow-100);
		color: var(--color-yellow-800);
	}

	.role-badge.admin {
		background: var(--color-red-100);
		color: var(--color-red-800);
	}

	.role-badge.moderator {
		background: var(--color-blue-100);
		color: var(--color-blue-800);
	}

	/* Expanded state adjustments */
	.group-item.expanded .group-name {
		color: var(--color-primary-700);
	}

	.group-item.expanded .expand-icon {
		color: var(--color-primary-600);
	}

	/* Dark mode support */
	@media (prefers-color-scheme: dark) {
		.group-item.expanded {
			background: var(--color-primary-900);
		}

		.group-item.expanded .group-name {
			color: var(--color-primary-300);
		}

		.group-item.expanded .expand-icon {
			color: var(--color-primary-400);
		}

		.role-badge.owner {
			background: var(--color-yellow-900);
			color: var(--color-yellow-200);
		}

		.role-badge.admin {
			background: var(--color-red-900);
			color: var(--color-red-200);
		}

		.role-badge.moderator {
			background: var(--color-blue-900);
			color: var(--color-blue-200);
		}
	}
</style>