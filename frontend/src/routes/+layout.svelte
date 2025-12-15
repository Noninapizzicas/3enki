<script>
  // Layout raíz - timer de rendimiento
  console.log('🚀 [Layout] Script executing...');
  console.time('⏱️ TOTAL page load');

  import { onMount } from 'svelte';

  onMount(() => {
    console.timeEnd('⏱️ TOTAL page load');
    console.log('🏁 [Layout] Page fully mounted');
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
