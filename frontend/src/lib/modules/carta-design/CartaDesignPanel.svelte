<script lang="ts">
  /**
   * CartaDesignPanel — EL PANEL DEL JEFE del COMPOSITOR del diseño impreso de
   * la carta (F7, composición 3 capas según modules/pizzepos/carta-design/
   * esquema-jefe/, ciclo v2):
   *
   *   1. SELECCIONAR  la carta a diseñar (ref-select desde carta.list).
   *   2. COMPONER     (LA DECISIÓN) 1 llamada design.contexto_diseno {carta_id}
   *                   → dictamen visual {carta, marca, alergenos_catalogo}.
   *   3. VALIDAR      (FRENO) design.validar {carta_id, html} → {valid, errors}.
   *      GUARDAR      design.save {carta_id, html} → 201 meta + señal generada.
   *      VER          la galería (cinta-estado design.gallery).
   *
   * CANAL RPC por evento (SIN ui_handlers — HÍBRIDO fuzzy como menu-generator/
   * viabilidad): publish a core/{ASTERISCO}/events/design/<op>/request con
   * ASTERISCO LITERAL + request_id + project_id en el cuerpo; respuesta pareada
   * suscrita dot-notation 'design.<op>.response' filtrando request_id; top-level
   * {request_id, status, data|error}. TODO RPC inyecta project_id (lección bug
   * escandallo).
   *
   * SEÑAL pareada (VERIFICADA en código — index.js L205): carta.html.generada
   * re-lee la galería con debounce 60ms. Dictamen en la respuesta + señal que
   * re-confirma: nunca recarga, nunca estado optimista.
   *
   * La UI NO compone HTML: dispara la composición (contexto_diseno), valida y
   * guarda el resultado. El HTML del diseño lo genera el LLM de página.
   *
   * Molde: frontend/src/lib/modules/menu-generator/MenuImportadorPanel.svelte.
   */

  import { onMount } from 'svelte';
  import {
    cargarCartas,
    cargarGaleria,
    componerDiseno,
    validarDiseno,
    guardarDiseno,
    resetCartaDesign,
    initCartaDesignSubscriptions,
    cartasStore,
    cartasLoading,
    cartasError,
    dictamenContexto,
    dictamenValidar,
    dictamenSave,
    galeriaStore,
    galeriaLoading,
    componiendo,
    validando,
    guardando,
    errorDesign,
    cinta,
    type CartaRef,
    type DictamenContexto,
    type DictamenValidar,
    type MetaDiseno
  } from './stores/carta-design';
  import { activeProjectId } from '$lib/stores/projects';

  export let panelId: string = '';

  // ---- ref-select carta ----
  let cartaId = '';
  let htmlDiseno = '';
  let nombreDiseno = '';
  let formatoDiseno = '';

  // ---- señal ----
  let senalVisto = 0;
  let senalUltima: string | null = null;
  let cleanupSenal: (() => void) | null = null;

  onMount(() => {
    cleanupSenal = initCartaDesignSubscriptions();
    void cargarCartas();
    void cargarGaleria();
    return () => {
      if (cleanupSenal) cleanupSenal();
      resetCartaDesign();
    };
  });

  // FRENO local: sin carta o sin HTML → no se dispara (el dictamen REAL lo da
  // el reflejo: 400/404/422 nombrados).
  $: componerBloqueado = !$activeProjectId || !cartaId;
  $: validarBloqueado = !$activeProjectId || !cartaId || !htmlDiseno.trim();
  $: guardarBloqueado = !$activeProjectId || !cartaId || !htmlDiseno.trim();

  // Reacción al proyecto activo: vaciar (multi-tenant, sin datos ajenos).
  let ultimoProjectId = '';
  $: {
    const pid = $activeProjectId;
    if (typeof pid === 'string' && pid && pid !== ultimoProjectId) {
      ultimoProjectId = pid;
      resetCartaDesign();
      void cargarCartas();
      void cargarGaleria();
    } else if (!pid && ultimoProjectId) {
      ultimoProjectId = '';
      resetCartaDesign();
    }
  }

  // ===========================================================================
  // COMPONER (LA DECISIÓN) — 1 llamada design.contexto_diseno
  // ===========================================================================
  async function onComponer(): Promise<void> {
    if (componerBloqueado) return;
    try {
      await componerDiseno(cartaId);
      // dictamen ya en $dictamenContexto; la señal re-confirma.
    } catch {
      /* error ya nombrado en $errorDesign → queda bajo el botón */
    }
  }

  // ===========================================================================
  // VALIDAR (FRENO) — design.validar
  // ===========================================================================
  async function onValidar(): Promise<void> {
    if (validarBloqueado) return;
    try {
      await validarDiseno(cartaId, htmlDiseno);
    } catch {
      /* error ya nombrado en $errorDesign */
    }
  }

  // ===========================================================================
  // GUARDAR — design.save (RE-VALIDA como gate inquebrantable)
  // ===========================================================================
  async function onGuardar(): Promise<void> {
    if (guardarBloqueado) return;
    try {
      await guardarDiseno(cartaId, htmlDiseno, nombreDiseno, formatoDiseno);
    } catch {
      /* error ya nombrado en $errorDesign */
    }
  }

  // ===========================================================================
  // helpers de render del dictamen visual
  // ===========================================================================
  function coloresDeMarca(marca: DictamenContexto['marca']): Array<[string, string]> {
    const cols = marca?.visual?.colores ?? {};
    return Object.entries(cols).slice(0, 6);
  }

  function productosDeCarta(ctx: DictamenContexto | null): Array<{ nombre: string; precio?: number }> {
    const prods = ctx?.carta?.productos ?? [];
    return prods.map((p) => ({ nombre: String(p?.nombre ?? ''), precio: p?.precio }));
  }
</script>

<div class="cd-panel" data-panel={panelId}>
  <!-- ══════════ CINTA-ESTADO del compositor ══════════ -->
  <div class="cinta-estado">
    <span class="cinta-titulo">🖼️ Compositor del diseño impreso</span>
    {#if !$activeProjectId}
      <span class="chip">sin proyecto activo</span>
    {:else if $componiendo}
      <span class="chip chip-info" aria-live="polite">⏳ componiendo… (espera ≥20s)</span>
    {:else if $cinta.compuesto}
      <span class="chip chip-ok">diseño de «{$cinta.cartaNombre ?? cartaId}» compuesto</span>
      {#if $cinta.marcaPresente}
        <span class="chip">marca presente ✓</span>
      {:else}
        <span class="chip chip-warn">marca sin completar (el diseño no tiene identidad de la que beber)</span>
      {/if}
    {:else}
      <span class="chip chip-sistema">sin componer aún</span>
    {/if}
    {#if $cinta.disenosGuardados > 0}
      <span class="chip">{$cinta.disenosGuardados} diseño(s) guardado(s)</span>
    {/if}
    {#if senalVisto > 0}
      <span class="chip chip-sistema" title="señal carta.html.generada (index.js L205)">🔔 señal: {senalUltima ?? 'carta.html.generada'}</span>
    {/if}
  </div>

  {#if !$activeProjectId}
    <div class="estado muted">elige un negocio activo para componer el diseño de su carta.</div>
  {:else}
    <!-- ══════════ 1. SELECCIONAR — ref-select carta ══════════ -->
    <section class="tarjeta">
      <header class="tarjeta-cabecera">
        <h3>🗂 La carta a diseñar</h3>
        {#if $cartasLoading}
          <span class="chip chip-info">cargando cartas…</span>
        {:else if $cartasStore.length}
          <span class="chip chip-ok">{$cartasStore.length} carta(s)</span>
        {:else}
          <span class="chip chip-sistema">sin cartas</span>
        {/if}
      </header>
      <div class="campo">
        <label class="etiqueta" for="cd-carta">elige la carta (ref-select — nunca teclear el id)</label>
        <select id="cd-carta" bind:value={cartaId} disabled={$cartasLoading}>
          <option value="">— elegir carta —</option>
          {#each $cartasStore as c (c.id)}
            <option value={c.id}>
              {c.nombre} · {c.estado ?? 'sin_estado'} · {c.productos_count ?? 0} productos
            </option>
          {/each}
        </select>
      </div>
      {#if $cartasError}
        <div class="banner banner-error" role="alert">⚠ {$cartasError}</div>
      {/if}
      <footer class="tarjeta-acciones">
        <button
          class="btn btn-primario"
          on:click={onComponer}
          disabled={componerBloqueado || $componiendo}
          title={componerBloqueado ? 'Falta elegir la carta' : 'Dispara la composición del look impreso (contexto_diseno)'}
        >
          {$componiendo ? 'componiendo…' : '🎨 Componer el look impreso'}
        </button>
        {#if $dictamenContexto}
          <span class="nota ok" aria-live="polite">✔ dictamen visual listo</span>
        {/if}
      </footer>
    </section>

    <!-- ══════════ 2. DICTAMEN VISUAL (contexto_diseno) ══════════ -->
    {#if $dictamenContexto}
      <section class="tarjeta">
        <header class="tarjeta-cabecera">
          <h3>📋 Dictamen visual del impreso</h3>
          {#if $cinta.marcaPresente}
            <span class="chip chip-ok">identidad de marca presente</span>
          {:else}
            <span class="chip chip-warn">marca sin completar</span>
          {/if}
        </header>
        <div class="dictamen-grid">
          <div class="dictamen-bloque">
            <h4>La carta</h4>
            <p class="nota">
              <b>{$dictamenContexto.carta.meta?.nombre ?? $dictamenContexto.carta.nombre ?? cartaId}</b>
              · {$dictamenContexto.carta.productos?.length ?? 0} productos ·
              {$dictamenContexto.carta.categorias?.length ?? 0} categorías
            </p>
            {#if productosDeCarta($dictamenContexto).length}
              <ul class="nombrado">
                {#each productosDeCarta($dictamenContexto).slice(0, 12) as p}
                  <li>{p.nombre}{#if p.precio != null} — {p.precio} €{/if}</li>
                {/each}
              </ul>
            {/if}
          </div>
          <div class="dictamen-bloque">
            <h4>La identidad de marca</h4>
            {#if $dictamenContexto.marca}
              <p class="nota">
                <b>{$dictamenContexto.marca.esencia?.nombre ?? 'sin nombre'}</b>
                {#if $dictamenContexto.marca.esencia?.lema} — «{$dictamenContexto.marca.esencia.lema}»{/if}
              </p>
              {#if $dictamenContexto.marca.visual?.estilo}
                <p class="nota">estilo: {$dictamenContexto.marca.visual.estilo}</p>
              {/if}
              {#if coloresDeMarca($dictamenContexto.marca).length}
                <div class="paleta">
                  {#each coloresDeMarca($dictamenContexto.marca) as [nombre, valor]}
                    <span class="swatch" title="{nombre}: {valor}" style="background:{valor}"></span>
                  {/each}
                </div>
              {/if}
            {:else}
              <p class="nota warn">marca sin completar — el diseño no tiene identidad de la que beber. Completa el onboarding en <b>Perfil de Marca</b>.</p>
            {/if}
          </div>
          <div class="dictamen-bloque">
            <h4>Alérgenos (Reg. UE 1169/2011)</h4>
            {#if $dictamenContexto.alergenos_catalogo?.length}
              <ul class="nombrado">
                {#each $dictamenContexto.alergenos_catalogo as a}
                  <li>{a.emoji ?? ''} {a.nombre}</li>
                {/each}
              </ul>
            {:else}
              <p class="nota">sin catálogo de alérgenos</p>
            {/if}
          </div>
        </div>
      </section>
    {/if}

    <!-- ══════════ 3. VALIDAR (FRENO) + GUARDAR ══════════ -->
    <section class="tarjeta tarjeta-accion">
      <header class="tarjeta-cabecera">
        <h3>✍️ El diseño (HTML)</h3>
        {#if $dictamenValidar}
          {#if $dictamenValidar.valid}
            <span class="chip chip-ok">válido — representa la carta</span>
          {:else}
            <span class="chip chip-warn">inválido — {$dictamenValidar.productos_faltan} producto(s) faltan</span>
          {/if}
        {:else}
          <span class="chip chip-sistema">sin validar</span>
        {/if}
      </header>
      <div class="campo">
        <label class="etiqueta" for="cd-html">el HTML del diseño (lo compone el LLM de página — pégalo aquí)</label>
        <textarea
          id="cd-html"
          class="editor-html"
          bind:value={htmlDiseno}
          rows="12"
          spellcheck="false"
          placeholder="<html>… el diseño impreso de la carta …</html>"
        ></textarea>
      </div>
      <div class="campo">
        <label class="etiqueta" for="cd-nombre">nombre del diseño (opcional)</label>
        <input id="cd-nombre" type="text" bind:value={nombreDiseno} placeholder="Carta de verano — edición 2026" />
      </div>
      <div class="campo">
        <label class="etiqueta" for="cd-formato">formato de la maqueta (opcional)</label>
        <input id="cd-formato" type="text" bind:value={formatoDiseno} placeholder="A4 apaisado · doble cara · 3 col" />
      </div>

      {#if $dictamenValidar && !$dictamenValidar.valid}
        <div class="banner banner-aviso" role="status">
          ⚠ <b>freno</b> — el diseño NO representa la carta:
          <ul class="nombrado">
            {#each $dictamenValidar.errors as e}
              <li><b>{e.code}</b> — {e.message}{#if e.faltan?.length} (faltan: {e.faltan.join(', ')}){/if}</li>
            {/each}
          </ul>
        </div>
      {/if}
      {#if $errorDesign}
        <div class="banner banner-error" role="alert">⚠ {$errorDesign}</div>
      {/if}

      <footer class="tarjeta-acciones">
        <button
          class="btn"
          on:click={onValidar}
          disabled={validarBloqueado || $validando}
          title={validarBloqueado ? 'Falta carta o HTML' : 'Juzga si el HTML representa la carta (freno)'}
        >
          {$validando ? 'validando…' : '🛡️ Validar (freno)'}
        </button>
        <button
          class="btn btn-primario"
          on:click={onGuardar}
          disabled={guardarBloqueado || $guardando}
          title={guardarBloqueado ? 'Falta carta o HTML' : 'Guarda el diseño (RE-VALIDA como gate inquebrantable)'}
        >
          {$guardando ? 'guardando…' : '💾 Guardar diseño'}
        </button>
        {#if $dictamenSave}
          <span class="nota ok" aria-live="polite">✔ guardado: {$dictamenSave.filename}</span>
        {/if}
      </footer>
    </section>

    <!-- ══════════ GALERÍA (cinta-estado) ══════════ -->
    <section class="tarjeta">
      <header class="tarjeta-cabecera">
        <h3>🗃 Galería de diseños guardados</h3>
        {#if $galeriaLoading}
          <span class="chip chip-info">cargando…</span>
        {:else if $galeriaStore.length}
          <span class="chip chip-ok">{$galeriaStore.length} diseño(s)</span>
        {:else}
          <span class="chip chip-sistema">sin diseños guardados</span>
        {/if}
      </header>
      {#if $galeriaStore.length}
        <ul class="galeria">
          {#each $galeriaStore as g (g.filename)}
            <li class="galeria-item">
              <span class="galeria-nombre">{g.nombre ?? g.carta_id}</span>
              <span class="chip">{g.formato ?? 'sin formato'}</span>
              <span class="chip chip-sistema">{g.generado_at}</span>
              <code class="galeria-file">{g.filename}</code>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="nota">aún no hay diseños guardados — compone y guarda el primero.</p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .cd-panel {
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
  .tarjeta-accion {
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
  input[type='text'],
  select {
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--border, #ccc);
    font: inherit;
  }
  .editor-html {
    width: 100%;
    box-sizing: border-box;
    font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1.45;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid var(--border, #ccc);
    resize: vertical;
    min-height: 200px;
  }
  .dictamen-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
  }
  .dictamen-bloque h4 {
    margin: 0 0 6px;
    font-size: 13px;
    color: var(--muted, #666);
  }
  .paleta {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }
  .swatch {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    border: 1px solid var(--border, #ccc);
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
  .galeria {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .galeria-item {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    border: 1px solid var(--border, #eee);
    border-radius: 8px;
    padding: 8px 10px;
  }
  .galeria-nombre {
    font-weight: 600;
  }
  .galeria-file {
    font-size: 12px;
    color: var(--muted, #888);
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
  .estado.muted {
    color: var(--muted, #888);
  }
</style>
