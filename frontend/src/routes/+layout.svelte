<script>
  import { onMount } from 'svelte';
  import { perfStart, perfEnd, logMsg } from '$lib/utils/perf';

  // Timer inicia cuando el script se ejecuta
  perfStart('Page.totalLoad');
  logMsg('🚀 Layout script executing');

  onMount(() => {
    perfEnd('Page.totalLoad');
    logMsg('🏁 Page fully mounted');
  });
</script>

<slot />

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    background: #0a0a0a;
    color: #fff;
  }
</style>
