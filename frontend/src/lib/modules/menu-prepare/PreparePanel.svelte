<script lang="ts">
  /**
   * PreparePanel - Prepara imagen para OCR usando sharp
   *
   * Aplica: grayscale, normalize, sharpen, threshold opcional.
   * Usa local.sharp.prepare-ocr.
   */

  import { mqttRequest } from '$lib/ui-core/mqtt-request';
  import { FilePicker } from '$lib/components/base';
  import { updatePageStateBatch } from '$lib/stores/page-context';

  export let panelId: string = '';

  // State
  let imagePath = '';
  let grayscale = true;
  let normalize = true;
  let sharpen = true;
  let threshold = 0;   // 0 = desactivado
  let processing = false;
  let error = '';
  let resultImage = '';
  let resultPath = '';

  async function handlePrepare() {
    if (!imagePath.trim()) return;
    processing = true;
    error = '';
    resultImage = '';

    try {
      const options: Record<string, any> = { grayscale, normalize, sharpen };
      if (threshold > 0) options.threshold = threshold;

      const res = await mqttRequest<any>('sharp', 'prepare-ocr', {
        image: imagePath.trim(),
        options
      }, { timeout: 15000 });

      resultImage = res.data?.image || '';
      resultPath = res.data?.path || '';

      if (resultPath) {
        updatePageStateBatch({ preparedImage: resultPath, pipelineStep: 'image_prepared' });
      }
    } catch (err: any) {
      error = err.message || 'Error al preparar imagen';
    } finally {
      processing = false;
    }
  }
</script>

<div class="panel-body">
  <div class="form-group">
    <label class="form-label">Imagen a preparar</label>
    <FilePicker
      extensions={['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif']}
      placeholder="Seleccionar imagen..."
      bind:value={imagePath}
    />
  </div>

  <div class="options">
    <span class="options-title">Opciones</span>
    <label class="checkbox-label">
      <input type="checkbox" bind:checked={grayscale} />
      <span>Escala de grises</span>
    </label>
    <label class="checkbox-label">
      <input type="checkbox" bind:checked={normalize} />
      <span>Normalizar</span>
    </label>
    <label class="checkbox-label">
      <input type="checkbox" bind:checked={sharpen} />
      <span>Enfocar</span>
    </label>
    <div class="form-group compact">
      <label class="form-label" for="threshold">Binarizar (0=off)</label>
      <input
        id="threshold"
        type="number"
        class="form-input num"
        min="0"
        max="255"
        bind:value={threshold}
      />
    </div>
  </div>

  <button class="btn-action" on:click={handlePrepare} disabled={!imagePath.trim() || processing}>
    {processing ? 'Procesando...' : '🖼️ Preparar Imagen'}
  </button>

  {#if resultImage}
    <div class="result">
      <div class="result-header">
        <span class="result-label">Imagen preparada</span>
        {#if resultPath}
          <span class="result-path">{resultPath}</span>
        {/if}
      </div>
      <img
        class="result-img"
        src="data:image/png;base64,{resultImage}"
        alt="Imagen preparada para OCR"
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
  .form-group.compact { margin-top: 0.25rem; }
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
  .form-input.num { width: 4.5rem; }

  .options {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.5rem;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 0.375rem;
  }
  .options-title { font-size: 0.7rem; font-weight: 600; color: var(--color-text-muted, #888); }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    color: var(--color-text, #e5e5e5);
    cursor: pointer;
  }
  .checkbox-label input[type="checkbox"] {
    accent-color: var(--color-primary, #3b82f6);
  }

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
