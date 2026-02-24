<script lang="ts">
  /**
   * NfcCardModal — Muestra el payload generado para escribir en una NTAG215
   *
   * No hay Web NFC API integrada (requiere Chrome Android + HTTPS).
   * La UI muestra el JSON y el usuario lo copia a NFC Tools o similar.
   */
  import type { NfcCardPayload } from '$lib/stores/staff';

  export let employeeName: string = '';
  export let payload: NfcCardPayload;
  export let jsonString: string;
  export let byteSize: number;
  export let onClose: () => void;

  const CAPACITY = 504;
  const fillPct  = Math.min(100, Math.round((byteSize / CAPACITY) * 100));

  let copied = false;

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(jsonString);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      // fallback para entornos sin clipboard API
      const el = document.createElement('textarea');
      el.value = jsonString;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    }
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="backdrop" on:click={handleBackdrop}>
  <div class="modal">
    <!-- Header -->
    <div class="modal-header">
      <div>
        <span class="chip">NFC</span>
        <span class="title">Tarjeta — {employeeName}</span>
      </div>
      <button class="close-btn" on:click={onClose} aria-label="Cerrar">✕</button>
    </div>

    <!-- Payload JSON -->
    <div class="payload-block">
      <pre>{jsonString}</pre>
    </div>

    <!-- Barra de capacidad -->
    <div class="capacity">
      <div class="cap-bar">
        <div class="cap-fill" style="width: {fillPct}%"></div>
      </div>
      <span class="cap-label">{byteSize} / {CAPACITY} bytes (NTAG215)</span>
    </div>

    <!-- Instrucciones -->
    <div class="instructions">
      <p class="instr-title">Cómo escribir el tag:</p>
      <ol>
        <li>Abre <strong>NFC Tools</strong> (iOS / Android)</li>
        <li>Write → Add a record → Text</li>
        <li>Pega el JSON de arriba y escribe el tag</li>
      </ol>
      <p class="alt">Alternativa: <strong>Web NFC API</strong> (Chrome Android ≥ 89, necesita HTTPS)</p>
    </div>

    <!-- Acción -->
    <button class="copy-btn" on:click={copyJson}>
      {#if copied}
        ✓ Copiado
      {:else}
        📋 Copiar JSON
      {/if}
    </button>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }

  .modal {
    background: #141414;
    border: 1px solid #2a2a2a;
    border-radius: 12px;
    padding: 1.5rem;
    width: 100%;
    max-width: 480px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .modal-header div {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .chip {
    background: #1d4ed8;
    color: #fff;
    font-size: 0.65rem;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 4px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .title {
    font-size: 0.95rem;
    font-weight: 600;
    color: #e5e7eb;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #6b7280;
    font-size: 1.1rem;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
    transition: color 0.15s;
  }
  .close-btn:hover { color: #fff; }

  .payload-block {
    background: #0d0d0d;
    border: 1px solid #222;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    overflow-x: auto;
  }

  pre {
    margin: 0;
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    font-size: 0.72rem;
    color: #a3e635;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .capacity {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .cap-bar {
    height: 6px;
    background: #222;
    border-radius: 999px;
    overflow: hidden;
  }

  .cap-fill {
    height: 100%;
    background: #1d4ed8;
    border-radius: 999px;
    transition: width 0.3s;
  }

  .cap-label {
    font-size: 0.7rem;
    color: #6b7280;
  }

  .instructions {
    background: #111;
    border: 1px solid #1f1f1f;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    font-size: 0.8rem;
    color: #9ca3af;
    line-height: 1.6;
  }

  .instr-title {
    font-weight: 600;
    color: #d1d5db;
    margin-bottom: 0.25rem;
  }

  ol {
    padding-left: 1.25rem;
    margin: 0.25rem 0;
  }

  li { margin-bottom: 2px; }

  strong { color: #e5e7eb; }

  .alt {
    margin-top: 0.5rem;
    font-size: 0.72rem;
    color: #6b7280;
  }

  .copy-btn {
    background: #1d4ed8;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 0.6rem 1rem;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
    align-self: stretch;
  }
  .copy-btn:hover { background: #2563eb; }
</style>
