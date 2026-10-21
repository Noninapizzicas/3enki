<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title?: string;
    subtitle?: string;
    image?: string;
    children?: Snippet;
    footer?: Snippet;
  }

  let { title, subtitle, image, children, footer }: Props = $props();
</script>

<article class="card">
  {#if image}
    <div class="card-image">
      <img src={image} alt={title ?? ''} />
    </div>
  {/if}
  <div class="card-body">
    {#if title}
      <h3 class="card-title">{title}</h3>
    {/if}
    {#if subtitle}
      <p class="card-subtitle">{subtitle}</p>
    {/if}
    {#if children}
      <div class="card-content">
        {@render children()}
      </div>
    {/if}
  </div>
  {#if footer}
    <div class="card-footer">
      {@render footer()}
    </div>
  {/if}
</article>

<style>
  .card {
    background: var(--surface-raised);
    border: var(--border-card-width, 1px) solid var(--border-subtle);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    overflow: hidden;
    position: relative;
    transition: box-shadow var(--dur-normal) var(--ease-default),
                transform var(--dur-normal) var(--ease-default),
                border-color var(--dur-normal) var(--ease-default);
    rotate: var(--card-self-rotate, 0deg);
  }
  .card:nth-child(1) { --card-self-rotate: var(--card-rotate-1, 0deg); }
  .card:nth-child(2) { --card-self-rotate: var(--card-rotate-2, 0deg); }
  .card:nth-child(3) { --card-self-rotate: var(--card-rotate-3, 0deg); }
  .card::before {
    content: '';
    position: absolute;
    z-index: 1;
    background: var(--accent-bar-color, transparent);
    top: 0;
    left: 0;
    width: var(--accent-bar-width, 0px);
    height: var(--accent-bar-height, 0px);
  }
  .card:hover {
    box-shadow: var(--card-hover-shadow, var(--shadow-dropdown));
    transform: var(--card-hover-transform, translateY(-2px));
    border-color: var(--card-hover-border, var(--border-subtle));
  }

  .card-image {
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
  }
  .card-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform var(--dur-slow) var(--ease-default);
  }
  .card:hover .card-image img {
    transform: scale(1.03);
  }

  .card-body {
    padding: var(--space-card-padding);
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .card-title {
    font-family: var(--font-display);
    font-size: var(--fs-lg);
    font-weight: var(--fw-heading, var(--fw-semibold));
    line-height: var(--lh-tight);
    color: var(--text-primary);
  }

  .card-subtitle {
    font-size: var(--fs-sm);
    color: var(--text-secondary);
    line-height: var(--lh-normal);
  }

  .card-content {
    font-size: var(--fs-base);
    color: var(--text-secondary);
    line-height: var(--lh-normal);
  }

  .card-footer {
    padding: var(--sp-3) var(--space-card-padding);
    border-top: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }
</style>
