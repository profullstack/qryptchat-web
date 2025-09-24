<script>
  import { onMount } from 'svelte';
  import { t } from '$lib/stores/i18n';
  let lastUpdated = 'September 24, 2025'; // Update this regularly
</script>

<svelte:head>
  <title>{$t('warrantCanary.title')}</title>
  <meta name="description" content="{$t('warrantCanary.heading')}" />
</svelte:head>

<section class="canary">
  <h1>{$t('warrantCanary.heading')}</h1>
  <p>{$t('warrantCanary.intro')}</p>
  <p><strong>{$t('warrantCanary.lastUpdatedLabel')}</strong> {lastUpdated}</p>
  <p>{$t('warrantCanary.statement')}</p>
  <p>{$t('warrantCanary.regularUpdateNote')}</p>
</section>

<style>
  .canary {
    max-width: 800px;
    margin: 4rem auto;
    padding: 2rem;
    background: var(--color-bg-secondary, #1e293b);
    color: var(--color-text-primary, #f8fafc);
    border-radius: 0.5rem;
    line-height: 1.6;
  }
  h1 {
    font-size: 2rem;
    margin-bottom: 1rem;
  }
  p {
    margin: 1rem 0;
  }
  strong {
    color: var(--color-accent, #38bdf8);
  }
</style>