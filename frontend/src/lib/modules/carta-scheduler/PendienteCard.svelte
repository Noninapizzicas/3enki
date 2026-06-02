<script lang="ts">
  /**
   * Card de un cambio pendiente. Botones confirmar/rechazar pre-rellenan chat
   * (Postura B, frases Q4). Render defensivo de campos opcionales.
   */
  import { prefillChatInput } from '$lib/stores/chatInputDraft';
  import type { Pendiente } from '$lib/stores/carta-scheduler';

  export let pendiente: Pendiente;

  function confirmar() {
    prefillChatInput(
      'Confirma el cambio pendiente ' +
        pendiente.id +
        ' (aplicar carta ' +
        pendiente.carta_id_destino +
        ' al canal ' +
        pendiente.canal +
        ').'
    );
  }

  function rechazar() {
    prefillChatInput(
      'Rechaza el cambio pendiente ' + pendiente.id + '. Motivo: [explica].'
    );
  }
</script>

<li class="pendiente-card">
  <div class="pendiente-header">
    <span class="canal-badge">📡 {pendiente.canal}</span>
    {#if pendiente.fecha_objetivo}
      <span class="ts-objetivo">⏰ {pendiente.fecha_objetivo}</span>
    {/if}
    {#if pendiente.estado}
      <span class="estado-badge">{pendiente.estado}</span>
    {/if}
  </div>

  <div class="cambio">
    {#if pendiente.carta_id_anterior}
      <span class="anterior">{pendiente.carta_id_anterior}</span> →
    {/if}
    <strong class="destino">{pendiente.carta_id_destino}</strong>
  </div>

  {#if pendiente.motivo}
    <div class="motivo">{pendiente.motivo}</div>
  {/if}

  <div class="acciones">
    <button class="confirmar" on:click={confirmar}>✓ Confirmar</button>
    <button class="rechazar" on:click={rechazar}>✗ Rechazar</button>
  </div>
</li>

<style>
  .pendiente-card {
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    border-radius: 8px;
    padding: 0.6rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    background: var(--surface-soft, rgba(255, 255, 255, 0.03));
  }
  .pendiente-header {
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
  .ts-objetivo {
    color: var(--text-secondary, rgba(161, 161, 170, 1));
  }
  .estado-badge {
    background: var(--accent-soft, rgba(99, 102, 241, 0.15));
    color: var(--accent, rgb(129, 140, 248));
    border-radius: 4px;
    padding: 0.05rem 0.4rem;
    font-size: 0.72rem;
  }
  .cambio {
    font-size: 0.9rem;
  }
  .cambio .anterior {
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    text-decoration: line-through;
  }
  .cambio .destino {
    color: var(--text-primary, rgba(228, 228, 231, 1));
  }
  .motivo {
    font-size: 0.82rem;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
  }
  .acciones {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.2rem;
  }
  .acciones button {
    border: none;
    border-radius: 6px;
    padding: 0.35rem 0.7rem;
    cursor: pointer;
    font-size: 0.8rem;
  }
  .acciones .confirmar {
    background: rgba(34, 197, 94, 0.18);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.4);
  }
  .acciones .rechazar {
    background: none;
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #ef4444;
  }
</style>
