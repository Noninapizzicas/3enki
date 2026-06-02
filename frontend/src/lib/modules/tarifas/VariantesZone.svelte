<script lang="ts">
  /**
   * VariantesZone — zona avanzada de variantes con reglas. Q3=B: oculta por
   * defecto, visible solo si hay variantes registradas O el comerciante hace
   * click en el header. Acciones via prefillChatInput (Q4). Crear variante NO
   * es un form (D10) — pre-rellena el chat y el agente tarifas-creator la
   * materializa.
   */

  import { tarifasConfig, cartasDisponibles } from '$lib/stores/tarifas';
  import { prefillChatInput } from '$lib/stores/chatInputDraft';

  let expanded = false;

  $: hayVariantes =
    $tarifasConfig != null &&
    Array.isArray($tarifasConfig.variantes) &&
    $tarifasConfig.variantes.length > 0;
  $: shouldExpand = expanded || hayVariantes;

  function resincronizar(nombre: string) {
    prefillChatInput(`Re-sincroniza la variante "${nombre}" con su carta base.`);
  }

  function borrar(nombre: string) {
    prefillChatInput(`Borra la variante "${nombre}".`);
  }

  function nueva() {
    prefillChatInput('Crea una variante de la carta [escribe el nombre de la base] con esta regla: [describe la regla en lenguaje natural].');
  }
</script>

<section class="zona-variantes">
  <button class="header-colapsable" on:click={() => (expanded = !expanded)}>
    <span class="caret">{shouldExpand ? '▾' : '▸'}</span>
    <span class="titulo">Variantes con reglas (avanzado)</span>
  </button>

  {#if shouldExpand}
    {#if hayVariantes}
      <ul class="variantes-list">
        {#each $tarifasConfig.variantes as v}
          {@const carta = $cartasDisponibles.find((c) => c.id === v.carta_id)}
          {@const base = $cartasDisponibles.find((c) => c.id === v.base_carta_id)}
          {@const nombreVariante = v.nombre || carta?.nombre || v.carta_id}
          <li class="variante-row">
            <div class="variante-header">
              <span class="nombre">{nombreVariante}</span>
              <span class="base">← {base?.nombre || v.base_carta_id}</span>
            </div>
            <div class="reglas">
              Como se hizo: {typeof v.reglas === 'string' ? v.reglas : JSON.stringify(v.reglas)}
            </div>
            <div class="canales-asignados">
              Asignada a: {(v.canales || []).join(', ') || '(ninguno)'}
            </div>
            <div class="acciones">
              <button class="action-btn" on:click={() => resincronizar(nombreVariante)}>Re-sincronizar</button>
              <button class="action-btn danger" on:click={() => borrar(nombreVariante)}>Borrar</button>
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <div class="empty-variantes">
        <p>Sin variantes registradas.</p>
        <p class="hint">
          Las variantes son cartas derivadas de una base con una regla (por ejemplo: +15% en
          delivery). Crear una abre conversacion con el agente tarifas-creator.
        </p>
      </div>
    {/if}
    <button class="nueva-variante" on:click={nueva}>+ Nueva variante de una carta existente</button>
  {/if}
</section>

<style>
  .zona-variantes {
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
  .variantes-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .variante-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    background: var(--surface-soft, rgba(255, 255, 255, 0.03));
    border-radius: 6px;
  }
  .variante-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .nombre {
    font-weight: 600;
  }
  .base {
    font-size: 12px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
  }
  .reglas,
  .canales-asignados {
    font-size: 12px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
  }
  .acciones {
    display: flex;
    gap: 6px;
    margin-top: 2px;
  }
  .empty-variantes {
    padding: 8px 0;
  }
  .empty-variantes p {
    margin: 0 0 4px;
  }
  .hint {
    font-size: 12px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
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
  .action-btn.danger {
    background: rgba(239, 68, 68, 0.15);
    color: rgb(239, 68, 68);
  }
  .nueva-variante {
    margin-top: 4px;
    padding: 6px 10px;
    background: none;
    border: 1px dashed var(--border, rgba(255, 255, 255, 0.15));
    border-radius: 6px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    font-size: 12px;
    cursor: pointer;
    text-align: left;
  }
  .nueva-variante:hover {
    color: var(--text-primary, rgba(228, 228, 231, 1));
    border-color: var(--accent, rgb(129, 140, 248));
  }
</style>
