<script lang="ts">
  interface NavItem {
    label: string;
    href: string;
  }

  interface Props {
    brand: string;
    items?: NavItem[];
  }

  let { brand, items = [] }: Props = $props();
</script>

<nav class="nav">
  <div class="nav-inner">
    <a class="nav-brand" href="/">{brand}</a>

    {#if items.length > 0}
      <ul class="nav-links">
        {#each items as item}
          <li><a href={item.href}>{item.label}</a></li>
        {/each}
      </ul>
    {/if}
  </div>
</nav>

<style>
  .nav {
    background: var(--surface-glass, var(--surface-raised));
    border-bottom: 1px solid var(--border-subtle);
    padding: 0 var(--space-page-padding);
    position: sticky;
    top: 0;
    z-index: var(--z-sticky);
    backdrop-filter: var(--surface-glass-blur, blur(12px));
  }

  .nav-inner {
    max-width: 64rem;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 3.5rem;
  }

  .nav-brand {
    font-family: var(--font-display);
    font-size: var(--fs-md);
    font-weight: var(--fw-bold);
    color: var(--text-primary);
    text-decoration: none;
  }

  .nav-links {
    display: flex;
    gap: var(--sp-6);
    list-style: none;
  }

  .nav-links a {
    font-family: var(--font-sans);
    font-size: var(--fs-sm);
    font-weight: var(--fw-medium);
    color: var(--text-secondary);
    text-decoration: none;
    transition: color var(--dur-fast) var(--ease-default);
    padding: var(--sp-1) 0;
  }
  .nav-links a:hover {
    color: var(--text-primary);
  }
</style>
