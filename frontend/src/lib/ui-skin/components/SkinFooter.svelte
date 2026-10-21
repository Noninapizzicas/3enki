<script lang="ts">
  interface Props {
    brand: string;
    tagline?: string;
  }

  let { brand, tagline }: Props = $props();
</script>

<footer class="footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <span class="footer-name">{brand}</span>
      {#if tagline}
        <span class="footer-tagline">{tagline}</span>
      {/if}
    </div>
    <span class="footer-copy">&copy; {new Date().getFullYear()} {brand}</span>
  </div>
</footer>

<style>
  .footer {
    background: var(--surface-sunken);
    border-top: 1px solid var(--border-subtle);
    padding: var(--sp-10) var(--space-page-padding);
  }

  .footer-inner {
    max-width: 64rem;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--sp-4);
  }

  .footer-brand {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .footer-name {
    font-family: var(--font-display);
    font-size: var(--fs-md);
    font-weight: var(--fw-bold);
    color: var(--text-primary);
  }

  .footer-tagline {
    font-size: var(--fs-sm);
    color: var(--text-tertiary);
  }

  .footer-copy {
    font-size: var(--fs-xs);
    color: var(--text-tertiary);
  }
</style>
