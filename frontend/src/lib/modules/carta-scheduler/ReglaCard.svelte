<script lang="ts">
  /**
   * Card de una regla. Boton eliminar pre-rellena chat con id+canal+carta (Postura B).
   * Render defensivo: solo muestra los campos opcionales presentes.
   */
  import { prefillChatInput } from '$lib/stores/chatInputDraft';
  import type { Regla } from '$lib/stores/carta-scheduler';

  export let regla: Regla;

  function eliminar() {
    prefillChatInput(
      'Elimina la regla de programacion ' +
        regla.id +
        ' (canal=' +
        regla.canal +
        ', carta=' +
        regla.carta_id_destino +
        ').'
    );
  }
</script>

<li class="regla-card">
  <div class="regla-header">
    <span class="canal-badge">📡 {regla.canal}</span>
    <span class="cron">⏰ {regla.cron_expression}</span>
    {#if regla.prioridad !== undefined}
      <span class="prioridad">prio: {regla.prioridad}</span>
    {/if}
  </div>

  <div class="carta-destino"><strong>Carta:</strong> {regla.carta_id_destino}</div>

  {#if regla.descripcion}
    <div class="descripcion">{regla.descripcion}</div>
  {/if}

  {#if regla.etiquetas?.length}
    <div class="etiquetas">
      {#each regla.etiquetas as et}
        <span class="etiqueta">{et}</span>
      {/each}
    </div>
  {/if}

  <div class="regla-meta">
    <span class="id">{regla.id}</span>
    {#if regla.created_at}
      <span class="ts">creada: {regla.created_at}</span>
    {/if}
    <button class="eliminar" on:click={eliminar}>🗑 Eliminar</button>
  </div>
</li>

<style>
  .regla-card {
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    border-radius: 8px;
    padding: 0.6rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    background: var(--surface-soft, rgba(255, 255, 255, 0.03));
  }
  .regla-header {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
    font-size: 0.82rem;
  }
  .canal-badge {
    font-weight: 600;
    color: var(--text-primary, rgba(228, 228, 231, 1));
  }
  .cron {
    color: var(--text-secondary, rgba(161, 161, 170, 1));
  }
  .prioridad {
    background: var(--accent-soft, rgba(99, 102, 241, 0.15));
    color: var(--accent, rgb(129, 140, 248));
    border-radius: 4px;
    padding: 0.05rem 0.4rem;
    font-size: 0.72rem;
  }
  .carta-destino {
    font-size: 0.88rem;
    color: var(--text-primary, rgba(228, 228, 231, 1));
  }
  .descripcion {
    font-size: 0.82rem;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
  }
  .etiquetas {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
  }
  .etiqueta {
    background: var(--surface-soft, rgba(255, 255, 255, 0.06));
    border-radius: 4px;
    padding: 0.05rem 0.4rem;
    font-size: 0.72rem;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
  }
  .regla-meta {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
    font-size: 0.72rem;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    margin-top: 0.2rem;
  }
  .regla-meta .eliminar {
    margin-left: auto;
    background: none;
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #ef4444;
    border-radius: 6px;
    padding: 0.25rem 0.55rem;
    cursor: pointer;
    font-size: 0.75rem;
  }
</style>
