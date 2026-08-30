<script lang="ts">
  /**
   * CartaDigitalJefePanel — EL PANEL DEL JEFE del escaparate público (F7,
   * composición 3 capas según modules/pizzepos/carta-digital/esquema-jefe/,
   * ciclo v2 #9):
   *
   *   1. INFORMARSE   get_config (SIN 404: default nombrado «sin configurar»,
   *                   INV2) + get_diseno (informe — el look lo compone Enki) +
   *                   cinta de la proyección (get_carta_publica como DATO DE
   *                   FONDO) + PREVIEW como DICTAMEN VISUAL: iframe srcdoc con
   *                   el HTML REAL que verá el cliente (mismo generateStaticHTML
   *                   — la UI no compone nada).
   *   2. DECLARAR     editor-bloque CONFIG DEL CANAL → update_config { campos };
   *                   solo los campos del shape real (dominio_publico +
   *                   opciones_visualizacion: whatsapp_telefono / moneda /
   *                   mensaje_pedido) — merge profundo: lo no enviado PRESERVA.
   *                   Dictamen = 200 config COMPLETO en la respuesta (INV5).
   *   3. TRANSICIÓN   PUBLICAR con confirmador-nombrado («publica AHORA — el
   *                   público entero ve esta versión»); freno local: sin
   *                   proyección (404 nombrado «asigna carta en tarifas») o
   *                   preview fallido → no se dispara. Dictamen completo en la
   *                   respuesta (alojada_url, aviso…).
   *
   * Señales reales (R3, suscritas en el store con debounce 60ms):
   * cartadigital.config.actualizada · cartadigital.publicado ·
   * cartadigital.carta_publica.actualizada (INDIRECTA del custodio) ·
   * cartadigital.diseno.actualizada — dictamen en la respuesta + señal que
   * re-lee (nunca estado optimista).
   *
   * INV6 — `moneda` es SÍMBOLO display que pinta la PWA ('€'), NO cifra: se
   *        edita como texto corto, sin eurosACentimos ni conversión.
   * INV4b — el 404 de proyección SIN carta en el canal es ESTADO NOMBRADO
   *        («asigna carta en tarifas»), no error genérico; BLOQUEA publicar.
   *
   * Conviive con el panel viejo de 3 zonas (CartaDigitalPanel.svelte +
   * $lib/stores/carta-digital.ts — sin tocar; consumidores verificados:
   * ContenidoPanel importa de ese store).
   *
   * Molde: modules/entrega/EntregaPanel.svelte (editor-bloque + overlay + chips
   * jefe/sistema + reacción al proyecto activo).
   */

  import { onMount } from 'svelte';
  import {
    configStore,
    disenoStore,
    cinta,
    lecturaLoading,
    lecturaError,
    mutacionesPendientes,
    errorMutacion,
    ultimaPublicacion,
    loadInforme,
    resetCartaDigitalJefe,
    declararConfig,
    dictaminarPreview,
    publicarCarta,
    initCartaDigitalJefeSubscriptions,
    describeError,
    es404Proyeccion,
    type DictamenConfig,
    type DictamenPublicacion,
    type OpcionesVisualizacion
  } from '$lib/stores/carta-digital-jefe';
  import { activeProjectId, activeProjectData } from '$lib/stores/projects';

  export let panelId: string = '';

  // ---- editor-bloque CONFIG (borradores rellenados SOLO desde la lectura, R2) ----
  let editorConfigAbierto = false;
  let dominioBorrador = '';   // '' = null = URL alojada (default del contrato)
  let whatsappBorrador = '';
  let monedaBorrador = '';    // SÍMBOLO display (INV6) — sin conversión
  let mensajeBorrador = '';
  let errValidacion = '';

  // ---- dictámenes en la vista (desde RESPUESTAS — nunca estado optimista) ----
  let dictamenGuardado: string | null = null;
  let dictamenPublicar: DictamenPublicacion | null = null;

  // ---- PREVIEW: dictamen visual a demanda del jefe (R3) ----
  let previewAbierto = false;
  let previewCargando = false;
  let previewDictamen: { html: string; productos: number; extras_sin_precio: number; aviso_extras?: string } | null = null;
  let previewError = '';
  let previewFaltante = false; // 404 nombrado: sin carta asignada al canal

  // ---- PUBLICAR: confirmador-nombrado ----
  let publicarAbierto = false;
  let publicando = false;

  let cleanupSenal: (() => void) | null = null;

  onMount(() => {
    cleanupSenal = initCartaDigitalJefeSubscriptions();
    return () => {
      if (cleanupSenal) cleanupSenal();
      resetCartaDigitalJefe();
    };
  });

  // Reacción al proyecto activo: leer informe o vaciar (multi-tenant).
  let ultimoProjectId = '';
  $: {
    const pid = $activeProjectId;
    if (typeof pid === 'string' && pid && pid !== ultimoProjectId) {
      ultimoProjectId = pid;
      cerrarTodo();
      void loadInforme();
    } else if (!pid && ultimoProjectId) {
      ultimoProjectId = '';
      cerrarTodo();
      resetCartaDigitalJefe();
    }
  }

  function cerrarTodo(): void {
    editorConfigAbierto = false;
    publicarAbierto = false;
    dictamenGuardado = null;
    dictamenPublicar = null;
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (publicarAbierto) publicarAbierto = false;
      else if (editorConfigAbierto) editorConfigAbierto = false;
    }
  }

  /** cifra/valor vigente → input ('' si null/undefined = por declarar). */
  function aInput(v: unknown): string {
    return v == null ? '' : String(v);
  }

  // ===========================================================================
  // PREVIEW — DICTAMEN VISUAL: el HTML REAL (generateStaticHTML del módulo),
  // no una maqueta. 404 = estado NOMBRADO. Un preview fallido FRENA publicar.
  // ==========================================================================
  async function abrirPreview(): Promise<void> {
    if (!$activeProjectId) return;
    previewAbierto = true;
    previewCargando = true;
    previewError = '';
    previewFaltante = false;
    try {
      previewDictamen = await dictaminarPreview();
    } catch (err) {
      previewDictamen = null;
      previewFaltante = es404Proyeccion(err);
      previewError = describeError(err);
      if (previewFaltante) previewError = 'sin carta asignada al canal «digital» — asigna una carta al canal en tarifas';
    } finally {
      previewCargando = false;
    }
  }

  /** ¿Hay preview VÁLIDO (o aún no se pidió — se exige antes de publicar si falló)? */
  $: previewValido = previewDictamen?.html != null;

  // ===========================================================================
  // DECLARAR — update_config { campos }: SOLO los del shape real. El merge
  // profundo del reflejo preserva todo lo demás (INV3). Dictamen = respuesta.
  // ==========================================================================
  function abrirEditorConfig(): void {
    const cfg = $configStore ?? {};
    const ops = (cfg.opciones_visualizacion ?? {}) as OpcionesVisualizacion;
    dominioBorrador = cfg.dominio_publico == null ? '' : String(cfg.dominio_publico);
    whatsappBorrador = typeof ops.whatsapp_telefono === 'string' ? ops.whatsapp_telefono : '';
    monedaBorrador = typeof ops.moneda === 'string' ? ops.moneda : '';
    mensajeBorrador = typeof ops.mensaje_pedido === 'string' ? ops.mensaje_pedido : '';
    errValidacion = '';
    dictamenGuardado = null;
    editorConfigAbierto = true;
  }

  async function guardarConfig(): Promise<void> {
    const dominio = dominioBorrador.trim();
    const whatsapp = whatsappBorrador.trim();
    if (dominio && !/^https?:\/\//i.test(dominio)) {
      errValidacion = 'el dominio público debe empezar por http:// o https:// (vacío = URL alojada)';
      return;
    }
    if (whatsapp && !/^\+?\d[\d ()-]{5,19}$/.test(whatsapp)) {
      errValidacion = 'el teléfono de WhatsApp debe ser un número (puede empezar por +)';
      return;
    }
    // SOLO campos del shape real — el merge por bloques preserva el resto.
    const campos: {
      dominio_publico?: string | null;
      opciones_visualizacion?: OpcionesVisualizacion;
    } = { dominio_publico: dominio === '' ? null : dominio };
    const ops: OpcionesVisualizacion = {};
    if (whatsapp !== '') ops.whatsapp_telefono = whatsapp;
    if (monedaBorrador.trim() !== '') ops.moneda = monedaBorrador.trim();
    if (mensajeBorrador.trim() !== '') ops.mensaje_pedido = mensajeBorrador.trim();
    if (Object.keys(ops).length > 0) campos.opciones_visualizacion = ops;
    try {
      const d: DictamenConfig = await declararConfig(campos);
      editorConfigAbierto = false;
      const dom = d.config?.dominio_publico;
      dictamenGuardado = `config guardado — dominio ${dom ? dom : 'URL alojada (sin dominio propio)'}` +
        ` · señal cartadigital.config.actualizada releyendo el informe (debounce 60ms)`;
      errValidacion = '';
      // el dictamen visual quedó viejo tras cambiar el config: forzar re-preview
      if (previewValido) void abrirPreview();
    } catch {
      /* error ya nombrado en errorMutacion → el editor permanece abierto */
    }
  }

  // ===========================================================================
  // TRANSICIÓN — PUBLICAR con confirmador-nombrado. Freno local (se aplica
  // antes de abrir el RPC): sin proyección (404 nombrado) o preview fallido
  // → bloqueado. El dictamen llega EN LA RESPUESTA; la señal re-confirma.
  // =========================================================================

  /** FRENO LOCAL: sin proyección (falta carta) o error de lectura → no se dispara. */
  $: publicarBloqueado = !$cinta.proyectable || !!$lecturaError;

  function abrirConfirmador(): void {
    publicarAbierto = true;
  }

  async function onPublicar(): Promise<void> {
    publicando = true;
    try {
      // DICTAMEN en la respuesta (INV5): alojada_url, aviso… la señal publicado re-confirma.
      dictamenPublicar = await publicarCarta();
      publicarAbierto = false;
    } catch {
      /* error ya nombrado en errorMutacion → el confirmador lo muestra */
    } finally {
      publicando = false;
    }
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="cdj-panel" data-panel={panelId}>
  <!-- ══════════ CINTA-ESTADO del canal ══════════ -->
  <div class="cinta-estado">
    <span class="cinta-titulo">🌐 Carta digital — escaparate público</span>
    {#if $lecturaError}
      <span class="chip chip-error" title={$lecturaError}>⚠ informe no disponible</span>
    {:else if $lecturaLoading && !$configStore}
      <span class="chip">leyendo canal…</span>
    {:else if $mutacionesPendientes > 0}
      <span class="chip chip-info" aria-live="polite">⏳ sincronizando…</span>
    {:else if $configStore}
      <span class="chip">{$cinta.productos ?? '—'} productos proyectables</span>
      {#if $cinta.sinPrecio != null && $cinta.sinPrecio > 0}
        <span class="chip chip-warn" title="ingredientes extra con precio sin servir en el escaparate">{$cinta.sinPrecio} extras sin precio</span>
      {/if}
      <span class="chip" title={$cinta.dominio ? 'URL pública del canal' : 'Sin dominio propio: URL alojada /<ns>/<slug>'}>
        🔗 {$cinta.dominio ?? 'URL alojada'}
      </span>
      {#if $cinta.mensajeFaltante}
        <span class="chip chip-warn" title={$cinta.mensajeFaltante}>sin carta en el canal «digital»</span>
      {:else if $cinta.proyectable}
        <span class="chip chip-ok">proyección lista</span>
      {/if}
    {:else}
      <span class="chip">sin proyecto activo</span>
    {/if}
  </div>

  {#if $lecturaError}
    <div class="banner banner-error">⚠ No se pudo leer el canal: {$lecturaError}</div>
  {/if}

  {#if !$activeProjectId}
    <div class="estado muted">elige un negocio activo para leer su escaparate.</div>
  {:else if $lecturaLoading && !$configStore}
    <div class="estado muted">leyendo canal…</div>
  {:else}
    <!-- ══════════ 2. DECLARAR — informe del canal (get_config SIN 404, INV2) ══════════ -->
    <section class="tarjeta">
      <header class="tarjeta-cabecera">
        <h3>Config del canal (lo ÚNICO que posee el proyector)</h3>
        {#if $cinta.configurado}
          <span class="chip chip-jefe" title="get_config respondió un config declarado">canal declarado ✍</span>
        {:else}
          <span class="chip chip-sistema" title="get_config respondió el default — INV2: estado nombrado, no error">sin configurar ⚙</span>
        {/if}
      </header>
      <dl class="kv">
        <dt>dominio público</dt>
        <dd>{$cinta.dominio ?? '— (URL alojada /<ns>/<slug>)'}</dd>
        <dt>WhatsApp</dt>
        <dd>{$configStore?.opciones_visualizacion?.whatsapp_telefono || 'por declarar'}</dd>
        <dt>moneda (SÍMBOLO display)</dt>
        <dd>{$configStore?.opciones_visualizacion?.moneda || '€ (default)'} <em class="cinta-lab">— símbolo display, no cifra</em></dd>
        <dt>mensaje pedido</dt>
        <dd>{$configStore?.opciones_visualizacion?.mensaje_pedido || 'por declarar'}</dd>
      </dl>
      <footer class="tarjeta-acciones">
        <button class="btn" on:click={abrirEditorConfig}>⚙ declarar config</button>
        {#if dictamenGuardado}
          <span class="nota ok" aria-live="polite">✔ {dictamenGuardado}</span>
        {/if}
      </footer>
    </section>

    <!-- ══════════ 1a. PREVIEW — DICTAMEN VISUAL (iframe srcdoc del HTML REAL) ══════════ -->
    <section class="tarjeta">
      <header class="tarjeta-cabecera">
        <h3>👁 Ver como el cliente</h3>
        <span class="chip chip-info">dictamen visual — el HTML real, no una maqueta</span>
      </header>

      {#if previewFaltante}
        <div class="banner banner-aviso" role="status">
          ⚠ <b>falta carta en el canal</b>: asigna una carta al canal «digital» en tarifas y vuelve a refrescar.
          <em>Detalle: {previewError}</em>
        </div>
      {:else if previewError}
        <div class="banner banner-error">⚠ el preview falló: {previewError}</div>
      {/if}

      {#if $cinta.mensajeFaltante}
        <p class="nota">asigna una carta al canal «digital» en <b>tarifas</b> — sin ella no hay preview ni publicación.</p>
      {/if}

      {#if previewAbierto}
        {#if previewCargando}
          <div class="estado muted">generando el HTML real (imágenes inlineadas, checkout WhatsApp)…</div>
        {:else if previewDictamen?.html}
          <div class="previsu-wrap">
            <iframe
              class="previsu"
              title="Preview de la carta pública — el HTML que verá el cliente"
              srcdoc={previewDictamen.html}
              sandbox=""
            ></iframe>
          </div>
          {#if previewDictamen.aviso_extras}
            <p class="nota">⚠ {previewDictamen.aviso_extras}</p>
          {/if}
        {:else if previewAbierto && !previewCargando}
          <p class="nota warn">el preview falló — no se puede publicar sin dictamen visual válido.</p>
        {/if}
      {:else}
        <div class="estado muted">pide el preview: es el MISMO HTML que verá el cliente (variante suelta → checkout WhatsApp).</div>
      {/if}

      <footer class="tarjeta-acciones">
        <button class="btn" on:click={abrirPreview} disabled={previewCargando || !$activeProjectId}>
          {previewCargando ? 'generando…' : (previewAbierto ? '↻ refrescar preview' : '👁 generar preview')}
        </button>
        {#if previewDictamen}
          <span class="nota">dictamen: {previewDictamen.productos} productos{previewDictamen.extras_sin_precio ? ` · ${previewDictamen.extras_sin_precio} extras sin precio` : ''}</span>
        {/if}
      </footer>
    </section>

    <!-- ══════════ 1b. DISEÑO aplicable (informe — lo compone Enki, no se edita aquí) ══════════ -->
    <section class="tarjeta">
      <header class="tarjeta-cabecera">
        <h3>Diseño aplicable (compuesto por Enki)</h3>
        {#if $disenoStore?.card_template}
          <span class="chip chip-ok">diseño de Enki aplicable</span>
        {:else}
          <span class="chip chip-sistema">sin diseño aún — la PWA usa el template por defecto (estado nombrado)</span>
        {/if}
      </header>
      {#if $disenoStore?.card_template}
        <dl class="kv">
          <dt>card_template</dt>
          <dd><code>{$disenoStore.card_template.length} caracteres</code></dd>
          <dt>tema_css</dt>
          <dd>{#if $disenoStore.tema_css}<code>{$disenoStore.tema_css.length} caracteres</code>{:else}—{/if}</dd>
          {#if $disenoStore.generado_at}
            <dt>generado</dt>
            <dd>{new Date($disenoStore.generado_at).toLocaleString('es-ES')}</dd>
          {/if}
        </dl>
      {/if}
    </section>

    <!-- ══════════ 3. TRANSICIÓN — PUBLICAR (confirmador-nombrado) ══════════ -->
    <section class="tarjeta tarjeta-publicar">
      <header class="tarjeta-cabecera">
        <h3>🚀 Publicar la carta</h3>
        {#if ultimaPublicacion}<span class="chip chip-ok">pública</span>{/if}
      </header>
      <p class="nota">
        LA TRANSICIÓN: hornea proyección + diseño en el bundle estático y <b>el público entero lo ve</b>.
        La carta es ESTÁTICA: cada cambio exige volver a publicar.
      </p>
      {#if dictamenPublicar}
        <div class="banner banner-ok" role="status">
          🌐 publicado → <a href={dictamenPublicar.alojada_url} target="_blank" rel="noopener noreferrer">{dictamenPublicar.alojada_url}</a>
          · {dictamenPublicar.productos} productos · {dictamenPublicar.imagenes_copiadas} imágenes
          {#if dictamenPublicar.aviso_extras}<em> · {dictamenPublicar.aviso_extras}</em>{/if}
          <em> · aviso: {dictamenPublicar.aviso}</em>
        </div>
      {/if}
      <footer class="tarjeta-acciones">
        <button
          class="btn btn-primario"
          on:click={abrirConfirmador}
          disabled={publicarBloqueado || !!$errorMutacion || $mutacionesPendientes > 0}
          title={publicarBloqueado ? 'Bloqueado: falta carta en el canal o el preview falló' : 'Hornea el bundle estático y activa el escaparate'}
        >
          🚀 Publicar…
        </button>
        {#if publicarBloqueado}
          <span class="nota warn">publicación bloqueada — falta carta asignada al canal «digital» (revisa tarifas) o el preview falló</span>
        {/if}
      </footer>
    </section>
  {/if}
</div>

<!-- ══════════ EDITOR-BLOQUE · CONFIG DEL CANAL (update_config {campos} — merge profundo) ══════════ -->
{#if editorConfigAbierto}
  <div
    class="editor-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Declarar config del canal"
    tabindex="-1"
    on:mousedown={(e) => { if (e.target === e.currentTarget) editorConfigAbierto = false; }}
  >
    <div class="editor-bloque">
      <header class="editor-cabecera">
        <h3>
          📱 Config del canal (escaparate)
          {#if $cinta.configurado}
            <span class="chip chip-jefe">edita lo declarado</span>
          {:else}
            <span class="chip chip-sistema">declara por 1ª vez</span>
          {/if}
        </h3>
        <button class="cerrar" on:click={() => (editorConfigAbierto = false)} aria-label="Cerrar">×</button>
      </header>
      <p class="overlay-sub">merge profundo: solo lo que guardes cambia — la carta, el branding y el contenido se <b>beben</b> de sus módulos (no se editan aquí).</p>

      <div class="editor-cuerpo">
        <label class="campo">
          <span class="etiqueta">dominio público (opcional)</span>
          <input id="cfg-dominio" type="text" bind:value={dominioBorrador} placeholder="https://tu-pizzeria.es — vacío = URL alojada /<ns>/<slug>" />
          <small>Vacío = sirve en la URL alojada.</small>
        </label>
        <label class="campo">
          <span class="etiqueta">teléfono WhatsApp del checkout</span>
          <input id="cfg-whatsapp" type="text" bind:value={whatsappBorrador} placeholder="+34 600 000 000" />
        </label>
        <label class="campo">
          <span class="etiqueta">moneda — SÍMBOLO display (no cifra)</span>
          <input id="cfg-moneda" type="text" maxlength="4" bind:value={monedaBorrador} placeholder="€" />
          <small>La PWA la pinta junto a los precios («9,50 €»); NO convierte cifras.</small>
        </label>
        <label class="campo">
          <span class="etiqueta">mensaje precargado de WhatsApp</span>
          <input id="cfg-mensaje" type="text" bind:value={mensajeBorrador} placeholder="¡Hola! Quiero pedir:" />
        </label>
        <p class="overlay-nota">pago_online / pedido_endpoint existen en el config pero NO se piden aquí: [ABIERTO] — requiere tienda-api detrás (decisión del dueño).</p>
        {#if errValidacion}
          <div class="banner banner-error" role="alert">⚠ {errValidacion}</div>
        {/if}
        {#if $errorMutacion}
          <div class="banner banner-error" role="alert">⚠ {$errorMutacion}</div>
        {/if}
      </div>

      <footer class="editor-pie">
        <button class="btn" on:click={() => (editorConfigAbierto = false)}>cancelar</button>
        <button class="btn btn-primario" on:click={guardarConfig} disabled={$mutacionesPendientes > 0}>
          {$mutacionesPendientes > 0 ? 'guardando…' : 'guardar config'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<!-- ══════════ CONFIRMADOR-NOMBRADO · PUBLICAR (la transición GRANDE) ══════════ -->
{#if publicarAbierto}
  <div
    class="editor-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Publicar la carta al público"
    tabindex="-1"
    on:mousedown={(e) => { if (e.target === e.currentTarget && !publicando) publicarAbierto = false; }}
  >
    <div class="editor-bloque editor-bloque-peligro">
      <header class="editor-cabecera">
        <h3>🚀 ¿Publicas AHORA la carta de {$activeProjectData?.name ?? 'este negocio'}?</h3>
        <button class="cerrar" on:click={() => (publicarAbierto = false)} aria-label="Cerrar" disabled={publicando}>×</button>
      </header>
      <div class="editor-cuerpo">
        <p><strong>publica AHORA — el público entero ve esta versión.</strong></p>
        <ul class="nombrado">
          <li>
            qué hornea: la carta del canal «digital» (tarifas) + el diseño de Enki
            ({$disenoStore?.card_template ? 'diseño compuesto por Enki' : 'template por defecto'})
            {#if previewDictamen} · dictamen previo: {previewDictamen.productos} productos{/if}
          </li>
          <li>
            a quién afecta: <b>el público entero</b> —
            {$cinta.dominio ? `se sirve en ${$cinta.dominio}` : `se sirve en la URL alojada /<ns>/<slug>`}{#if $activeProjectData?.slug}&nbsp;(proyecto «{$activeProjectData.slug}»){/if}
          </li>
          <li>activa la feature www (best-effort) y despliega a storage/www — <b>la carta es estática: cada cambio exige volver a publicar</b></li>
          {#if $cinta.sinPrecio != null && $cinta.sinPrecio > 0}
            <li class="aviso-linea">⚠ {$cinta.sinPrecio} extras sin precio — conviene revisarlos antes</li>
          {/if}
        </ul>
        <p class="nota">frenos del módulo: proyecto no activo → 412 · render roto u overflow móvil → 422 · sin carta asignada → 404.</p>
        {#if $errorMutacion}
          <div class="banner banner-error" role="alert">⚠ {$errorMutacion}</div>
        {/if}
      </div>
      <footer class="editor-pie">
        <button class="btn" on:click={() => (publicarAbierto = false)} disabled={publicando}>aún no</button>
        <button class="btn btn-publicar" on:click={onPublicar} disabled={publicando || publicarBloqueado}>
          {publicando ? 'horneando bundle…' : 'sí, publica — el público la ve'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .cdj-panel { display: flex; flex-direction: column; gap: 1rem; padding: 1rem; max-width: 1100px; margin: 0 auto; }

  /* ---- cinta-estado ---- */
  .cinta-estado {
    display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
    padding: 0.6rem 0.9rem; border-radius: 10px;
    background: rgba(148, 163, 184, 0.06); border: 1px solid rgba(148, 163, 184, 0.18);
  }
  .cinta-titulo { font-size: 0.88rem; font-weight: 600; }
  .chip { font-size: 0.72rem; padding: 0.12rem 0.55rem; border-radius: 999px; display: inline-flex; align-items: center; gap: 0.25rem; }
  .chip-jefe { background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.4); }
  .chip-sistema { background: rgba(100, 116, 139, 0.15); color: #94a3b8; border: 1px solid rgba(100, 116, 139, 0.35); }
  .chip-ok { background: rgba(34, 197, 94, 0.12); color: #4ade80; border: 1px solid rgba(74, 222, 128, 0.4); }
  .chip-info { background: rgba(59, 130, 246, 0.12); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
  .chip-warn { background: rgba(234, 179, 8, 0.12); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.35); }
  .chip-error { background: rgba(239, 68, 68, 0.1); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }

  /* ---- tarjetas ---- */
  .tarjeta { background: rgba(148, 163, 184, 0.05); border: 1px solid rgba(148, 163, 184, 0.16); border-radius: 10px; padding: 0.9rem 1rem; }
  .tarjeta-cabecera { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
  .tarjeta-cabecera h3 { margin: 0; font-size: 0.95rem; }
  .tarjeta-acciones { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.6rem; flex-wrap: wrap; }

  .kv { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; margin: 0.4rem 0; }
  .kv dt { color: var(--color-text-muted, #94a3b8); font-size: 0.8rem; }
  .kv dd { margin: 0; font-size: 0.85rem; }

  .banner { border-radius: 8px; padding: 0.6rem 0.8rem; font-size: 0.83rem; margin: 0.4rem 0; }
  .banner-ok { background: rgba(34, 197, 94, 0.1); color: #4ade80; border: 1px solid rgba(74, 222, 128, 0.3); }
  .banner-error { background: rgba(239, 68, 68, 0.1); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
  .nota { font-size: 0.78rem; color: var(--color-text-muted, #94a3b8); margin: 0.25rem 0; }
  .nota.ok { color: #4ade80; }
  .nota.warn { color: #facc15; }
  code { font-family: ui-monospace, monospace; font-size: 0.8em; background: rgba(148, 163, 184, 0.12); padding: 0.1rem 0.3rem; border-radius: 4px; }
  .estado { padding: 0.4rem 0; font-size: 0.85rem; }
  .muted { color: var(--color-text-muted, #94a3b8); }

  /* ---- buttons ---- */
  .btn { border: 1px solid rgba(148, 163, 184, 0.35); background: transparent; color: var(--color-text, #e2e8f0); border-radius: 8px; padding: 0.45rem 0.9rem; font-size: 0.85rem; cursor: pointer; }
  .btn:hover:not(:disabled) { border-color: rgba(148, 163, 184, 0.6); }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn-primario { background: rgba(245, 158, 11, 0.18); border-color: rgba(245, 158, 11, 0.5); color: #fbbf24; font-weight: 600; }
  .btn-primario:hover:not(:disabled) { background: rgba(245, 158, 11, 0.3); }
  .btn-publicar { background: #16a34a; border-color: #16a34a; color: #fff; font-weight: 600; }
  .btn-publicar:hover:not(:disabled) { filter: brightness(1.1); }

  /* ---- overlay / editor-bloque / confirmador ---- */
  .editor-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55); display: flex; align-items: center; justify-content: center; z-index: 1000; }
  .editor-bloque { background: var(--color-bg-card, #14181f); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 12px; width: min(520px, 92vw); max-height: 86vh; overflow: auto; padding: 0 0 0.4rem; }
  .editor-bloque-peligro { border-color: rgba(220, 38, 38, 0.5); }
  .editor-cabecera { display: flex; align-items: center; justify-content: space-between; padding: 0.9rem 1.1rem 0.4rem; }
  .editor-cabecera h3 { margin: 0; font-size: 1rem; }
  .cerrar { background: transparent; border: 0; color: var(--color-text-muted, #94a3b8); font-size: 1.1rem; cursor: pointer; line-height: 1; }
  .editor-sub { margin: 0; padding: 0 1.1rem; font-size: 0.75rem; color: var(--color-text-muted, #94a3b8); }
  .editor-cuerpo { padding: 0.6rem 1.1rem; display: flex; flex-direction: column; gap: 0.35rem; }
  .campo { display: block; margin-bottom: 0.8rem; }
  .campo input { width: 100%; box-sizing: border-box; background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(148, 163, 184, 0.3); color: var(--color-text, #e2e8f0); border-radius: 6px; padding: 0.5rem 0.6rem; font-size: 0.9rem; }
  .overlay-sub, .overlay-nota, .campo small, small { font-size: 0.74rem; color: var(--color-text-muted, #94a3b8); margin: 0.2rem 0 0; }
  .overlay-nota { font-size: 0.72rem; }
  .nombrado { margin: 0.4rem 0; padding-left: 1.2rem; font-size: 0.83rem; display: flex; flex-direction: column; gap: 0.35rem; }
  .aviso-linea { color: #facc15; }
  .overlay-sub { padding: 0 1.1rem; }
  .overlay-nota { padding: 0 0.2rem; }
  .editor-pie { display: flex; justify-content: flex-end; gap: 0.6rem; padding: 0.6rem 1.1rem 0.8rem; }
  .btn-primario { border-color: rgba(245, 158, 11, 0.6); background: rgba(245, 158, 11, 0.14); color: #fbbf24; font-weight: 600; }
  .btn-publicar { background: #16a34a; border-color: #16a34a; color: #fff; font-weight: 600; }
  .btn-publicar:hover:not(:disabled) { filter: brightness(1.08); }
  .nombrado { margin: 0; padding-left: 1.1rem; font-size: 0.83rem; display: flex; flex-direction: column; gap: 0.35rem; }
  code { font-family: ui-monospace, monospace; font-size: 0.8em; background: rgba(148, 163, 184, 0.12); padding: 0.1rem 0.3rem; border-radius: 4px; }
</style>