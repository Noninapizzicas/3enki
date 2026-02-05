<script lang="ts">
  /**
   * Pdf2ImgPanel - Convierte una pagina de PDF a imagen PNG
   *
   * Usa el provider local.pdfjs.render para renderizar una pagina
   * del PDF como imagen, lista para preparar y pasar por OCR.
   */

  import { mqttRequest } from '$lib/ui-core/mqtt-request';
  import { FilePicker } from '$lib/components/base';

  export let panelId: string = '';

  // State
  let filePath = '';
  let page = 1;
  let totalPages = 0;
  let scale = 2.0;
  let processing = false;
  let error = '';
  let resultImage = '';
  let resultPath = '';

  async function handleGetInfo() {
    if (!filePath.trim()) return;
    error = '';

    try {
      const res = await mqttRequest<any>('pdfjs', 'info', { pdf: filePath.trim() });
      totalPages = res.data?.pages || 0;
      page = 1;
    } catch (err: any) {
      error = err.message || 'Error al leer PDF';
    }
  }

  async function handleConvert() {
    if (!filePath.trim()) return;
    processing = true;
    error = '';
    resultImage = '';

    try {
      const res = await mqttRequest<any>('pdfjs', 'render', {
        pdf: filePath.trim(),
        page,
        scale
      }, { timeout: 20000 });

      resultImage = res.data?.image || '';
      resultPath = res.data?.path || '';
    } catch (err: any) {
      error = err.message || 'Error al convertir';
    } finally {
      processing = false;
    }
  }
</script>

<div class="panel-body">
  <div class="form-group">
    <label class="form-label">Archivo PDF</label>
    <FilePicker
      extensions={['.pdf']}
      placeholder="Seleccionar PDF..."
      bind:value={filePath}
      on:select={() => handleGetInfo()}
    />
  </div>

  {#if totalPages > 0}
    <div class="info-row">
      <span class="info-text">{totalPages} paginas</span>
    </div>

    <div class="form-row">
      <div class="form-group compact">
        <label class="form-label" for="pdf-page">Pagina</label>
        <input
          id="pdf-page"
          type="number"
          class="form-input num"
          min="1"
          max={totalPages}
          bind:value={page}
        />
      </div>
      <div class="form-group compact">
        <label class="form-label" for="pdf-scale">Escala</label>
        <select id="pdf-scale" class="form-input" bind:value={scale}>
          <option value={1.0}>1x</option>
          <option value={1.5}>1.5x</option>
          <option value={2.0}>2x (recomendado)</option>
          <option value={3.0}>3x</option>
        </select>
      </div>
    </div>

    <button class="btn-action" on:click={handleConvert} disabled={processing}>
      {processing ? 'Convirtiendo...' : '📄→🖼️ Convertir a Imagen'}
    </button>
  {/if}

  {#if resultImage}
    <div class="result">
      <div class="result-header">
        <span class="result-label">Resultado</span>
        {#if resultPath}
          <span class="result-path">{resultPath}</span>
        {/if}
      </div>
      <img
        class="result-img"
        src="data:image/png;base64,{resultImage}"
        alt="Pagina {page} del PDF"
      />
    </div>
  {/if}

  {#if error}
    <div class="error-msg">{error}</div>
  {/if}
</div>

<style>
  .panel-body {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.5rem;
  }

  .form-group { display: flex; flex-direction: column; gap: 0.2rem; }
  .form-group.compact { flex: 1; min-width: 0; }
  .form-label { font-size: 0.7rem; color: var(--color-text-muted, #888); font-weight: 500; }
  .form-input {
    padding: 0.4rem 0.5rem;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.8rem;
  }
  .form-input:focus { outline: none; border-color: var(--color-primary, #3b82f6); }
  .form-input.num { width: 4rem; }

  .input-row { display: flex; gap: 0.375rem; }
  .input-row .form-input { flex: 1; }
  .form-row { display: flex; gap: 0.5rem; }

  .btn-sm {
    padding: 0.4rem 0.625rem;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .btn-sm:hover { background: rgba(255,255,255,0.12); }
  .btn-sm:disabled { opacity: 0.4; cursor: not-allowed; }

  .btn-action {
    padding: 0.6rem 0.75rem;
    background: var(--color-primary, #3b82f6);
    border: none;
    border-radius: 0.375rem;
    color: white;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-action:hover:not(:disabled) { filter: brightness(1.1); }
  .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }

  .info-row { display: flex; align-items: center; gap: 0.5rem; }
  .info-text { font-size: 0.7rem; color: var(--color-text-muted, #888); }

  .result { display: flex; flex-direction: column; gap: 0.375rem; }
  .result-header { display: flex; justify-content: space-between; align-items: center; }
  .result-label { font-size: 0.7rem; font-weight: 600; color: var(--color-success, #22c55e); }
  .result-path { font-size: 0.65rem; color: var(--color-text-muted, #888); font-family: monospace; }
  .result-img {
    max-width: 100%;
    border-radius: 0.375rem;
    border: 1px solid rgba(255,255,255,0.1);
  }

  .error-msg {
    padding: 0.4rem 0.5rem;
    background: rgba(239,68,68,0.1);
    border: 1px solid rgba(239,68,68,0.3);
    border-radius: 0.375rem;
    color: var(--color-error, #ef4444);
    font-size: 0.75rem;
  }
</style>
