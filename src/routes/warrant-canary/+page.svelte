<script>
  import { onMount } from 'svelte';
  let lastUpdated = 'September 24, 2025'; // Update this regularly
</script>

<svelte:head>
  <title>Warrant Canary - QryptChat</title>
  <meta name="description" content="QryptChat Warrant Canary" />
</svelte:head>

<section class="canary">
  <h1>Warrant Canary</h1>
  <p>
    This page serves as QryptChat's Warrant Canary. If this message is ever removed, altered,
    or not updated within the expected time frame, it may indicate that we have received a secret
    government order that we are legally forbidden from disclosing.
  </p>

  <p><strong>Last Updated:</strong> {lastUpdated}</p>

  <p>
    As of the date above, QryptChat has <strong>not</strong> received any National Security Letters,
    FISA orders, or other classified requests for user data.
  </p>

  <p>
    This document will be updated regularly. The absence of an update may be cause for concern.
  </p>
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