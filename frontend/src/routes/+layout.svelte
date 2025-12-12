<script>
  // Layout raíz - sin estilos globales para mantener simplicidad
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
