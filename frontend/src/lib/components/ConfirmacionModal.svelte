<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { pendingConfirmation, confirming, confirmPending, rejectPending, setupConfirmations } from '$lib/stores/confirmaciones';

  let unsub: (() => void) | undefined;

  onMount(() => {
    // Escuchar el evento del bus: cada 409 → ventana emergente.
    unsub = setupConfirmations();
  });

  onDestroy(() => {
    if (unsub) unsub();
  });

  function descripcionTool(p: { tool: string; description: string }) {
    return p.description || p.tool;
  }
</script>

{#if $pendingConfirmation}
  <div class="overlay" role="dialog" aria-modal="true">
    <div class="modal">
      <div class="icono">⚠️</div>
      <h2 class="titulo">Confirmar acción</h2>
      <p class="pregunta">{descripcionTool($pendingConfirmation)}</p>
      <div class="detalle">
        <code>{$pendingConfirmation.tool}</code>
        {#if $pendingConfirmation.project_id}
          <span class="proyecto">proyecto: {$pendingConfirmation.project_id.slice(0, 8)}…</span>
        {/if}
      </div>
      <div class="botones">
        <button class="btn no" on:click={rejectPending} disabled={$confirming}>No</button>
        <button class="btn si" on:click={confirmPending} disabled={$confirming}>
          {#if $confirming}Confirmando…{:else}Sí{/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    backdrop-filter: blur(2px);
  }
  .modal {
    background: #16161a;
    border: 1px solid #2a2a30;
    border-radius: 14px;
    padding: 28px 32px;
    max-width: 420px;
    width: 90%;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    text-align: center;
  }
  .icono { font-size: 34px; margin-bottom: 8px; }
  .titulo { font-size: 18px; margin: 0 0 12px; color: #fff; }
  .pregunta { font-size: 14px; color: #ccc; margin: 0 0 14px; line-height: 1.4; word-break: break-word; }
  .detalle { display: flex; flex-direction: column; gap: 4px; align-items: center; margin-bottom: 20px; }
  .detalle code {
    background: #222228; padding: 6px 12px; border-radius: 8px;
    font-size: 13px; color: #9be7a0;
  }
  .proyecto { font-size: 12px; color: #888; }
  .botones { display: flex; gap: 12px; justify-content: center; }
  .btn {
    padding: 10px 26px; border-radius: 9px; font-size: 14px; font-weight: 600;
    border: none; cursor: pointer; transition: transform 0.08s, opacity 0.15s;
  }
  .btn:active { transform: scale(0.97); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn.no { background: #2a2a30; color: #fff; }
  .btn.si { background: #4a90e2; color: #fff; }
</style>
