<script lang="ts">
  /**
   * TecnicasJefePanel — EL PANEL DEL JEFE del catálogo de técnicas culinarias
   * (F7, composición 3 capas según esquema-jefe/ de tecnicas):
   *
   *   1. INFORMARSE   tecnicas.listar (catálogo alfabético LIGERO) +
   *                   tecnicas.obtener (detalle con history, bajo demanda).
   *   2. DECLARAR     editor-bloque ALTA (codificar — nombre único; duplicado
   *                   = ALREADY_EXISTS dictaminado en la respuesta) y
   *                   editor-bloque EVOLUCIÓN (actualizar — pre-rellenado
   *                   desde obtener; solo los 6 campos permitidos; version+1
   *                   e history los bumpa el contrato, NUNCA la UI).
   *   3. DICTAMEN     doble confirmación (R2+R3): el dictamen llega EN LA
   *                   RESPUESTA (201 { tecnica } · 200 { tecnica, diff
   *                   {antes→despues} — el más rico del ciclo) y las señales
   *                   tecnica.creada / tecnica.actualizada (VERIFICADAS en el
   *                   contrato, refresh_on del seed ui.datos) re-leen el
   *                   informe con debounce 60ms. NUNCA recarga ni asume.
   *
   * R2 — la UI jamás escribe el store: los borradores se rellenan desde la
   *      LECTURA (obtener); solo las respuestas RPC escriben.
   * DATO EXACTO (temperatura 0.3): params/materiales/instrucciones viajan
   *      VERBATIM — el panel no normaliza ni calcula rangos (INV6).
   * Moneda — SIN €: parámetros = magnitudes físicas (°C, min, ratios).
   *
   * Molde: modules/entrega/EntregaPanel.svelte (ciclo #8) — cinta + informe +
   * dictamen por respuesta + editor-bloque + señal-refresh.
   */

  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import {
    catalogoStore,
    cinta,
    lecturaLoading,
    lecturaError,
    detalleStore,
    detalleLoading,
    detalleError,
    mutacionesPendientes,
    errorMutacion,
    parsearParametros,
    parsearArrayLineas,
    loadCatalogo,
    loadDetalle,
    resetTecnicas,
    codificarTecnica,
    actualizarTecnica,
    initTecnicasSubscriptions,
    type TecnicaLista,
    type CamposTecnica,
    type DictamenAlta,
    type DictamenEvolucion
  } from './stores/tecnicas';
  import { sessionProjectId } from '$lib/stores/sessionProject';

  export let panelId: string = '';

  // ---- editores-bloque abiertos (1 modal por declaración) ----
  let editorAltaAbierto = false;
  let editorEvolucionAbierto = false;

  // ---- borradores del editor de ALTA ('' = campo no enviado) ----
  let nombreBorrador = '';
  let descripcionBorrador = '';
  let categoriaBorrador = '';
  let parametrosBorrador = '';
  let materialesBorrador = '';
  let instruccionesBorrador = '';
  let etiquetasBorrador = '';

  // ---- borradores del editor de EVOLUCIÓN (rellenados desde obtener — R2) ----
  let evolucionId = '';
  let evolucionNombre = '';
  let descripcionBorradorEvo = '';
  let categoriaBorradorEvo = '';
  let parametrosBorradorEvo = '';
  let materialesBorradorEvo = '';
  let instruccionesBorradorEvo = '';
  let etiquetasBorradorEvo = '';

  // errores de VALIDACIÓN por editor (los de red los nombra errorMutacion)
  let errAlta = '';
  let errEvolucion = '';

  /** DICTAMEN por editor, construido desde la RESPUESTA de la mutación. */
  interface DictamenEditor {
    tipo: 'alta' | 'evolucion';
    texto: string;
    diff?: Array<{ campo: string; antes: string; despues: string }>;
  }
  let dictamen: DictamenEditor | null = null;

  /** Detalle abierto en el informe (tecnicas.obtener bajo demanda). */
  let detalleAbierto = false;

  /* Señal-refresh (R3): monta la suscripción tecnica.creada/actualizada. */
  let cleanupSenal: (() => void) | null = null;

  onMount(() => {
    cleanupSenal = initTecnicasSubscriptions();
    return () => {
      if (cleanupSenal) cleanupSenal();
      resetTecnicas();
    };
  });

  // Reacción al proyecto activo: cargar catálogo o vaciar (multi-tenant).
  let ultimoProjectId = '';
  $: {
    const pid = $sessionProjectId;
    if (typeof pid === 'string' && pid && pid !== ultimoProjectId) {
      ultimoProjectId = pid;
      cerrarTodo();
      void loadCatalogo();
    } else if (!pid && ultimoProjectId) {
      ultimoProjectId = '';
      cerrarTodo();
      resetTecnicas();
    }
  }

  function cerrarTodo(): void {
    editorAltaAbierto = false;
    editorEvolucionAbierto = false;
    dictamen = null;
    detalleAbierto = false;
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (editorAltaAbierto) editorAltaAbierto = false;
      else if (editorEvolucionAbierto) editorEvolucionAbierto = false;
    }
  }

  /** Detalle bajo demanda (obtener) desde una fila del catálogo. */
  function abrirDetalle(t: TecnicaLista): void {
    detalleAbierto = true;
    dictamen = null;
    void loadDetalle(t.id);
  }

  /** Evolución apuntando a una fila del catálogo (ref-select): obtener y pre-rellenar. */
  function abrirEditorEvolucion(t: TecnicaLista): void {
    dictamen = null;
    errEvolucion = '';
    void loadDetalle(t.id).then((ok) => {
      if (ok) abrirEvolucionDesdeDetalle();
    });
  }

  /** Editor de evolución a mano: el jefe escribe nombre/id y busca (R2 — jamás asume). */
  let evolucionConsulta = '';

  function buscarYEditar(): void {
    const q = evolucionConsulta.trim();
    if (!q) {
      errEvolucion = 'escribe el nombre (exacto o parcial) o el uuid de la técnica';
      return;
    }
    void loadDetalle(q).then((ok) => {
      if (ok) abrirEvolucionDesdeDetalle();
    });
  }

  /** Pre-rellena el borrador desde la ÚLTIMA RESPUESTA de obtener (nunca asumido). */
  function abrirEvolucionDesdeDetalle(): void {
    const t = get(detalleStore);
    if (!t) {
      errEvolucion = 'no hay técnica cargada que evolucionar';
      return;
    }
    evolucionId = t.id;
    evolucionNombre = t.nombre;
    descripcionBorradorEvo = t.descripcion ?? '';
    categoriaBorradorEvo = t.categoria ?? '';
    parametrosBorradorEvo = JSON.stringify(t.parametros ?? {}, null, 2);
    materialesBorradorEvo = (t.materiales ?? []).join('\n');
    instruccionesBorradorEvo = (t.instrucciones ?? []).join('\n');
    etiquetasBorradorEvo = (t.etiquetas ?? []).join('\n');
    errEvolucion = '';
    dictamen = null;
    editorEvolucionAbierto = true;
  }

  // ---- editor de ALTA (borrador limpio: nace vacío, es 1ª declaración) ----
  function abrirEditorAlta(): void {
    nombreBorrador = '';
    descripcionBorrador = '';
    categoriaBorrador = '';
    parametrosBorrador = '';
    materialesBorrador = '';
    instruccionesBorrador = '';
    etiquetasBorrador = '';
    errAlta = '';
    dictamen = null;
    editorAltaAbierto = true;
  }

  function guardarAlta(): void {
    const nombre = nombreBorrador.trim();
    if (!nombre) {
      errAlta = 'falta el nombre (el contrato responde INVALID_INPUT sin él)';
      return;
    }
    const parametros = parsearParametros(parametrosBorrador);
    const materiales = parsearArrayLineas(materialesBorrador);
    const instrucciones = parsearArrayLineas(instruccionesBorrador);
    const etiquetas = parsearArrayLineas(etiquetasBorrador);
    const err = parametros.error ?? materiales.error ?? etiquetas.error;
    if (err) {
      errAlta = err;
      return;
    }
    // El dato EXACTO viaja verbatim — sin recortes ni normalización (INV6).
    void codificarTecnica({
      nombre,
      ...(descripcionBorrador.trim() ? { descripcion: descripcionBorrador.trim() } : {}),
      ...(categoriaBorrador.trim() ? { categoria: categoriaBorrador.trim() } : {}),
      parametros: parametros.valor,
      materiales: materiales.valor,
      instrucciones: instrucciones.valor,
      etiquetas: etiquetas.valor
    })
      .then((d) => {
        editorAltaAbierto = false; // el refresco completo lo dan las señales (R3)
        dictamen = dictamenAlta(d);
        errAlta = '';
      })
      .catch(() => {
        /* error ya nombrado (ALREADY_EXISTS y familia) → el editor queda abierto */
      });
  }

  /**
   * EVOLUCIÓN: solo los campos CAMBIADOS respecto a la línea base (la
   * respuesta de obtener) entran en `campos` — el contrato rechaza 0 campos
   * con INVALID_INPUT. Semántica honesta: los campos de TEXTO vacíos se
   * envían como '' (declarar vacío es escritura válida del enum); los
   * BLOQUES (JSON/listas) vacíos NO se envían — no se puede borrar con
   * vacío (limitación nombrada en la nota del editor).
   */
  function guardarEvolucion(): void {
    if (!evolucionId) return;
    const base = get(detalleStore);
    if (!base || base.id !== evolucionId) {
      errEvolucion = 'línea base perdida: busca de nuevo la técnica (obtener)';
      return;
    }
    const p = parsearParametros(parametrosBorradorEvo);
    const mat = parsearArrayLineas(materialesBorradorEvo);
    const ins = parsearArrayLineas(instruccionesBorradorEvo);
    const eti = parsearArrayLineas(etiquetasBorradorEvo);
    const err = p.error ?? eti.error;
    if (err) {
      errEvolucion = err;
      return;
    }
    const campos: CamposTecnica = {};
    if (descripcionBorradorEvo !== (base.descripcion ?? '')) campos.descripcion = descripcionBorradorEvo;
    if (categoriaBorradorEvo !== (base.categoria ?? '')) campos.categoria = categoriaBorradorEvo;
    if (p.valor !== undefined && JSON.stringify(p.valor) !== JSON.stringify(base.parametros ?? {})) {
      campos.parametros = p.valor;
    }
    if (mat.valor !== undefined && materialesBorradorEvo !== (base.materiales ?? []).join('\n')) {
      campos.materiales = mat.valor;
    }
    if (ins.valor !== undefined && instruccionesBorradorEvo !== (base.instrucciones ?? []).join('\n')) {
      campos.instrucciones = ins.valor;
    }
    if (eti.valor !== undefined && etiquetasBorradorEvo !== (base.etiquetas ?? []).join('\n')) {
      campos.etiquetas = eti.valor;
    }
    if (Object.keys(campos).length === 0) {
      errEvolucion = 'no hay cambios respecto a la versión vigente (el contrato responde INVALID_INPUT con 0 campos)';
      return;
    }
    void actualizarTecnica(evolucionId, campos)
      .then((d) => {
        editorEvolucionAbierto = false; // el refresco completo lo dan las señales (R3)
        dictamen = dictamenEvolucion(d);
        errEvolucion = '';
      })
      .catch(() => {
        /* error ya nombrado en errorMutacion → el editor permanece abierto */
      });
  }


  function formatHistory(h: Record<string, unknown>): string {
    return Object.keys(h as Record<string, unknown>)
      .filter((k) => k !== 'history' && k !== 'id')
      .slice(0, 4)
      .map((k) => `${k}: ${formatearValor(h[k])}`)
      .join(' · ');
  }

  /** Botón «evolucionar» del informe sin fila seleccionada: abre el buscador. */
  function abrirEvolucionBuscador(): void {
    dictamen = null;
    errEvolucion = '';
    evolucionId = '';
    evolucionNombre = '';
    evolucionConsulta = '';
    descripcionBorradorEvo = '';
    categoriaBorradorEvo = '';
    parametrosBorradorEvo = '';
    materialesBorradorEvo = '';
    instruccionesBorradorEvo = '';
    etiquetasBorradorEvo = '';
    editorEvolucionAbierto = true;
  }

  function dictamenAlta(d: DictamenAlta): DictamenEditor {
    const t = d.tecnica;
    return {
      tipo: 'alta',
      texto: `técnica codificada — «${t.nombre}» v${t.version}${t.categoria ? ` · categoría ${t.categoria}` : ''} · la señal tecnica.creada re-lee el catálogo (debounce 60ms)`
    };
  }

  function dictamenEvolucion(d: DictamenEvolucion): DictamenEditor {
    return {
      tipo: 'evolucion',
      texto: `evolución persistida — ${d.tecnica.nombre} ahora en v${d.tecnica.version} · ${d.diff.length} campo(s) modificados · la señal tecnica.actualizada re-lee el catálogo`,
      diff: d.diff
    };
  }
</script><svelte:window on:keydown={onKeydown} />

<div class="jefe-tecnicas" data-tecnicas-panel={panelId}>
  <!-- ══════════ CINTA-ESTADO ══════════ -->
  <div class="cinta-estado">
    {#if $lecturaError}
      <span class="cinta-nombre error" title={$lecturaError}>⚠ catálogo no disponible</span>
    {:else if $lecturaLoading && $cinta.vacio}
      <span class="cinta-nombre muted">leyendo catálogo…</span>
    {:else if $mutacionesPendientes > 0}
      <span class="sync" aria-live="polite">⏳ sincronizando…</span>
    {:else}
      <span class="cinta-nombre muted">🍳 catálogo de técnicas</span>
      <span class="cinta-num">{$cinta.total}</span>&nbsp;técnicas · {$cinta.categorias} categorías
      {#if $cinta.sinCategoria > 0}<span class="cinta-soft">· {$cinta.sinCategoria} sin categoría</span>{/if}
    {/if}
  </div>

  <!-- ══════════ CAPA 1+3 · INFORMARSE (listar + obtener bajo demanda) ══════════ -->
  <div class="zona-informe">
    {#if $lecturaError}
      <div class="estado error" role="alert">⚠ No se pudo leer el catálogo: {$lecturaError}</div>
    {:else}
      <div class="informe">
        <div class="informe-cabecera">
          <span class="informe-sub">catálogo alfabético del proyecto (salida ligera — history vive en el detalle)</span>
          <button class="btn-secundario" on:click={abrirEvolucionBuscador}>✎ evolucionar</button>
          <button class="btn-primario" on:click={abrirEditorAlta}>＋ codificar técnica</button>
        </div>

        {#if $cinta.vacio}
          <div class="estado muted">
            {#if $lecturaLoading}leyendo catálogo…{:else}catálogo vacío — codifica la 1ª técnica (fermentación, marinada, ahumado…).{/if}
          </div>
        {/if}

        {#each $catalogoStore as t (t.id)}
          <button class="fila-tecnica" title="ver detalle completo" on:click={() => abrirDetalle(t)}>
            <span class="fila-cabecera">
              <span class="fila-nombre">{t.nombre}</span>
              <span class="lista-chips">
                {#if t.categoria}<span class="ing-chip">{t.categoria}</span>{/if}
                <span class="ing-chip ing-chip-soft">v{t.version}</span>
                {#each t.etiquetas ?? [] as et}
                  <span class="ing-chip ing-chip-soft">{et}</span>
                {/each}
              </span>
            </span>
            {#if t.descripcion}<span class="fila-desc">{t.descripcion}</span>{/if}
          </button>
        {/each}

        <!-- ═══ DETALLE (obtener: instrucciones + history — N2 del esquema) ═══ -->
        {#if detalleAbierto}
          <div class="detalle">
            <div class="detalle-cabecera">
              <b>{$detalleStore?.nombre ?? '…'}</b>
              {#if $detalleStore}<span class="ing-chip ing-chip-soft">v{$detalleStore.version}</span>{/if}
              <span class="detalle-hueco"></span>
              {#if $detalleStore}
                <button class="btn-secundario" on:click={abrirEvolucionDesdeDetalle}>✎ evolucionar esta</button>
              {/if}
              <button class="btn-secundario" on:click={() => (detalleAbierto = false)}>cerrar detalle</button>
            </div>
            {#if $detalleLoading}
              <div class="estado muted">leyendo técnica…</div>
            {:else if $detalleError}
              <div class="feedback error" role="alert">⚠ {$detalleError}</div>
            {:else if $detalleStore}
              <div class="detalle-campo">
                <span>descripción</span>
                <p>{$detalleStore.descripcion || '(sin descripción)'}</p>
              </div>
              <div class="detalle-campo">
                <span>parámetros (dato exacto — viaja verbatim)</span>
                <pre>{JSON.stringify($detalleStore.parametros ?? {}, null, 2)}</pre>
              </div>
              {#if ($detalleStore.materiales ?? []).length > 0}
                <div class="detalle-campo">
                  <span>materiales</span>
                  <p>{$detalleStore.materiales.join(' · ')}</p>
                </div>
              {/if}
              {#if ($detalleStore.instrucciones ?? []).length > 0}
                <div class="detalle-campo">
                  <span>instrucciones</span>
                  <ol class="pasos">{#each $detalleStore.instrucciones as paso}<li>{paso}</li>{/each}</ol>
                </div>
              {/if}
              <div class="detalle-campo">
                <span>history — {$detalleStore.history.length} versión(es) anteriores</span>
                {#if $detalleStore.history.length === 0}
                  <p class="muted-note">nace en v1 — sin versiones anteriores</p>
                {:else}
                  <ul class="history-lista">
                    {#each $detalleStore.history as h, i}
                      <li>v{i + 1} · {formatHistory(h)}</li>
                    {/each}
                  </ul>
                {/if}
              </div>
            {/if}
          </div>
        {/if}

        {#if dictamen}
          <div class="dictamen valida" aria-live="polite">
            ✔ {dictamen.texto}
            {#if dictamen.diff && dictamen.diff.length > 0}
              <ul class="diff-lista">
                {#each dictamen.diff as d}
                  <li><b>{d.campo}</b>: {d.antes} → {d.despues}</li>
                {/each}
              </ul>
            {/if}
          </div>
        {:else if $errorMutacion}
          <div class="feedback error" role="alert">⚠ {$errorMutacion}</div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<!-- ══════════ EDITOR-BLOQUE · ALTA (codificar — nombre* + 6 campos) ══════════ -->
{#if editorAltaAbierto}
  <div
    class="editor-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Codificar técnica (alta al catálogo)"
    tabindex="-1"
    on:mousedown={(e) => {
      if (e.target === e.currentTarget) editorAltaAbierto = false;
    }}
  >
    <div class="editor-bloque">
      <header class="editor-cabecera">
        <h3>
          ＋ Codificar técnica
          <span class="chip chip-jefe">alta al catálogo</span>
        </h3>
        <button class="btn-cerrar" title="Cerrar (Esc)" on:click={() => (editorAltaAbierto = false)}>✕</button>
      </header>

      <div class="editor-cuerpo">
        <fieldset class="campo">
          <legend>① nombre * (único — duplicado = ALREADY_EXISTS en la respuesta)</legend>
          <input type="text" placeholder="ej. Fermentación base pizza (24h)" bind:value={nombreBorrador} />
        </fieldset>

        <fieldset class="campo">
          <legend>② descripción</legend>
          <input type="text" placeholder="qué hace y cuándo usarla" bind:value={descripcionBorrador} />
        </fieldset>

        <fieldset class="campo">
          <legend>③ categoría (texto libre — enum canónico [ABIERTO])</legend>
          <input type="text" placeholder="ej. fermentacion · coccion · preservacion" bind:value={categoriaBorrador} />
        </fieldset>

        <fieldset class="campo">
          <legend>④ parámetros — JSON de datos EXACTOS (temperatura, tiempos, ratios)</legend>
          <textarea rows="4" placeholder={'{"temperatura": 280, "tiempo_min": 8}'} bind:value={parametrosBorrador}></textarea>
        </fieldset>

        <fieldset class="campo">
          <legend>⑤ materiales (1 por línea)</legend>
          <textarea rows="2" placeholder={'horno de piedra\npala\nbanana de madera'} bind:value={materialesBorrador}></textarea>
        </fieldset>

        <fieldset class="campo">
          <legend>⑥ instrucciones (1 paso por línea)</legend>
          <textarea rows="4" placeholder={'1. Precalentar el horno…\n2. …'} bind:value={instruccionesBorrador}></textarea>
        </fieldset>

        <fieldset class="campo">
          <legend>⑦ etiquetas (1 por línea)</legend>
          <textarea rows="2" placeholder={'masa madre\nlenta'} bind:value={etiquetasBorrador}></textarea>
        </fieldset>

        <p class="nota-dato">
          🍳 El dato EXACTO manda (temperatura 0.3 del contrato): parámetros viajan VERBATIM —
          sin inventar rangos (eso lo razona el runtime al codificar). El dictamen llega en la
          respuesta (201 · tecnica); la señal <b>tecnica.creada</b> re-lee el catálogo (debounce 60ms).
        </p>

        {#if errAlta}
          <div class="feedback error" role="alert">⚠ {errAlta}</div>
        {/if}
        {#if $errorMutacion}
          <div class="feedback error" role="alert">⚠ {$errorMutacion}</div>
        {/if}
      </div>

      <footer class="editor-pie">
        <button class="btn-secundario" disabled={$mutacionesPendientes > 0} on:click={() => (editorAltaAbierto = false)}>
          Cancelar
        </button>
        <button class="btn-primario" disabled={$mutacionesPendientes > 0 || !nombreBorrador.trim()} on:click={guardarAlta}>
          {$mutacionesPendientes > 0 ? 'Guardando…' : 'Codificar técnica'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<!-- ══════════ EDITOR-BLOQUE · EVOLUCIÓN (pre-rellenado desde obtener — INV3) ══════════ -->
{#if editorEvolucionAbierto}
  <div
    class="editor-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Evolucionar técnica (actualizar campos)"
    tabindex="-1"
    on:mousedown={(e) => {
      if (e.target === e.currentTarget) editorEvolucionAbierto = false;
    }}
  >
    <div class="editor-bloque">
      <header class="editor-cabecera">
        <h3>
          ✎ Evolucionar técnica
          {#if evolucionNombre}<span class="ing-chip">{evolucionNombre}</span>{/if}
        </h3>
        <button class="btn-cerrar" title="Cerrar (Esc)" on:click={() => (editorEvolucionAbierto = false)}>✕</button>
      </header>

      <div class="editor-cuerpo">
        {#if !evolucionId}
          <fieldset class="campo">
            <legend>① técnica a evolucionar — nombre (exacto/parcial) o uuid</legend>
            <div class="fila-buscador">
              <input
                type="text"
                placeholder="ej. fermentación base"
                bind:value={evolucionConsulta}
                on:keydown={(e) => e.key === 'Enter' && buscarYEditar()}
              />
              <button class="btn-secundario" disabled={$detalleLoading} on:click={buscarYEditar}>
                {$detalleLoading ? 'buscando…' : '🔍 buscar'}
              </button>
            </div>
            <p class="muted-note">la técnica se pre-rellena desde tecnicas.obtener — la UI jamás asume estado (R2)</p>
          </fieldset>
        {/if}

        <fieldset class="campo">
          <legend>② descripción (vacío = declarar vacío)</legend>
          <input type="text" bind:value={descripcionBorradorEvo} />
        </fieldset>

        <fieldset class="campo">
          <legend>③ categoría</legend>
          <input type="text" bind:value={categoriaBorradorEvo} placeholder="ej. fermentacion" />
        </fieldset>

        <fieldset class="campo">
          <legend>④ parámetros — JSON (el dato EXACTO manda)</legend>
          <textarea rows="5" bind:value={parametrosBorradorEvo}></textarea>
        </fieldset>

        <fieldset class="campo">
          <legend>⑤ materiales (1 por línea — vacío = no tocar)</legend>
          <textarea rows="2" bind:value={materialesBorradorEvo}></textarea>
        </fieldset>

        <fieldset class="campo">
          <legend>⑥ instrucciones (1 paso por línea)</legend>
          <textarea rows="4" bind:value={instruccionesBorradorEvo}></textarea>
        </fieldset>

        <fieldset class="campo">
          <legend>⑦ etiquetas (1 por línea)</legend>
          <textarea rows="2" bind:value={etiquetasBorradorEvo}></textarea>
        </fieldset>

        <p class="nota-euro">
          Solo se envían los campos CAMBIADOS respecto a la versión vigente — el enum del contrato
          (descripcion, categoria, parametros, materiales, instrucciones, etiquetas); id/nombre/
          version/history/created_at NO se tocan: los bumpa el runtime. Un campo JSON/lista dejado
          vacío NO se envía (no se puede borrar con vacío). El DICTAMEN muestra el diff
          antes → despues de la respuesta; la señal <b>tecnica.actualizada</b> re-lee el catálogo.
        </p>

        {#if errEvolucion}
          <div class="feedback error" role="alert">⚠ {errEvolucion}</div>
        {/if}
        {#if $errorMutacion}
          <div class="feedback error" role="alert">⚠ {$errorMutacion}</div>
        {/if}
      </div>

      <footer class="editor-pie">
        {#if !evolucionId}
          <button class="btn-secundario" disabled={$detalleLoading} on:click={buscarYEditar}>🔍 buscar y editar</button>
        {/if}
        <button class="btn-secundario" disabled={$mutacionesPendientes > 0} on:click={() => (editorEvolucionAbierto = false)}>
          Cancelar
        </button>
        <button class="btn-primario" disabled={!evolucionId || $mutacionesPendientes > 0} on:click={guardarEvolucion}>
          {$mutacionesPendientes > 0 ? 'Guardando…' : 'Declarar evolución'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .jefe-tecnicas {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 0.5rem;
    overflow: hidden;
    font-size: 13px;
    color: var(--color-text, #e4e4e7);
  }
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
  .cinta-soft {
    color: var(--color-text-muted, #a1a1aa);
    font-size: 0.68rem;
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
  .fila-tecnica {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    width: 100%;
    text-align: left;
    padding: 0.55rem 0.65rem;
    border: 1px solid var(--color-border, #3f3f46);
    border-radius: 8px;
    background: var(--color-surface, rgba(255, 255, 255, 0.02));
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .fila-tecnica:hover {
    border-color: rgba(245, 158, 11, 0.5);
  }
  .fila-cabecera {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .fila-nombre {
    font-weight: 600;
    font-size: 0.82rem;
  }
  .fila-desc {
    font-size: 0.72rem;
    color: var(--color-text-muted, #888);
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
  .ing-chip-soft {
    color: var(--color-text-muted, #a1a1aa);
  }
  .detalle {
    border: 1px solid var(--color-border, #3f3f46);
    border-radius: 8px;
    padding: 0.7rem 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    background: rgba(0, 0, 0, 0.15);
  }
  .detalle-cabecera {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .detalle-hueco {
    flex: 1;
  }
  .detalle-campo span {
    display: block;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-muted, #888);
    margin-bottom: 0.2rem;
  }
  .detalle-campo p {
    margin: 0;
    font-size: 0.78rem;
  }
  .detalle-campo pre {
    margin: 0;
    font-size: 0.72rem;
    white-space: pre-wrap;
    word-break: break-word;
    background: var(--color-surface, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--color-border, #333);
    border-radius: 6px;
    padding: 0.4rem 0.5rem;
  }
  .pasos {
    margin: 0;
    padding-left: 1.2rem;
    font-size: 0.78rem;
  }
  .muted-note {
    color: var(--color-text-muted, #888);
  }
  .history-lista,
  .diff-lista {
    margin: 0;
    padding-left: 1.1rem;
    font-size: 0.72rem;
    color: var(--color-text-muted, #a1a1aa);
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
  .diff-lista {
    margin: 0.35rem 0 0;
    padding-left: 1rem;
    font-size: 0.72rem;
  }
  .feedback.error {
    padding: 0.5rem 0.65rem;
    border-radius: 8px;
    font-size: 0.76rem;
    color: var(--color-error, #ef4444);
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.4);
  }
  .editor-overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  .editor-bloque {
    width: min(560px, 100%);
    max-height: 88vh;
    overflow-y: auto;
    background: var(--color-bg, #1a1a22);
    border: 1px solid var(--color-border, #3f3f46);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
  }
  .editor-cabecera {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.8rem 1rem;
    border-bottom: 1px solid var(--color-border, #333);
  }
  .editor-cabecera h3 {
    margin: 0;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .btn-cerrar {
    background: none;
    border: none;
    color: var(--color-text-muted, #888);
    font-size: 1rem;
    cursor: pointer;
  }
  .editor-cuerpo {
    padding: 0.9rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .campo {
    border: 1px solid var(--color-border, #3f3f46);
    border-radius: 8px;
    padding: 0.5rem 0.65rem;
    margin: 0;
  }
  .campo legend {
    font-size: 0.68rem;
    color: var(--color-text-muted, #a1a1aa);
    padding: 0 0.3rem;
  }
  .campo input,
  .campo textarea {
    width: 100%;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--color-border, #3f3f46);
    border-radius: 6px;
    color: var(--color-text, #e4e4e7);
    padding: 0.4rem 0.55rem;
    font: inherit;
    box-sizing: border-box;
  }
  .fila-buscador {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .nota-dato,
  .nota-euro {
    margin: 0;
    font-size: 0.72rem;
    color: var(--color-text-muted, #a1a1aa);
    line-height: 1.45;
  }
  .editor-pie {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--color-border, #333);
  }
  .btn-primario,
  .btn-secundario {
    padding: 0.45rem 0.9rem;
    border-radius: 8px;
    font: inherit;
    font-size: 0.78rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .btn-primario {
    font-weight: 600;
    background: var(--color-primary, #f59e0b);
    border: 1px solid var(--color-primary, #f59e0b);
    color: #111;
  }
  .btn-secundario {
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--color-border, #3f3f46);
    color: var(--color-text, #e4e4e7);
  }
  .btn-primario:disabled,
  .btn-secundario:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>