<script lang="ts">
  /**
   * TarifasPanel — panel del modulo tarifas. Postura B (UI solo lectura,
   * mutaciones via chat). A diferencia de RecetasPanel NO usa router con
   * activeView (decision D8): apila las 3 zonas canonizadas por
   * subsistema-carta D6 (general / por canal / variantes). El estado
   * colapsado/expandido es local de cada zona, no un activeView global.
   */

  import { onMount } from 'svelte';
  import CartaGeneralZone from './CartaGeneralZone.svelte';
  import CanalesZone from './CanalesZone.svelte';
  import VariantesZone from './VariantesZone.svelte';
  import {
    loadTarifasConfig,
    loadCartasDisponibles,
    initTarifasSubscriptions,
    tarifasLoading,
    tarifasError
  } from '$lib/stores/tarifas';

  export let panelId: string = '';

  let cleanupSubs: (() => void) | null = null;

  onMount(() => {
    loadTarifasConfig();
    loadCartasDisponibles();
    cleanupSubs = initTarifasSubscriptions();
    return () => {
      if (cleanupSubs) cleanupSubs();
    };
  });
</script>

<div class="panel-container">
  {#if $tarifasError}
    <div class="error-banner">{$tarifasError}</div>
  {/if}
  {#if $tarifasLoading}
    <div class="loading">Cargando tarifas…</div>
  {:else}
    <CartaGeneralZone />
    <CanalesZone />
    <VariantesZone />
  {/if}
</div>

<style>
  .panel-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;
    padding: 12px;
    font-size: 13px;
    color: var(--text-primary, rgba(228, 228, 231, 1));
    overflow-y: auto;
  }
  .error-banner {
    padding: 8px 12px;
    background: rgba(239, 68, 68, 0.15);
    color: rgb(239, 68, 68);
    border-radius: 6px;
    font-size: 12px;
  }
  .loading {
    padding: 12px;
    text-align: center;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    font-size: 12px;
  }
</style>
