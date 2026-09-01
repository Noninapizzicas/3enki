<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'primary' | 'secondary' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    href?: string;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  }

  let { variant = 'primary', size = 'md', href, onclick, children }: Props = $props();
</script>

{#if href}
  <a class="btn btn-{variant} btn-{size}" {href}>
    {@render children()}
  </a>
{:else}
  <button class="btn btn-{variant} btn-{size}" {onclick}>
    {@render children()}
  </button>
{/if}

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    font-family: var(--font-sans);
    font-weight: var(--fw-semibold);
    line-height: 1;
    border: 1px solid transparent;
    cursor: pointer;
    transition: all var(--dur-fast) var(--ease-default);
    text-decoration: none;
  }

  .btn-sm {
    font-size: var(--fs-xs);
    padding: var(--sp-1\.5) var(--sp-3);
    border-radius: var(--radius-button);
  }
  .btn-md {
    font-size: var(--fs-sm);
    padding: var(--sp-2) var(--sp-5);
    border-radius: var(--radius-button);
  }
  .btn-lg {
    font-size: var(--fs-base);
    padding: var(--sp-3) var(--sp-8);
    border-radius: var(--radius-button);
  }

  .btn-primary {
    background: var(--action-primary);
    color: var(--text-on-primary);
  }
  .btn-primary:hover {
    background: var(--action-primary-hover);
    box-shadow: var(--shadow-card);
  }
  .btn-primary:active {
    background: var(--action-primary-active);
  }

  .btn-secondary {
    background: var(--action-secondary);
    color: var(--text-primary);
    border-color: var(--border-default);
  }
  .btn-secondary:hover {
    background: var(--action-secondary-hover);
  }

  .btn-ghost {
    background: transparent;
    color: var(--text-link);
  }
  .btn-ghost:hover {
    background: var(--surface-interactive);
    color: var(--text-link-hover);
  }
</style>
