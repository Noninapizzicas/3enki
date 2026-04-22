<script lang="ts">
  /**
   * OcrPanel - Extrae texto de una imagen usando OCR
   *
   * Backend principal: Google Vision (DOCUMENT_TEXT_DETECTION).
   * Fallbacks: tesseract, scribe-ocr, document-processor.
   * Muestra el texto extraido con boton para copiar.
   */

  import { mqttRequest } from '$lib/ui-core/mqtt-request';
  import { FilePicker } from '$lib/components/base';

  export let panelId: string = '';

  // State
  let imagePath = '';
  let backend = 'google-vision';
  let hint = 'DOCUMENT_TEXT_DETECTION';
  let language = 'es';
  let processing = false;
  let error = '';
  let extractedText = '';
  let confidence = 0;
  let usedBackend = '';
  let copied = false;

  async function handleExtract() {
    if (!imagePath.trim()) return;
    processing = true;
    error = '';
    extractedText = '';

    try {
      let res: any;

      if (backend === 'google-vision') {
        res = await mqttRequest<any>('google-vision', 'extract', {
          image: imagePath.trim(),
          hint,
          languageHints: [language]
        }, { timeout: 60000 });
      } else if (backend === 'tesseract') {
        res = await mqttRequest<any>('tesseract', 'extract', {
          image: imagePath.trim(),
          language: language === 'es' ? 'spa' : 'eng'
        }, { timeout: 20000 });
      } else if (backend === 'scribe-ocr') {
        res = await mqttRequest<any>('scribe-ocr', 'extract', {
          input: imagePath.trim(),
          lang: language === 'es' ? 'spa' : 'eng'
        }, { timeout: 20000 });
      } else if (backend === 'document-processor') {
        res = await mqttRequest<any>('document-processor', 'process', {
          document: imagePath.trim(),
          language
        }, { timeout: 30000 });
      }

      extractedText = res?.data?.text || '';
      confidence = res?.data?.confidence || 0;
      usedBackend = res?.data?.backend || backend;
    } catch (err: any) {
      error = err.message || 'Error en OCR';
    } finally {
      processing = false;
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(extractedText);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = extractedText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    }
  }
</script>

<div class="panel-body">
  <div class="form-group">
    <label class="form-label">Imagen para OCR</label>
    <FilePicker
      extensions={['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif']}
      placeholder="Seleccionar imagen..."
      bind:value={imagePath}
    />
  </div>

  <div class="form-row">
    <div class="form-group compact">
      <label class="form-label" for="ocr-backend">Backend</label>
      <select id="ocr-backend" class="form-input" bind:value={backend}>
        <option value="google-vision">Google Vision</option>
        <option value="tesseract">Tesseract (local)</option>
        <option value="scribe-ocr">Scribe OCR (local)</option>
        <option value="document-processor">Document Processor</option>
      </select>
    </div>
    <div class="form-group compact">
      <label class="form-label" for="ocr-lang">Idioma</label>
      <select id="ocr-lang" class="form-input" bind:value={language}>
        <option value="es">Espanol</option>
        <option value="en">Ingles</option>
      </select>
    </div>
  </div>

  {#if backend === 'google-vision'}
    <div class="form-group">
      <label class="form-label" for="ocr-hint">Modo de deteccion</label>
      <select id="ocr-hint" class="form-input" bind:value={hint}>
        <option value="DOCUMENT_TEXT_DETECTION">Documento (recomendado)</option>
        <option value="TEXT_DETECTION">Texto general</option>
        <option value="HANDWRITING">Escritura a mano</option>
      </select>
    </div>
  {/if}

  <button class="btn-action" on:click={handleExtract} disabled={!imagePath.trim() || processing}>
    {processing ? 'Extrayendo...' : '🔍 Extraer Texto'}
  </button>

  {#if extractedText}
    <div class="result">
      <div class="result-header">
        <span class="result-label">Texto extraido</span>
        <div class="result-meta">
          {#if usedBackend}
            <span class="meta-badge">{usedBackend}</span>
          {/if}
          {#if confidence > 0}
            <span class="meta-badge conf">{confidence}%</span>
          {/if}
          <button class="btn-copy" on:click={handleCopy}>
            {copied ? '✓ Copiado' : 'Copiar'}
          </button>
        </div>
      </div>
      <pre class="result-text">{extractedText}</pre>
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
  .form-row { display: flex; gap: 0.5rem; }

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
  .result-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .result-label { font-size: 0.7rem; font-weight: 600; color: var(--color-success, #22c55e); }
  .result-meta { display: flex; gap: 0.25rem; align-items: center; }
  .meta-badge {
    padding: 0.1rem 0.375rem;
    background: rgba(59,130,246,0.15);
    border-radius: 0.25rem;
    font-size: 0.6rem;
    color: var(--color-primary, #3b82f6);
  }
  .meta-badge.conf { background: rgba(34,197,94,0.15); color: var(--color-success, #22c55e); }

  .btn-copy {
    padding: 0.2rem 0.5rem;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 0.25rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.65rem;
    cursor: pointer;
  }
  .btn-copy:hover { background: rgba(255,255,255,0.12); }

  .result-text {
    margin: 0;
    padding: 0.5rem;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-family: monospace;
    color: var(--color-text, #e5e5e5);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 20rem;
    overflow-y: auto;
    line-height: 1.5;
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
