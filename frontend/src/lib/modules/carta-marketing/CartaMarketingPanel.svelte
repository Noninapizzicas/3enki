<script lang="ts">
  /**
   * CartaMarketingPanel — EL PANEL DEL JEFE de la identidad de marca (F7,
   * composición 3 capas según esquema-jefe/ de carta-marketing):
   *
   *   1. INFORMARSE   carta-marketing.get_perfil: la identidad vigente por
   *                   secciones (esencia/voz/visual/publico), distinguiendo lo
   *                   declarado de lo "por declarar" (secciones vacías). SIN
   *                   404 (INV2): la falta de marca es estado NOMBRADO, no error.
   *   2. DECLARAR     editor-bloque ESENCIA (nombre req + lema/proposito/valores),
   *                   editor-bloque VOZ (tono/registro/referencias/si/no),
   *                   editor-bloque VISUAL (colores/tipografias/estilo/logo) y
   *                   editor-bloque PÚBLICO (quien/actitud) → update_perfil
   *                   enviando SOLO su sección (INV3: deep-merge preserva el resto).
   *   3. DICTAMEN     doble confirmación (R2+R3): el dictamen llega EN LA
   *                   RESPUESTA de la mutación (200 { marca fusionada } — INV4)
   *                   y la señal marketing.perfil.actualizado (VERIFICADA:
   *                   reflejo index.js L145 → eventBus del core → MQTT
   *                   core/STAR/events/…, misma familia que entrega.reglas.actualizadas)
   *                   re-lee el informe con debounce 60ms. NUNCA recarga ni asume.
   *
   * R2 — la UI jamás escribe el store: los borradores se rellenan desde la
   *      LECTURA vigente; solo las respuestas RPC escriben.
   * Moneda — SIN €: la identidad de marca no tiene cifras (INV6).
   *
   * Molde: modules/entrega/EntregaPanel.svelte (informe + editor-bloque + chips).
   */

  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import {
    marcaStore,
    cinta,
    lecturaLoading,
    lecturaError,
    mutacionesPendientes,
    errorMutacion,
    arrayFromCsv,
    csvFromArray,
    loadMarca,
    resetCartaMarketing,
    declararEsencia,
    declararVoz,
    declararVisual,
    declararPublico,
    initCartaMarketingSubscriptions,
    type MarcaEsencia,
    type MarcaVoz,
    type MarcaVisual,
    type MarcaPublico,
    type DictamenDeclaracion
  } from './stores/carta-marketing';
  import { sessionProjectId } from '$lib/stores/sessionProject';

  export let panelId: string = '';

  // ---- editores-bloque abiertos (1 modal por sección) ----
  let editorEsenciaAbierto = false;
  let editorVozAbierto = false;
  let editorVisualAbierto = false;
  let editorPublicoAbierto = false;

  // ---- borradores ESENCIA ----
  let nombreBorrador = '';
  let lemaBorrador = '';
  let propositoBorrador = '';
  let valoresCsv = '';

  // ---- borradores VOZ ----
  let tonoCsv = '';
  let registroBorrador = '';
  let referenciasCsv = '';
  let siCsv = '';
  let noCsv = '';

  // ---- borradores VISUAL ----
  let coloresCsv = '';
  let tipografiasCsv = '';
  let estiloBorrador = '';
  let logoBorrador = '';

  // ---- borradores PÚBLICO ----
  let quienBorrador = '';
  let actitudBorrador = '';

  // errores de VALIDACIÓN por editor (los de red los nombra errorMutacion)
  let errEsencia = '';
  let errVoz = '';
  let errVisual = '';
  let errPublico = '';

  /** DICTAMEN por editor, construido desde la RESPUESTA de la mutación (INV4). */
  interface DictamenEditor {
    seccion: string;
    texto: string;
  }
  let dictamen: DictamenEditor | null = null;

  /* Señal-refresh (R3): init monta la suscripción marketing.perfil.actualizado
   * con debounce 60ms; devuelve su cleanup. */
  let cleanupSenal: (() => void) | null = null;

  onMount(() => {
    cleanupSenal = initCartaMarketingSubscriptions();
    return () => {
      if (cleanupSenal) cleanupSenal();
      resetCartaMarketing();
    };
  });

  // Reacción al proyecto activo: cargar identidad o vaciar (multi-tenant).
  let ultimoProjectId = '';
  $: {
    const pid = $sessionProjectId;
    if (typeof pid === 'string' && pid && pid !== ultimoProjectId) {
      ultimoProjectId = pid;
      cerrarEditores();
      void loadMarca();
    } else if (!pid && ultimoProjectId) {
      ultimoProjectId = '';
      cerrarEditores();
      resetCartaMarketing();
    }
  }

  function cerrarEditores(): void {
    editorEsenciaAbierto = false;
    editorVozAbierto = false;
    editorVisualAbierto = false;
    editorPublicoAbierto = false;
    dictamen = null;
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (editorEsenciaAbierto) editorEsenciaAbierto = false;
      else if (editorVozAbierto) editorVozAbierto = false;
      else if (editorVisualAbierto) editorVisualAbierto = false;
      else if (editorPublicoAbierto) editorPublicoAbierto = false;
    }
  }

  // ---- editor ESENCIA (borrador desde lo VIGENTE — R2) ----
  function abrirEditorEsencia(): void {
    const es: MarcaEsencia = get(marcaStore)?.esencia ?? {};
    nombreBorrador = es.nombre ?? '';
    lemaBorrador = es.lema ?? '';
    propositoBorrador = es.proposito ?? '';
    valoresCsv = csvFromArray(es.valores);
    errEsencia = '';
    dictamen = null;
    editorEsenciaAbierto = true;
  }

  function guardarEsencia(): void {
    if (!nombreBorrador.trim()) {
      errEsencia = 'el nombre de la marca es obligatorio (mínimo para arrancar)';
      return;
    }
    void declararEsencia({
      nombre: nombreBorrador.trim(),
      lema: lemaBorrador.trim() || undefined,
      proposito: propositoBorrador.trim() || undefined,
      valores: arrayFromCsv(valoresCsv)
    })
      .then((d) => {
        editorEsenciaAbierto = false; // el refresco completo lo da la señal (R3)
        dictamen = dictamenDe(d); // dictamen de la RESPUESTA (INV4)
        errEsencia = '';
      })
      .catch(() => {
        /* error ya nombrado en errorMutacion → el editor permanece abierto */
      });
  }

  // ---- editor VOZ ----
  function abrirEditorVoz(): void {
    const voz: MarcaVoz = get(marcaStore)?.voz ?? {};
    tonoCsv = csvFromArray(voz.tono);
    registroBorrador = voz.registro ?? '';
    referenciasCsv = csvFromArray(voz.referencias);
    siCsv = csvFromArray(voz.si);
    noCsv = csvFromArray(voz.no);
    errVoz = '';
    dictamen = null;
    editorVozAbierto = true;
  }

  function guardarVoz(): void {
    void declararVoz({
      tono: arrayFromCsv(tonoCsv),
      registro: registroBorrador.trim() || undefined,
      referencias: arrayFromCsv(referenciasCsv),
      si: arrayFromCsv(siCsv),
      no: arrayFromCsv(noCsv)
    })
      .then((d) => {
        editorVozAbierto = false;
        dictamen = dictamenDe(d);
        errVoz = '';
      })
      .catch(() => {
        /* error ya nombrado en errorMutacion → el editor permanece abierto */
      });
  }

  // ---- editor VISUAL ----
  function abrirEditorVisual(): void {
    const vis: MarcaVisual = get(marcaStore)?.visual ?? {};
    coloresCsv = csvFromArray(Object.entries(vis.colores ?? {}).map(([k, v]) => `${k}: ${v}`));
    tipografiasCsv = csvFromArray(Object.entries(vis.tipografias ?? {}).map(([k, v]) => `${k}: ${v}`));
    estiloBorrador = vis.estilo ?? '';
    logoBorrador = vis.logo ?? '';
    errVisual = '';
    dictamen = null;
    editorVisualAbierto = true;
  }

  function guardarVisual(): void {
    void declararVisual({
      colores: csvToRecord(coloresCsv),
      tipografias: csvToRecord(tipografiasCsv),
      estilo: estiloBorrador.trim() || undefined,
      logo: logoBorrador.trim() || undefined
    })
      .then((d) => {
        editorVisualAbierto = false;
        dictamen = dictamenDe(d);
        errVisual = '';
      })
      .catch(() => {
        /* error ya nombrado en errorMutacion → el editor permanece abierto */
      });
  }

  // ---- editor PÚBLICO ----
  function abrirEditorPublico(): void {
    const pub: MarcaPublico = get(marcaStore)?.publico ?? {};
    quienBorrador = pub.quien ?? '';
    actitudBorrador = pub.actitud ?? '';
    errPublico = '';
    dictamen = null;
    editorPublicoAbierto = true;
  }

  function guardarPublico(): void {
    void declararPublico({
      quien: quienBorrador.trim() || undefined,
      actitud: actitudBorrador.trim() || undefined
    })
      .then((d) => {
        editorPublicoAbierto = false;
        dictamen = dictamenDe(d);
        errPublico = '';
      })
      .catch(() => {
        /* error ya nombrado en errorMutacion → el editor permanece abierto */
      });
  }

  /** CSV "clave: valor, clave2: valor2" → Record<string,string>. */
  function csvToRecord(s: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const item of (s ?? '').split(',')) {
      const t = item.trim();
      if (!t) continue;
      const idx = t.indexOf(':');
      if (idx === -1) continue;
      const k = t.slice(0, idx).trim();
      const v = t.slice(idx + 1).trim();
      if (k) out[k] = v;
    }
    return out;
  }

  /** Dictamen legible desde la respuesta de update_perfil (nunca del local). */
  function dictamenDe(d: DictamenDeclaracion): DictamenEditor {
    const vacio = !d.marca || Object.keys(d.marca).length === 0;
    if (vacio) {
      return { seccion: d.seccion, texto: `${d.seccion}: identidad persistida — el informe se re-lee con la señal marketing.perfil.actualizado` };
    }
    const es = d.marca.esencia ?? {};
    const voz = d.marca.voz ?? {};
    const vis = d.marca.visual ?? {};
    const pub = d.marca.publico ?? {};
    switch (d.seccion) {
      case 'esencia':
        return {
          seccion: d.seccion,
          texto: `esencia persistida — ${es.nombre || 'sin nombre'}${es.lema ? ` · lema "${es.lema}"` : ''}${es.valores?.length ? ` · ${es.valores.length} valores` : ''}`
        };
      case 'voz':
        return {
          seccion: d.seccion,
          texto: `voz persistida — tono ${voz.tono?.length ? voz.tono.join(', ') : 'por declarar'}${voz.registro ? ` · registro "${voz.registro}"` : ''}${voz.no?.length ? ` · evita ${voz.no.length}` : ''}`
        };
      case 'visual':
        return {
          seccion: d.seccion,
          texto: `visual persistido — ${vis.estilo || 'estilo por declarar'}${vis.colores && Object.keys(vis.colores).length ? ` · ${Object.keys(vis.colores).length} colores` : ''}${vis.logo ? ' · logo' : ''}`
        };
      case 'publico':
        return {
          seccion: d.seccion,
          texto: `público persistido — ${pub.quien || 'quién por declarar'}${pub.actitud ? ` · ${pub.actitud}` : ''}`
        };
      default:
        return { seccion: d.seccion, texto: `${d.seccion}: identidad persistida` };
    }
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="jefe-marca" data-carta-marketing-panel={panelId}>
  <!-- ══════════ CINTA-ESTADO ══════════ -->
  <div class="cinta-estado">
    {#if $lecturaError}
      <span class="cinta-nombre error" title={$lecturaError}>⚠ identidad no disponible</span>
    {:else if $lecturaLoading && !$marcaStore}
      <span class="cinta-nombre muted">leyendo identidad…</span>
    {:else if $mutacionesPendientes > 0}
      <span class="sync" aria-live="polite">⏳ sincronizando…</span>
    {:else if $marcaStore}
      <span class="cinta-nombre muted">🎨 identidad de marca</span>
      <span class="cinta-num">{$cinta.porDeclarar}</span> palancas por declarar
    {:else}
      <span class="cinta-nombre muted">sin proyecto activo</span>
    {/if}
  </div>

  <!-- ══════════ CAPA 1+3 · INFORMARSE (get_perfil, ordenado por secciones) ══════════ -->
  <div class="zona-informe">
    {#if $lecturaError}
      <div class="estado error" role="alert">⚠ No se pudo leer la identidad: {$lecturaError}</div>
    {:else if $marcaStore}
      <div class="informe">
        <div class="informe-cabecera">
          {#if $cinta.sinMarca}
            <span class="chip chip-sistema" title="get_perfil respondió con secciones vacías">sin marca ⚙</span>
          {:else}
            <span class="chip chip-jefe" title="la esencia tiene nombre — identidad vigente">jefe ✍</span>
          {/if}
          <span class="informe-sub">{$cinta.porDeclarar} por declarar</span>
          <button class="btn-secundario" on:click={abrirEditorPublico}>👥 público</button>
          <button class="btn-secundario" on:click={abrirEditorVisual}>🎨 visual</button>
          <button class="btn-secundario" on:click={abrirEditorVoz}>🗣 voz</button>
          <button class="btn-primario" on:click={abrirEditorEsencia}>✨ esencia</button>
        </div>

        {#if $cinta.sinMarca}
          <p class="aviso-default">
            <b>sin marca — por declarar</b>: la identidad está vacía. Declara la
            esencia (nombre) para arrancar. No hay error que reparar (no existe el
            404): es una declaración pendiente.
          </p>
        {/if}

        <div class="palancas-informe">
          <div class="palanca">
            <div class="palanca-titulo">✨ Esencia — el ADN</div>
            <div class="lista-chips">
              <span class="ing-chip {$cinta.esenciaDefinida ? 'ing-chip-si' : 'ing-chip-no'}">
                {$cinta.esenciaDefinida ? 'nombre: ' + ($marcaStore.esencia?.nombre ?? '') : 'nombre por declarar'}
              </span>
              {#if $marcaStore.esencia?.lema}
                <span class="ing-chip">lema: {$marcaStore.esencia.lema}</span>
              {/if}
              {#if $marcaStore.esencia?.valores?.length}
                <span class="ing-chip">{$marcaStore.esencia.valores.length} valores</span>
              {/if}
            </div>
          </div>

          <div class="palanca">
            <div class="palanca-titulo">🗣 Voz — cómo habla</div>
            <div class="lista-chips">
              <span class="ing-chip">tono: {($marcaStore.voz?.tono?.length ? $marcaStore.voz.tono.join(', ') : 'por declarar')}</span>
              {#if $marcaStore.voz?.registro}
                <span class="ing-chip">registro: {$marcaStore.voz.registro}</span>
              {/if}
              {#if $marcaStore.voz?.no?.length}
                <span class="ing-chip">evita: {$marcaStore.voz.no.length}</span>
              {/if}
            </div>
          </div>

          <div class="palanca">
            <div class="palanca-titulo">🎨 Visual — cómo se ve</div>
            <div class="lista-chips">
              <span class="ing-chip">estilo: {($marcaStore.visual?.estilo || 'por declarar')}</span>
              {#if $marcaStore.visual?.colores && Object.keys($marcaStore.visual.colores).length}
                <span class="ing-chip">{Object.keys($marcaStore.visual.colores).length} colores</span>
              {/if}
              {#if $marcaStore.visual?.logo}
                <span class="ing-chip">logo ✓</span>
              {/if}
            </div>
          </div>

          <div class="palanca">
            <div class="palanca-titulo">👥 Público — a quién</div>
            <div class="lista-chips">
              <span class="ing-chip">quién: {($marcaStore.publico?.quien || 'por declarar')}</span>
              {#if $marcaStore.publico?.actitud}
                <span class="ing-chip">actitud: {$marcaStore.publico.actitud}</span>
              {/if}
            </div>
          </div>
        </div>

        {#if dictamen}
          <div class="dictamen valida" aria-live="polite">
            ✔ {dictamen.texto}
            <em>· señal marketing.perfil.actualizado releyendo el informe (debounce 60ms)</em>
          </div>
        {:else if $errorMutacion}
          <div class="feedback error" role="alert">⚠ {$errorMutacion}</div>
        {/if}
      </div>
    {:else}
      <div class="estado muted">
        {#if $lecturaLoading}leyendo identidad…{:else}elige un negocio activo para leer su identidad de marca.{/if}
      </div>
    {/if}
  </div>
</div>

<!-- ══════════ EDITOR-BLOQUE · ESENCIA ══════════ -->
{#if editorEsenciaAbierto}
  <div
    class="editor-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Declarar esencia de marca"
    tabindex="-1"
    on:mousedown={(e) => {
      if (e.target === e.currentTarget) editorEsenciaAbierto = false;
    }}
  >
    <div class="editor-bloque">
      <header class="editor-cabecera">
        <h3>
          ✨ Esencia de marca
          {#if $cinta.sinMarca}
            <span class="chip chip-sistema">declara por 1ª vez</span>
          {:else}
            <span class="chip chip-jefe">edita lo declarado</span>
          {/if}
        </h3>
        <button class="btn-cerrar" title="Cerrar (Esc)" on:click={() => (editorEsenciaAbierto = false)}>✕</button>
      </header>

      <div class="editor-cuerpo">
        <fieldset class="campo">
          <legend>① nombre de la marca (obligatorio)</legend>
          <input type="text" placeholder="La Toscana" bind:value={nombreBorrador} />
        </fieldset>

        <fieldset class="campo">
          <legend>② lema</legend>
          <input type="text" placeholder="Pizza con alma" bind:value={lemaBorrador} />
        </fieldset>

        <fieldset class="campo">
          <legend>③ propósito (para qué existe, en una frase)</legend>
          <textarea rows="2" placeholder="Llevar la pizza artesana a cada barrio" bind:value={propositoBorrador}></textarea>
        </fieldset>

        <fieldset class="campo">
          <legend>④ valores (separados por coma)</legend>
          <input type="text" placeholder="producto fresco, hecho a mano, recetas de siempre" bind:value={valoresCsv} />
        </fieldset>

        <p class="nota-euro">
          ✨ la esencia es el ADN — el mínimo para arrancar es el nombre. Se envía
          SOLO la sección <b>esencia</b> — el deep-merge preserva voz/visual/público
          (INV3). El dictamen llega en la respuesta; la señal re-lee el informe.
        </p>

        {#if errEsencia}
          <div class="feedback error" role="alert">⚠ {errEsencia}</div>
        {/if}
        {#if $errorMutacion}
          <div class="feedback error" role="alert">⚠ {$errorMutacion}</div>
        {/if}
      </div>

      <footer class="editor-pie">
        <button class="btn-secundario" disabled={$mutacionesPendientes > 0} on:click={() => (editorEsenciaAbierto = false)}>
          Cancelar
        </button>
        <button class="btn-primario" disabled={$mutacionesPendientes > 0} on:click={guardarEsencia}>
          {$mutacionesPendientes > 0 ? 'Guardando…' : 'Declarar esencia'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<!-- ══════════ EDITOR-BLOQUE · VOZ ══════════ -->
{#if editorVozAbierto}
  <div
    class="editor-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Declarar voz de marca"
    tabindex="-1"
    on:mousedown={(e) => {
      if (e.target === e.currentTarget) editorVozAbierto = false;
    }}
  >
    <div class="editor-bloque">
      <header class="editor-cabecera">
        <h3>
          🗣 Voz de marca
          {#if $cinta.sinMarca}
            <span class="chip chip-sistema">declara por 1ª vez</span>
          {:else}
            <span class="chip chip-jefe">edita lo declarado</span>
          {/if}
        </h3>
        <button class="btn-cerrar" title="Cerrar (Esc)" on:click={() => (editorVozAbierto = false)}>✕</button>
      </header>

      <div class="editor-cuerpo">
        <fieldset class="campo">
          <legend>① tono (2-3 adjetivos, separados por coma)</legend>
          <input type="text" placeholder="cercana, gamberra, elegante" bind:value={tonoCsv} />
        </fieldset>

        <fieldset class="campo">
          <legend>② registro (tú/usted, formal/desenfadada)</legend>
          <input type="text" placeholder="desenfadado" bind:value={registroBorrador} />
        </fieldset>

        <fieldset class="campo">
          <legend>③ referencias (inspiraciones, separadas por coma)</legend>
          <input type="text" placeholder="poetas, marcas" bind:value={referenciasCsv} />
        </fieldset>

        <fieldset class="campo">
          <legend>④ lo que SÍ hace la voz (separado por coma)</legend>
          <input type="text" placeholder="hablar de tú, ser directa" bind:value={siCsv} />
        </fieldset>

        <fieldset class="campo">
          <legend>⑤ lo que NUNCA hace (separado por coma)</legend>
          <input type="text" placeholder="cursi, formal, corporativo" bind:value={noCsv} />
        </fieldset>

        <p class="nota-euro">
          🗣 la voz la bebe TODO el copy (carta, posts, notificaciones). Se envía
          SOLO la sección <b>voz</b> (INV3). El dictamen llega en la respuesta; la
          señal re-lee el informe.
        </p>

        {#if errVoz}
          <div class="feedback error" role="alert">⚠ {errVoz}</div>
        {/if}
        {#if $errorMutacion}
          <div class="feedback error" role="alert">⚠ {$errorMutacion}</div>
        {/if}
      </div>

      <footer class="editor-pie">
        <button class="btn-secundario" disabled={$mutacionesPendientes > 0} on:click={() => (editorVozAbierto = false)}>
          Cancelar
        </button>
        <button class="btn-primario" disabled={$mutacionesPendientes > 0} on:click={guardarVoz}>
          {$mutacionesPendientes > 0 ? 'Guardando…' : 'Declarar voz'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<!-- ══════════ EDITOR-BLOQUE · VISUAL ══════════ -->
{#if editorVisualAbierto}
  <div
    class="editor-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Declarar visual de marca"
    tabindex="-1"
    on:mousedown={(e) => {
      if (e.target === e.currentTarget) editorVisualAbierto = false;
    }}
  >
    <div class="editor-bloque">
      <header class="editor-cabecera">
        <h3>
          🎨 Visual de marca
          {#if $cinta.sinMarca}
            <span class="chip chip-sistema">declara por 1ª vez</span>
          {:else}
            <span class="chip chip-jefe">edita lo declarado</span>
          {/if}
        </h3>
        <button class="btn-cerrar" title="Cerrar (Esc)" on:click={() => (editorVisualAbierto = false)}>✕</button>
      </header>

      <div class="editor-cuerpo">
        <fieldset class="campo">
          <legend>① colores (rol: valor, separados por coma)</legend>
          <input type="text" placeholder="principal: #c0392b, acento: #f1c40f, fondo: #fff" bind:value={coloresCsv} />
        </fieldset>

        <fieldset class="campo">
          <legend>② tipografías (rol: familia, separadas por coma)</legend>
          <input type="text" placeholder="titulo: Playfair Display, texto: Inter" bind:value={tipografiasCsv} />
        </fieldset>

        <fieldset class="campo">
          <legend>③ estilo (dirección visual en una frase)</legend>
          <input type="text" placeholder="minimalista, rústica, moderna, elegante" bind:value={estiloBorrador} />
        </fieldset>

        <fieldset class="campo">
          <legend>④ logo (ruta al fichero en el storage)</legend>
          <input type="text" placeholder="/pizzepos/carta-marketing/assets/logo.png" bind:value={logoBorrador} />
        </fieldset>

        <p class="nota-euro">
          🎨 el visual es dueño COMPARTIDO: aquí captas el inicial; carta-design lo
          REFINA (paleta/tipografías finales). El logo guarda la RUTA, nunca base64.
          Se envía SOLO la sección <b>visual</b> (INV3).
        </p>

        {#if errVisual}
          <div class="feedback error" role="alert">⚠ {errVisual}</div>
        {/if}
        {#if $errorMutacion}
          <div class="feedback error" role="alert">⚠ {$errorMutacion}</div>
        {/if}
      </div>

      <footer class="editor-pie">
        <button class="btn-secundario" disabled={$mutacionesPendientes > 0} on:click={() => (editorVisualAbierto = false)}>
          Cancelar
        </button>
        <button class="btn-primario" disabled={$mutacionesPendientes > 0} on:click={guardarVisual}>
          {$mutacionesPendientes > 0 ? 'Guardando…' : 'Declarar visual'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<!-- ══════════ EDITOR-BLOQUE · PÚBLICO ══════════ -->
{#if editorPublicoAbierto}
  <div
    class="editor-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Declarar público de marca"
    tabindex="-1"
    on:mousedown={(e) => {
      if (e.target === e.currentTarget) editorPublicoAbierto = false;
    }}
  >
    <div class="editor-bloque">
      <header class="editor-cabecera">
        <h3>
          👥 Público de marca
          {#if $cinta.sinMarca}
            <span class="chip chip-sistema">declara por 1ª vez</span>
          {:else}
            <span class="chip chip-jefe">edita lo declarado</span>
          {/if}
        </h3>
        <button class="btn-cerrar" title="Cerrar (Esc)" on:click={() => (editorPublicoAbierto = false)}>✕</button>
      </header>

      <div class="editor-cuerpo">
        <fieldset class="campo">
          <legend>① quién (a quién va dirigida la marca)</legend>
          <textarea rows="2" placeholder="Familias, jóvenes, inconformistas..." bind:value={quienBorrador}></textarea>
        </fieldset>

        <fieldset class="campo">
          <legend>② actitud (qué buscan, cómo viven)</legend>
          <textarea rows="2" placeholder="Buscan lo auténtico, valoran el producto fresco" bind:value={actitudBorrador}></textarea>
        </fieldset>

        <p class="nota-euro">
          👥 el público define a quién habla la marca. Se envía SOLO la sección
          <b>publico</b> (INV3). El dictamen llega en la respuesta; la señal re-lee
          el informe.
        </p>

        {#if errPublico}
          <div class="feedback error" role="alert">⚠ {errPublico}</div>
        {/if}
        {#if $errorMutacion}
          <div class="feedback error" role="alert">⚠ {$errorMutacion}</div>
        {/if}
      </div>

      <footer class="editor-pie">
        <button class="btn-secundario" disabled={$mutacionesPendientes > 0} on:click={() => (editorPublicoAbierto = false)}>
          Cancelar
        </button>
        <button class="btn-primario" disabled={$mutacionesPendientes > 0} on:click={guardarPublico}>
          {$mutacionesPendientes > 0 ? 'Guardando…' : 'Declarar público'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .jefe-marca {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 0.5rem;
    overflow: hidden;
    font-size: 13px;
    color: var(--color-text, #e4e4e7);
  }

  /* cinta-estado */
  .cinta-estado {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.45rem 0.7rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
    font-size: 0.76rem;
    color: var(--color-text-muted, #888);
  }
  .cinta-num {
    color: var(--color-text, #e4e4e7);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .cinta-nombre.muted {
    color: var(--color-text-muted, #888);
  }
  .cinta-nombre.error {
    color: var(--color-error, #ef4444);
  }
  .sync {
    color: var(--color-warning, #f59e0b);
    font-size: 0.7rem;
  }

  /* informe */
  .zona-informe {
    flex: 1;
    overflow-y: auto;
  }
  .estado {
    padding: 1.4rem 1rem;
    text-align: center;
    font-size: 0.8rem;
    border: 1px dashed var(--color-border, #333);
    border-radius: 8px;
  }
  .estado.muted {
    color: var(--color-text-muted, #888);
  }
  .estado.error {
    color: var(--color-error, #ef4444);
    border-color: var(--color-error, #ef4444);
  }
  .informe {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
    background: var(--color-surface, rgba(255, 255, 255, 0.03));
  }
  .informe-cabecera {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--color-border, #333);
  }
  .informe-sub {
    flex: 1;
    font-size: 0.72rem;
    color: var(--color-text-muted, #888);
  }

  /* chips de fuente (transparencia de origen) */
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    font-size: 0.62rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .chip-jefe {
    background: rgba(34, 197, 94, 0.15);
    color: var(--color-success, #22c55e);
    border: 1px solid rgba(34, 197, 94, 0.4);
  }
  .chip-sistema {
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    color: var(--color-text-muted, #a1a1aa);
    border: 1px solid var(--color-border, #3f3f46);
  }

  .aviso-default {
    margin: 0;
    font-size: 0.74rem;
    color: var(--color-warning, #f59e0b);
    background: rgba(245, 158, 11, 0.07);
    border: 1px solid rgba(245, 158, 11, 0.35);
    border-radius: 8px;
    padding: 0.5rem 0.6rem;
  }

  .palancas-informe {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }
  .palanca-titulo {
    font-size: 0.72rem;
    color: var(--color-text-muted, #888);
    margin-bottom: 0.25rem;
  }
  .lista-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .ing-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    font-size: 0.72rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--color-border, #3f3f46);
    color: var(--color-text, #e4e4e7);
  }
  .ing-chip-si {
    color: var(--color-success, #22c55e);
    border-color: rgba(34, 197, 94, 0.4);
  }
  .ing-chip-no {
    color: var(--color-error, #ef4444);
    border-color: rgba(239, 68, 68, 0.4);
  }

  .dictamen {
    padding: 0.6rem 0.7rem;
    border-radius: 8px;
    font-size: 0.78rem;
    border: 1px solid;
  }
  .dictamen.valida {
    color: var(--color-success, #22c55e);
    border-color: rgba(34, 197, 94, 0.4);
    background: rgba(34, 197, 94, 0.08);
  }
  .dictamen em {
    font-style: normal;
    color: var(--color-text-muted, #a1a1aa);
    font-size: 0.66rem;
  }
  .feedback.error {
    color: var(--color-error, #ef4444);
    border-color: rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.08);
    padding: 0.5rem 0.6rem;
    border-radius: 8px;
    font-size: 0.74rem;
  }

  /* botones */
  .btn-primario,
  .btn-secundario {
    padding: 0.3rem 0.7rem;
    border-radius: 6px;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--color-border, #3f3f46);
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    color: var(--color-text, #e4e4e7);
  }
  .btn-primario {
    background: rgba(34, 197, 94, 0.15);
    border-color: rgba(34, 197, 94, 0.4);
    color: var(--color-success, #22c55e);
  }
  .btn-primario:disabled,
  .btn-secundario:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* editor-bloque overlay */
  .editor-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
  }
  .editor-bloque {
    width: min(520px, 92vw);
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    background: var(--color-bg, #18181b);
    border: 1px solid var(--color-border, #3f3f46);
    border-radius: 12px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  }
  .editor-cabecera {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.7rem 0.9rem;
    border-bottom: 1px solid var(--color-border, #333);
  }
  .editor-cabecera h3 {
    margin: 0;
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .btn-cerrar {
    background: none;
    border: none;
    color: var(--color-text-muted, #888);
    font-size: 0.9rem;
    cursor: pointer;
  }
  .editor-cuerpo {
    padding: 0.8rem 0.9rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .campo {
    border: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .campo legend {
    font-size: 0.7rem;
    color: var(--color-text-muted, #888);
    margin-bottom: 0.1rem;
  }
  .campo input,
  .campo textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 0.4rem 0.5rem;
    border-radius: 6px;
    border: 1px solid var(--color-border, #3f3f46);
    background: var(--color-surface, rgba(255, 255, 255, 0.04));
    color: var(--color-text, #e4e4e7);
    font-size: 0.78rem;
    font-family: inherit;
  }
  .nota-euro {
    margin: 0;
    font-size: 0.7rem;
    color: var(--color-text-muted, #a1a1aa);
    background: var(--color-surface, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--color-border, #3f3f46);
    border-radius: 8px;
    padding: 0.45rem 0.55rem;
  }
  .editor-pie {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.7rem 0.9rem;
    border-top: 1px solid var(--color-border, #333);
  }
</style>
