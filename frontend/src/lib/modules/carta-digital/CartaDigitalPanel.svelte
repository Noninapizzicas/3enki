<script lang="ts">
  /**
   * CartaDigitalPanel - 3 zonas apiladas (sin router, D5).
   *   Identidad (branding + contacto) / Opciones (visualizacion) / Carta compuesta.
   */
  import { onMount, onDestroy } from 'svelte';
  import IdentidadZone from './IdentidadZone.svelte';
  import OpcionesZone from './OpcionesZone.svelte';
  import CartaCompuestaZone from './CartaCompuestaZone.svelte';
  import {
    loadCartaPublica,
    loadCartaDigitalConfig,
    initCartaDigitalSubscriptions,
    cartaDigitalLoading,
    cartaDigitalError
  } from '$lib/stores/carta-digital';

  let cleanupSubs: (() => void) | null = null;

  onMount(() => {
    loadCartaPublica();
    loadCartaDigitalConfig();
    cleanupSubs = initCartaDigitalSubscriptions();
  });
  onDestroy(() => {
    if (cleanupSubs) cleanupSubs();
  });
</script>

<div class="carta-digital-panel">
  {#if $cartaDigitalError}
    <div class="error-banner">{$cartaDigitalError}</div>
  {/if}
  {#if $cartaDigitalLoading}
    <div class="loading">Cargando carta digital…</div>
  {:else}
    <IdentidadZone />
    <OpcionesZone />
    <CartaCompuestaZone />
  {/if}
</div>

<style>
  .carta-digital-panel {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1rem;
  }
  .error-banner {
    background: rgba(239, 68, 68, 0.1);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
    padding: 0.75rem 1rem;
    font-size: 0.85rem;
  }
  .loading {
    color: var(--color-text-muted, #888);
    padding: 1rem;
    font-size: 0.85rem;
  }
</style>
