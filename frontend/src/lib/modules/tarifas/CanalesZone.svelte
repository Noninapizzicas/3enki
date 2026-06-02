<script lang="ts">
  /**
   * CanalesZone — override por canal. Colapsada por defecto; auto-expandida si
   * hay algun override. Enum cerrado de 6 canales (D4). Acciones via
   * prefillChatInput (Q4).
   */

  import { tarifasConfig, cartasDisponibles, CANALES_CANONICOS } from '$lib/stores/tarifas';
  import { prefillChatInput } from '$lib/stores/chatInputDraft';

  let expanded = false;

  $: hayOverrides =
    $tarifasConfig != null &&
    CANALES_CANONICOS.some((c) => $tarifasConfig!.canales[c] !== null);
  $: shouldExpand = expanded || hayOverrides;

  function cambiarAsignacion(canal: string) {
    prefillChatInput(`Asigna la carta [escribe el nombre] al canal ${canal}.`);
  }

  function quitarOverride(canal: string) {
    prefillChatInput(`Quita la asignacion especifica del canal ${canal}. Que vuelva a usar la carta general.`);
  }
</script>

<section class="zona-canales">
  <button class="header-colapsable" on:click={() => (expanded = !expanded)}>
    <span class="caret">{shouldExpand ? '▾' : '▸'}</span>
    <span class="titulo">Personalizar por canal</span>
    {#if !shouldExpand}
      <span class="resumen">(todos usan la general)</span>
    {/if}
  </button>

  {#if shouldExpand}
    <ul class="canales-grid">
      {#each CANALES_CANONICOS as canal}
        {@const overrideId = $tarifasConfig?.canales[canal] ?? null}
        {@const cartaOverride = overrideId ? $cartasDisponibles.find((c) => c.id === overrideId) : null}
        <li class="canal-row">
          <span class="nombre-canal">{canal}</span>
          {#if cartaOverride}
            <span class="asignacion">{cartaOverride.nombre}</span>
            <button class="action-btn" on:click={() => cambiarAsignacion(canal)}>Cambiar</button>
            <button class="action-btn" on:click={() => quitarOverride(canal)}>Quitar</button>
          {:else if overrideId}
            <span class="asignacion warn">(carta_id desconocido: {overrideId})</span>
            <button class="action-btn" on:click={() => quitarOverride(canal)}>Quitar</button>
          {:else}
            <span class="asignacion muted">usa general</span>
            <button class="action-btn" on:click={() => cambiarAsignacion(canal)}>Asignar</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .zona-canales {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .header-colapsable {
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    padding: 4px 0;
    cursor: pointer;
    color: var(--text-primary, rgba(228, 228, 231, 1));
    font-size: 14px;
    font-weight: 600;
    text-align: left;
  }
  .caret {
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    font-size: 12px;
  }
  .resumen {
    font-weight: 400;
    font-size: 12px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
  }
  .canales-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .canal-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    flex-wrap: wrap;
  }
  .nombre-canal {
    min-width: 80px;
    text-transform: capitalize;
    font-weight: 500;
  }
  .asignacion {
    flex: 1;
    color: var(--text-primary, rgba(228, 228, 231, 1));
  }
  .asignacion.muted {
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    font-style: italic;
  }
  .asignacion.warn {
    color: rgb(234, 179, 8);
  }
  .action-btn {
    padding: 3px 8px;
    background: var(--accent-soft, rgba(99, 102, 241, 0.15));
    color: var(--accent, rgb(129, 140, 248));
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  }
  .action-btn:hover {
    background: var(--accent-soft-hover, rgba(99, 102, 241, 0.25));
  }
</style>
