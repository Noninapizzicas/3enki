<script lang="ts">
  /**
   * MenuImportadorPanel — EL PANEL DEL JEFE del IMPORTADOR de catálogos (F7,
   * composición 3 capas según modules/pizzepos/menu-generator/esquema-jefe/,
   * ciclo v2 #10):
   *
   *   1. INFORMARSE   LA FUENTE en el editor-JSON: pegar texto O arrastrar el
   *                   .json (FileReader→editor) + nombre de la carta + validación
   *                   mínima local (parse + categorias[]/productos[]) con los
   *                   errores del reflejo NOMBRADOS en el editor (400/404/422).
   *   2. DECLARAR     — (no hay declaración multi-campo: la única "declaración"
   *                   es la TRANSICIÓN; el nombre es un inline-gesture).
   *   3. TRANSICIÓN   IMPORTAR: puente fs.write (el JSON viaja TAL CUAL a
   *                   '/pizzepos/imports/<slug>.json' — el reflejo NO acepta
   *                   JSON inline, INV2) → 1 menu.import.request {nombre,
   *                   material_ref} → dictamen 200 {carta_id, nombre,
   *                   categorias, productos}. Botón muerto en vuelo; espera
   *                   real ≥ 20s (carta.save interno de 15s).
   *
   * SEÑAL INDIRECTA (INV3 — invariante del módulo): menu-generator NO publica
   * señal propia; la re-confirmación la da el CUSTODIO (carta.actualizada
   * L294 + carta.editada opcional), correelada por project_id con debounce
   * 60ms en el store. Dictamen en la respuesta + señal que re-confirma:
   * nunca recarga, nunca estado optimista.
   *
   * FIDELIDAD: la UI no compone nada — el JSON viaja verbatim; la validación
   * local solo frena el gesto obvio (el dictamen REAL es el del reflejo).
   *
   * Conviive con el panel vivo de la página /menu-generator
   * (frontend/src/lib/modules/menu-generate/GeneratePanel.svelte — decisión
   * documentada de ciclo v2; MenuGeneratorPanel/index.ts de ESTA carpeta
   * están ARCHIVADOS y no se tocan).
   *
   * Molde: frontend/src/lib/modules/carta-digital/CartaDigitalJefePanel.svelte.
   */

  import { onMount } from 'svelte';
  import {
    validarJsonLocal,
    importarCatalogo,
    resetImportador,
    initImportadorSubscriptions,
    importando,
    errorImport,
    dictamenImport,
    type EstadoCustodio,
    type ValidacionLocal,
    type DictamenImport
  } from './stores/importador';
  import { activeProjectId } from '$lib/stores/projects';

  export let panelId: string = '';

  // Ejemplo de carta mínima para el placeholder (las llaves NO pueden ir
  // literales en el atributo: el parser de Svelte las toma como expresión).
  const EJEMPLO_JSON =
    '{"categorias":[{"id":"pizzas","nombre":"Pizzas","orden":1}],' +
    '"productos":[{"id":"pizza_margarita","nombre":"Margarita","categoria_id":"pizzas","precio":9.5}]}';

  // ---- editor-json (borradores rellenados SOLO desde la fuente, R2) ----
  let nombreCarta = '';
  let jsonTexto = '';
  let dragEnCurso = false;
  let errFichero = '';

  // ---- transición + señal ----
  let senalVisto = 0;
  let senalUltima: string | null = null;
  let senalTs: number | null = null;
  let cleanupSenal: (() => void) | null = null;

  onMount(() => {
    cleanupSenal = initImportadorSubscriptions((estado: EstadoCustodio) => {
      senalVisto = estado.visto;
      senalUltima = estado.ultimo;
      senalTs = estado.en;
    });
    return () => {
      if (cleanupSenal) cleanupSenal();
      resetImportador();
    };
  });

  // Validación en vivo del editor (SOLO con texto — vacío = por traer).
  let validacion: ValidacionLocal | null = null;
  $: validacion = jsonTexto.trim() ? validarJsonLocal(jsonTexto) : null;

  // FRENO local: sin nombre, JSON roto o vacío → no se dispara (el dictamen
  // REAL de estructura lo dará el reflejo: 400/404/422 nombrados).
  $: importBloqueado =
    !$activeProjectId || !nombreCarta.trim() || !validacion || !validacion.ok;

  // Reacción al proyecto activo: vaciar (multi-tenant, sin datos ajenos).
  let ultimoProjectId = '';
  $: {
    const pid = $activeProjectId;
    if (typeof pid === 'string' && pid && pid !== ultimoProjectId) {
      ultimoProjectId = pid;
      cerrarTodo();
    } else if (!pid && ultimoProjectId) {
      ultimoProjectId = '';
      cerrarTodo();
      resetImportador();
    }
  }

  function cerrarTodo(): void {
    nombreCarta = '';
    jsonTexto = '';
    errFichero = '';
    dragEnCurso = false;
  }

  // ===========================================================================
  // ENTRADA 2 — DRAG-FILE: el .json cae en el MISMO editor (el texto viaja
  // verbatim; el nombre se sugiere del fichero si el jefe no escribió uno).
  // ===========================================================================
  async function cargarFichero(file: File): Promise<void> {
    errFichero = '';
    try {
      jsonTexto = await file.text();
      if (!nombreCarta.trim()) nombreCarta = sugerirNombreDesdeFichero(file.name);
    } catch {
      errFichero = 'no se pudo leer el fichero';
    }
  }

  function sugerirNombreDesdeFichero(n: string): string {
    return n
      .replace(/\.[^.]+$/, '')
      .replace(/[-_]+/g, ' ')
      .trim();
  }

  function onDrop(e: DragEvent): void {
    e.preventDefault();
    dragEnCurso = false;
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    if (!/\.json$/i.test(f.name) && f.type !== 'application/json') {
      errFichero = 'suelta un fichero .json (la carta a importar)';
      return;
    }
    void cargarFichero(f);
  }

  function onFicheroElegido(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    if (f) void cargarFichero(f);
    input.value = ''; // re-elegir el mismo fichero dispara change otra vez
  }

  // ===========================================================================
  // TRANSICIÓN — IMPORTAR (1 puente fs.write + 1 menu.import; dictamen en la
  // respuesta; el botón muere durante el vuelo — no hay doble import).
  // ===========================================================================
  async function onImportar(): Promise<void> {
    if (importBloqueado) return;
    try {
      const d: DictamenImport = await importarCatalogo(nombreCarta, jsonTexto);
      // dictamen ya en $dictamenImport; la señal del custodio re-confirma.
      void d;
    } catch {
      /* error ya nombrado en $errorImport → queda bajo el botón */
    }
  }
</script>

<div class="mi-panel" data-panel={panelId}>
  <!-- ══════════ CINTA-ESTADO del importador ══════════ -->
  <div class="cinta-estado">
    <span class="cinta-titulo">📥 Importador de catálogos</span>
    {#if !$activeProjectId}
      <span class="chip">sin proyecto activo</span>
    {:else if $importando}
      <span class="chip chip-info" aria-live="polite">⏳ importando… (espera ≥20s)</span>
    {:else if $dictamenImport}
      <span class="chip chip-ok">carta «{$dictamenImport.nombre}» importada</span>
      <span class="chip">{$dictamenImport.categorias} categorías · {$dictamenImport.productos} productos</span>
      {#if senalVisto > 0}
        <span class="chip chip-sistema" title="señal INDIRECTA del custodio (carta.actualizada — menu-generator no publica señal propia)">custodio re-confirma ✓</span>
      {/if}
    {:else}
      <span class="chip chip-sistema">sin importar aún</span>
    {/if}
    {#if senalVisto > 0}
      <span class="chip" title="señal del custodio correelada por proyecto">🔔 custodio: {senalUltima ?? 'carta.actualizada'}</span>
    {/if}
  </div>

  {#if !$activeProjectId}
    <div class="estado muted">elige un negocio activo para importar su catálogo.</div>
  {:else}
    <!-- ══════════ 1. LA FUENTE — EDITOR-JSON (paste + drag-file) ══════════ -->
    <section class="tarjeta">
      <header class="tarjeta-cabecera">
        <h3>🗂 La fuente (el JSON del catálogo)</h3>
        {#if validacion}
          {#if validacion.ok}
            <span class="chip chip-ok">{validacion.categorias} categorías · {validacion.productos} productos</span>
          {:else}
            <span class="chip chip-warn">JSON sin productos/categorías</span>
          {/if}
        {:else}
          <span class="chip chip-sistema">sin fuente</span>
        {/if}
      </header>

      <div class="campo">
        <label class="etiqueta" for="mi-nombre">nombre de la carta (lo pide el reflejo)</label>
        <input
          id="mi-nombre"
          type="text"
          bind:value={nombreCarta}
          placeholder="Carta de verano — el nombre con el que nace la carta"
        />
      </div>

      <div class="campo">
        <label class="etiqueta" for="mi-json">el catálogo en JSON — pégalo o arrastra el .json sobre el editor</label>
        <textarea
          id="mi-json"
          class="editor-json"
          class:drag={dragEnCurso}
          bind:value={jsonTexto}
          rows="14"
          spellcheck="false"
          placeholder={EJEMPLO_JSON}
          on:dragover|preventDefault={() => (dragEnCurso = true)}
          on:dragleave={() => (dragEnCurso = false)}
          on:drop={onDrop}
        ></textarea>
        <label class="fichero-btn">
          <input type="file" accept=".json,application/json" on:change={onFicheroElegido} />
          📎 elegir fichero .json
        </label>
      </div>

      {#if validacion && !validacion.ok}
        <div class="banner banner-aviso" role="status">
          ⚠ <b>freno local</b> (antes de disparar):
          <ul class="nombrado">
            {#each validacion.problemas as p}
              <li>{p}</li>
            {/each}
          </ul>
        </div>
      {/if}
      {#if errFichero}
        <div class="banner banner-error" role="alert">⚠ {errFichero}</div>
      {/if}

      <!-- ERRORES del reflejo NOMBRADOS en el editor (400/404/422) -->
      <details class="errores-reflejo">
        <summary>qué responde el reflejo si el JSON no cuadra</summary>
        <ul class="nombrado">
          <li><b>400 INVALID_INPUT</b> — falta el nombre o la fuente</li>
          <li><b>404 RESOURCE_NOT_FOUND</b> — JSON ilegible en la ruta: no es una carta</li>
          <li><b>422 UPSTREAM_INVALID_RESPONSE</b> — sin productos/categorías detectables</li>
          <li><b>503/502</b> — carta-manager (custodio) no responde</li>
        </ul>
      </details>
    </section>

    <!-- ══════════ 3. TRANSICIÓN — IMPORTAR (1 llamada, espera ≥20s) ══════════ -->
    <section class="tarjeta tarjeta-import">
      <header class="tarjeta-cabecera">
        <h3>🚀 Importar el catálogo</h3>
        {#if $importando}<span class="chip chip-info">en vuelo…</span>{/if}
      </header>
      <p class="nota">
        LA TRANSICIÓN: el JSON viaja íntegro (puente fs.write → /pizzepos/imports/) y el
        reflejo lo convierte en carta <b>BORRADOR</b> de carta-manager. Espera real:
        <b>≥ 20s</b> (el reflejo guarda vía carta-manager).
      </p>
      {#if importBloqueado && ($dictamenImport === null)}
        <span class="nota warn">
          bloqueado — falta {[
            !$activeProjectId ? 'proyecto activo' : '',
            !nombreCarta.trim() ? 'el nombre' : '',
            !validacion ? 'el JSON' : '',
            validacion && !validacion.ok ? 'un JSON con categorías y productos' : ''
          ].filter(Boolean).join(' + ') || 'nada'}
        </span>
      {/if}
      {#if $errorImport}
        <div class="banner banner-error" role="alert">⚠ {$errorImport}</div>
      {/if}
      <footer class="tarjeta-acciones">
        <button
          class="btn btn-primario"
          on:click={onImportar}
          disabled={importBloqueado || $importando}
          title={importBloqueado ? 'Faltan nombre o fuente válida' : 'Escribe la carta en carta-manager (borrador) y responde el dictamen'}
        >
          {$importando ? 'importando…' : '🚀 Importar catálogo'}
        </button>
        {#if $dictamenImport}
          <span class="nota ok" aria-live="polite">✔ última importación: {$dictamenImport.nombre}</span>
        {/if}
      </footer>
    </section>

    <!-- ══════════ DICTAMEN + SEÑAL INDIRECTA DEL CUSTODIO ══════════ -->
    {#if $dictamenImport}
      <section class="tarjeta">
        <header class="tarjeta-cabecera">
          <h3>✅ Dictamen del import</h3>
          {#if senalVisto > 0}
            <span class="chip chip-ok" title="señal INDIRECTA del custodio (menu-generator no publica señal propia)">
              custodio re-confirma ({senalUltima ?? 'carta.actualizada'})
            </span>
          {:else}
            <span class="chip chip-sistema">esperando señal del custodio…</span>
          {/if}
        </header>
        <div class="banner banner-ok" role="status">
          📥 carta «<b>{$dictamenImport.nombre}</b>» creada en borrador — id <code>{$dictamenImport.carta_id}</code>
          · {$dictamenImport.categorias} categorías · {$dictamenImport.productos} productos
        </div>
        <p class="nota">
          nació como <b>versión 1 · borrador</b>: revísala y actívala en
          <b>carta-manager</b> (el importador no activa — la activación es del custodio).
        </p>
      </section>
    {/if}
  {/if}
</div>

<style>
  .mi-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .cinta-estado {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .cinta-titulo {
    font-weight: 700;
  }
  .tarjeta {
    border: 1px solid var(--border, #ddd);
    border-radius: 10px;
    padding: 14px;
    background: var(--surface, #fff);
  }
  .tarjeta-import {
    border-color: var(--primary, #7c5cff);
  }
  .tarjeta-cabecera {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .tarjeta-acciones {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 10px;
  }
  .chip {
    border: 1px solid var(--border, #ddd);
    border-radius: 999px;
    padding: 2px 10px;
    font-size: 12px;
    white-space: nowrap;
  }
  .chip-ok {
    border-color: var(--ok, #2e9e5b);
    color: var(--ok, #2e9e5b);
  }
  .chip-info {
    border-color: var(--info, #4c8dff);
    color: var(--info, #4c8dff);
  }
  .chip-warn {
    border-color: var(--warn, #d9930d);
    color: var(--warn, #d9930d);
  }
  .chip-sistema {
    border-color: var(--border, #bbb);
    color: var(--muted, #888);
  }
  .banner {
    border-radius: 8px;
    padding: 10px 12px;
    margin: 8px 0;
  }
  .banner-ok {
    background: var(--ok-bg, #eaf7ee);
    border: 1px solid var(--ok, #2e9e5b);
  }
  .banner-aviso {
    background: var(--warn-bg, #fdf6e7);
    border: 1px solid var(--warn, #d9930d);
  }
  .banner-error {
    background: var(--danger-bg, #fdecec);
    border: 1px solid var(--danger, #d64545);
  }
  .campo {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 10px 0;
  }
  .etiqueta {
    font-size: 13px;
    color: var(--muted, #666);
  }
  input[type='text'] {
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--border, #ccc);
    font: inherit;
  }
  .editor-json {
    width: 100%;
    box-sizing: border-box;
    font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1.45;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid var(--border, #ccc);
    resize: vertical;
    min-height: 220px;
  }
  .editor-json.drag {
    border-color: var(--primary, #7c5cff);
    box-shadow: 0 0 0 2px var(--primary-bg, rgba(124, 92, 255, 0.2));
  }
  .fichero-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    border: 1px dashed var(--border, #bbb);
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 13px;
    width: fit-content;
  }
  .fichero-btn input[type='file'] {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .errores-reflejo {
    margin-top: 8px;
    font-size: 13px;
    color: var(--muted, #666);
  }
  .nombrado {
    margin: 6px 0 0;
    padding-left: 20px;
  }
  .nombrado li {
    margin: 3px 0;
  }
  .nota {
    font-size: 13px;
    color: var(--muted, #666);
    margin: 4px 0;
  }
  .nota.ok {
    color: var(--ok, #2e9e5b);
  }
  .nota.warn {
    color: var(--warn, #d9930d);
  }
  .btn {
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid var(--border, #ccc);
    background: var(--surface, #fff);
    font: inherit;
    cursor: pointer;
  }
  .btn-primario {
    background: var(--primary, #7c5cff);
    border-color: var(--primary, #7c5cff);
    color: #fff;
    font-weight: 600;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .estado {
    padding: 8px 0;
  }
  .muted {
    color: var(--muted, #888);
  }
</style>