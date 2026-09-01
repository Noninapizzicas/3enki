<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    subtitle?: string;
    align?: 'left' | 'center';
    actions?: Snippet;
  }

  let { title, subtitle, align = 'center', actions }: Props = $props();
</script>

<section class="hero hero-{align}">
  <div class="hero-content">
    <h1 class="hero-title">{title}</h1>
    {#if subtitle}
      <p class="hero-subtitle">{subtitle}</p>
    {/if}
    {#if actions}
      <div class="hero-actions">
        {@render actions()}
      </div>
    {/if}
  </div>
</section>

<style>
  .hero {
    padding: var(--space-hero-y, 6rem) var(--space-page-padding);
    background: var(--hero-bg, var(--surface-base));
  }

  .hero-content {
    max-width: 64rem;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
  }

  .hero-center .hero-content {
    align-items: var(--hero-align-items, center);
    text-align: var(--hero-text-align, center);
  }
  .hero-left .hero-content {
    align-items: var(--hero-align-items, flex-start);
    text-align: var(--hero-text-align, left);
  }

  .hero-title {
    font-family: var(--font-display);
    font-size: var(--fs-3xl);
    font-weight: var(--fw-heading, var(--fw-bold));
    line-height: var(--lh-tight);
    letter-spacing: -0.02em;
    color: var(--text-primary);
  }

  .hero-subtitle {
    font-family: var(--font-sans);
    font-size: var(--fs-lg);
    color: var(--text-secondary);
    line-height: var(--lh-relaxed);
    max-width: 42rem;
  }

  .hero-actions {
    display: flex;
    gap: var(--sp-4);
    flex-wrap: wrap;
    margin-top: var(--sp-2);
  }
</style>
