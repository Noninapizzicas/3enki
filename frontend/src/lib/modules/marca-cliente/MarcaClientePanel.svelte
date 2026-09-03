<script lang="ts">
  /**
   * MarcaClientePanel — EL PANEL DEL JEFE de la relación con el cliente (F7,
   * composición 3 capas según esquema-jefe/ de marca-cliente):
   *
   *   1. INFORMARSE   marca.reglas.leer: la relación vigente por bloques
   *                   (voz/presencia/clientes/fidelizacion), distinguiendo lo
   *                   declarado de lo "por declarar" (nulls/[]). SIN 404
   *                   (INV3): la falta de reglas es estado NOMBRADO, no error.
   *   2. DECLARAR     editor-bloque VOZ (tono + valores + tradición), editor-
   *                   bloque PRESENCIA (canales) y editor-bloque FIDELIZACIÓN
   *                   (activa + puntos_por_euro + recompensas) → reglas.actualizar
   *                   enviando SOLO su bloque (INV2: validación por campo,
   *                   deep-merge preserva el resto).
   *   3. DICTAMEN     doble confirmación (R2+R3): el dictamen llega EN LA
   *                   RESPUESTA de la mutación (200 { reglas } — INV4) y la
   *                   señal marca.reglas.actualizadas (VERIFICADA: reflejo
   *                   index.js L132 → ConfigCustodio → eventBus core → MQTT
   *                   core/STAR/events/…) re-lee el informe con debounce 60ms.
   *                   NUNCA recarga ni asume.
   *
   * R2 — la UI jamás escribe el store: los borradores se rellenan desde la
   *      LECTURA vigente; solo las respuestas RPC escriben.
   * Moneda — SIN €: solo fidelizacion.puntos_por_euro (número > 0 o null).
   *
   * Molde: carta-marketing/CartaMarketingPanel.svelte (informe + editor-bloque
   * + chips + dictamen) — el mismo patrón de declaración por bloques.
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
    resetMarcaCliente,
    declararVoz,
    declararPresencia,
    declararFidelizacion,
    initMarcaSubscriptions,
    type MarcaVoz,
    type MarcaPresencia,
    type MarcaFidelizacion,
    type DictamenDeclaracion
  } from './stores/marca-cliente';
  import { sessionProjectId } from '$lib/stores/sessionProject';

  export let panelId: string = '';

  // ---- editores-bloque abiertos (1 modal por bloque) ----
  let editorVozAbierto = false;
  let editorPresenciaAbierto = false;
  let editorFidelizacionAbierto = false;

  // ---- borradores VOZ ----
  let tonoBorrador = '';
  let valoresCsv = '';
  let tradicionBorrador = '';

  // ---- borradores PRESENCIA ----
  let canalesCsv = '';

  // ---- borradores FIDELIZACIÓN ----
  let fidelActiva = false;
  let puntosPorEuro = '';
  let recompensasCsv = '';

  // errores de VALIDACIÓN por editor (los de red los nombra errorMutacion)
  let errVoz = '';
  let errPresencia = '';
  let errFidelizacion = '';

  /** DICTAMEN por editor, construido desde la RESPUESTA de la mutación (INV4). */
  interface DictamenEditor {
    bloque: string;
    texto: string;
  }
  let dictamen: DictamenEditor | null = null;

  /* Señal-refresh (R3): init monta la suscripción marca.reglas.actualizadas
   * con debounce 60ms; devuelve su cleanup. */
  let cleanupSenal: (() => void) | null = null;

  onMount(() => {
    cleanupSenal = initMarcaSubscriptions();
    return () => {
      if (cleanupSenal) cleanupSenal();
      resetMarcaCliente();
    };
  });

  // Reacción al proyecto activo: cargar relación o vaciar (multi-tenant).
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
      resetMarcaCliente();
    }
  }

  function cerrarEditores(): void {
    editorVozAbierto = false;
    editorPresenciaAbierto = false;
    editorFidelizacionAbierto = false;
    dictamen = null;
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (editorVozAbierto) editorVozAbierto = false;
      else if (editorPresenciaAbierto) editorPresenciaAbierto = false;
      else if (editorFidelizacionAbierto) editorFidelizacionAbierto = false;
    }
  }

  // ---- editor VOZ (borrador desde lo VIGENTE — R2) ----
  function abrirEditorVoz(): void {
    const voz: MarcaVoz = get(marcaStore)?.voz ?? {};
    tonoBorrador = typeof voz.tono === 'string' ? voz.tono : (voz.tono ?? '');
    valoresCsv = csvFromArray(voz.valores);
    tradicionBorrador = typeof voz.tradicion_referencia === 'string' ? voz.tradicion_referencia : (voz.tradicion_referencia ?? '');
    errVoz = '';
    dictamen = null;
    editorVozAbierto = true;
  }

  function guardarVoz(): void {
    if (!tonoBorrador.trim()) {
      errVoz = 'declara al menos el tono';
      return;
    }
    void declararVoz({
      tono: tonoBorrador.trim(),
      valores: arrayFromCsv(valoresCsv),
      tradicion_referencia: tradicionBorrador.trim() || null
    })
      .then((d) => {
        editorVozAbierto = false; // el refresco completo lo da la señal (R3)
        dictamen = dictamenDe(d); // dictamen de la RESPUESTA (INV4)
        errVoz = '';
      })
      .catch(() => {
        /* error ya nombrado en errorMutacion → el editor permanece abierto */
      });
  }

  // ---- editor PRESENCIA ----
  function abrirEditorPresencia(): void {
    const pres: MarcaPresencia = get(marcaStore)?.presencia ?? {};
    canalesCsv = csvFromArray(pres.canales);
    errPresencia = '';
    dictamen = null;
    editorPresenciaAbierto = true;
  }

  function guardarPresencia(): void {
    if (!canalesCsv.trim()) {
      errPresencia = 'lista al menos un canal';
      return;
    }
    void declararPresencia({
      canales: arrayFromCsv(canalesCsv)
    })
      .then((d) => {
        editorPresenciaAbierto = false;
        dictamen = dictamenDe(d);
        errPresencia = '';
      })
      .catch(() => {
        /* error ya nombrado en errorMutacion → el editor permanece abierto */
      });
  }

  // ---- editor FIDELIZACIÓN ----
  function abrirEditorFidelizacion(): void {
    const fid: MarcaFidelizacion = get(marcaStore)?.fidelizacion ?? {};
    fidelActiva = !!fid.activa;
    puntosPorEuro = fid.puntos_por_euro != null ? String(fid.puntos_por_euro) : '';
    recompensasCsv = csvFromArray(fid.recompensas);
    errFidelizacion = '';
    dictamen = null;
    editorFidelizacionAbierto = true;
  }

  function guardarFidelizacion(): void {
    const ppe = puntosPorEuro.trim();
    let ppeNumero: number | null = null;
    if (ppe) {
      const n = Number(ppe);
      if (!isFinite(n) || n <= 0) {
        errFidelizacion = 'puntos por euro debe ser un número > 0';
        return;
      }
      ppeNumero = n;
    }
    void declararFidelizacion({
      activa: fidelActiva,
      puntos_por_euro: fidelActiva && ppeNumero != null ? ppeNumero : null,
      recompensas: arrayFromCsv(recompensasCsv)
    })
      .then((d) => {
        editorFidelizacionAbierto = false;
        dictamen = dictamenDe(d);
        errFidelizacion = '';
      })
      .catch(() => {
        /* error ya nombrado en errorMutacion → el editor permanece abierto */
      });
  }

  /** Dictamen legible desde la respuesta de reglas.actualizar (nunca del local). */
  function dictamenDe(d: DictamenDeclaracion): DictamenEditor {
    const r = d.reglas ?? {};
    const voz = r.voz ?? {};
    const pres = r.presencia ?? {};
    const fid = r.fidelizacion ?? {};
    switch (d.bloque) {
      case 'voz':
        return {
          bloque: d.bloque,
          texto: `voz persistida — tono ${voz.tono || 'por declarar'}${voz.valores?.length ? ` · ${voz.valores.length} valores` : ''}${voz.tradicion_referencia ? ` · trad. \"${voz.tradicion_referencia}\"` : ''}`
        };
      case 'presencia':
        return {
          bloque: d.bloque,
          texto: `presencia persistida — ${pres.canales?.length ? pres.canales.length + ' canal(es): ' + pres.canales.join(', ') : 'por declarar'}`
        };
      case 'fidelizacion':
        return {
          bloque: d.bloque,
          texto: `fidelización ${fid.activa ? 'ACTIVA' : 'desactivada'}${fid.activa && fid.puntos_por_euro != null ? ` · ${fid.puntos_por_euro} ptos/€` : ''}${fid.recompensas?.length ? ` · ${fid.recompensas.length} recompensa(s)` : ''}`
        };
      default:
        return { bloque: d.bloque, texto: `${d.bloque}: relación persistida` };
    }
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="jefe-marca" data-marca-cliente-panel={panelId}>
  <!-- ══════════ CINTA-ESTADO ══════════ -->
  <div class="cinta-estado">
    {#if $lecturaError}
      <span class="cinta-nombre error" title={$lecturaError}>⚠ relación no disponible</span>
    {:else if $lecturaLoading && !$marcaStore}
      <span class="cinta-nombre muted">leyendo relación con el cliente…</span>
    {:else if $mutacionesPendientes > 0}
      <span class="sync" aria-live="polite">⏳ sincronizando…</span>
    {:else if $marcaStore}
      <span class="cinta-nombre muted">🚻 relación con el cliente</span>
      <span class="cinta-num">{$cinta.porDeclarar}</span> palancas por declarar
    {:else}
      <span class="cinta-nombre muted">sin proyecto activo</span>
    {/if}
  </div>

  <!-- ══════════ CAPA 1+3 · INFORMARSE (reglas.leer, ordenado por bloques) ══════════ -->
  <div class="zona-informe">
    {#if $lecturaError}
      <div class="estado error" role="alert">⚠ No se pudo leer la relación: {$lecturaError}</div>
    {:else if $marcaStore}
      <div class="informe">
        <div class="informe-cabecera">
          {#if $cinta.sinMarca}
            <span class="chip chip-sistema" title="reglas.leer respondió con el DEFAULT (marca inexistente)">por declarar ⚙</span>
          {:else}
            <span class="chip chip-jefe" title="reglas.leer respondió con persistencia — la relación está declarándose">jefe ✍</span>
          {/if}
          <span class="informe-sub">{$cinta.hayDeclaracion ? 'relación en curso' : 'nada declarado aún'}</span>
          <button class="btn-secundario" on:click={abrirEditorFidelizacion}>🎁 fidelización</button>
          <button class="btn-secundario" on:click={abrirEditorPresencia}>📡 presencia</button>
          <button class="btn-primario" on:click={abrirEditorVoz}>🗣 voz</button>
        </div>

        {#if $cinta.sinMarca}
          <p class="aviso-default">
            <b>por declarar</b>: todavía no has declarado la relación con el
            cliente. Declara la <b>voz</b> (el tono con el que tratas) para
            arrancar. No hay error que reparar (no existe el 404): es una
            declaración pendiente.
          </p>
        {/if}

        <div class="palancas-informe">
          <div class="palanca">
            <div class="palanca-titulo">🗣 Voz — cómo tratas</div>
            <div class="lista-chips">
              <span class="ing-chip {$cinta.hayDeclaracion && $marcaStore.voz?.tono ? 'ing-chip-si' : 'ing-chip-no'}">
                tono: {($marcaStore.voz?.tono || 'por declarar')}
              </span>
              {#if $marcaStore.voz?.valores?.length}
                <span class="ing-chip">{$marcaStore.voz.valores.length} valores: {$marcaStore.voz.valores.join(', ')}</span>
              {/if}
              {#if $marcaStore.voz?.tradicion_referencia}
                <span class="ing-chip">tradición: {$marcaStore.voz.tradicion_referencia}</span>
              {/if}
            </div>
          </div>

          <div class="palanca">
            <div class="palanca-titulo">📡 Presencia — dónde estás</div>
            <div class="lista-chips">
              {#if $marcaStore.presencia?.canales?.length}
                {#each $marcaStore.presencia.canales as canal}
                  <span class="ing-chip">{canal}</span>
                {/each}
              {:else}
                <span class="ing-chip ing-chip-no">canales por declarar</span>
              {/if}
            </div>
          </div>

          <div class="palanca">
            <div class="palanca-titulo">🎁 Fidelización — el programa de puntos</div>
            <div class="lista-chips">
              {#if $marcaStore.fidelizacion?.activa}
                <span class="ing-chip ing-chip-si">activa</span>
                {#if $marcaStore.fidelizacion?.puntos_por_euro != null}
                  <span class="ing-chip">{$marcaStore.fidelizacion.puntos_por_euro} ptos/€</span>
                {/if}
                {#if $marcaStore.fidelizacion?.recompensas?.length}
                  <span class="ing-chip">{$marcaStore.fidelizacion.recompensas.length} recompensa(s)</span>
                {/if}
              {:else}
                <span class="ing-chip ing-chip-no">desactivada — por declarar</span>
              {/if}
            </div>
          </div>

          <div class="palanca">
            <div class="palanca-titulo">👥 Clientes — base de datos</div>
            <div class="lista-chips">
              {#if $marcaStore.clientes?.lista?.length}
                <span class="ing-chip">{$marcaStore.clientes.lista.length} cliente(s)</span>
              {:else}
                <span class="ing-chip ing-chip-no">sin clientes aún</span>
              {/if}
              <span class="ing-chip" title="el alta de clientes es consulta puntual de utilización (POS) — no parte del panel del jefe">consulta en el POS (utilización)</span>
            </div>
          </div>
        </div>

        {#if dictamen}
          <div class="dictamen valida" aria-live="polite">
            ✔ {dictamen.texto}
            <em>· señal marca.reglas.actualizadas releyendo el informe (debounce 60ms)</em>
          </div>
        {:else if $errorMutacion}
          <div class="feedback error" role="alert">⚠ {$errorMutacion}</div>
        {/if}
      </div>
    {:else}
      <div class="estado muted">
        {#if $lecturaLoading}leyendo relación…{:else}elige un negocio activo para leer su relación con el cliente.{/if}
      </div>
    {/if}
  </div>
</div>

<!-- ══════════ EDITOR-BLOQUE · VOZ ══════════ -->
{#if editorVozAbierto}
  <div
    class="editor-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Declarar la voz con el cliente"
    tabindex="-1"
    on:mousedown={(e) => {
      if (e.target === e.currentTarget) editorVozAbierto = false;
    }}
  >
    <div class="editor-bloque">
      <header class="editor-cabecera">
        <h3>
          🗣 Voz con el cliente
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
          <legend>① tono (cómo tratas con el cliente — palabra o frase)</legend>
          <input type="text" placeholder="cercana, gamberra, elegante..." bind:value={tonoBorrador} />
        </fieldset>

        <fieldset class="campo">
          <legend>② valores (separados por coma)</legend>
          <input type="text" placeholder="hecho a mano, fresco, recetas de siempre" bind:value={valoresCsv} />
        </fieldset>

        <fieldset class="campo">
          <legend>③ tradición de referencia</legend>
          <input type="text" placeholder="la pizza napolitana de Nápoles" bind:value={tradicionBorrador} />
        </fieldset>

        <p class="nota-euro">
          🗣 la voz la bebe TODO el trato con el cliente (copy, canales, atención).
          Se envía SOLO el bloque <b>voz</b> (INV2). El dictamen llega en la
          respuesta; la señal re-lee el informe.
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

<!-- ══════════ EDITOR-BLOQUE · PRESENCIA ══════════ -->
{#if editorPresenciaAbierto}
  <div
    class="editor-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Declarar la presencia digital"
    tabindex="-1"
    on:mousedown={(e) => {
      if (e.target === e.currentTarget) editorPresenciaAbierto = false;
    }}
  >
    <div class="editor-bloque">
      <header class="editor-cabecera">
        <h3>
          📡 Presencia digital
          {#if $cinta.sinMarca}
            <span class="chip chip-sistema">declara por 1ª vez</span>
          {:else}
            <span class="chip chip-jefe">edita lo declarado</span>
          {/if}
        </h3>
        <button class="btn-cerrar" title="Cerrar (Esc)" on:click={() => (editorPresenciaAbierto = false)}>✕</button>
      </header>

      <div class="editor-cuerpo">
        <fieldset class="campo">
          <legend>① canales activos (separados por coma)</legend>
          <input type="text" placeholder="web, instagram, whatsapp, glovo" bind:value={canalesCsv} />
        </fieldset>

        <p class="nota-euro">
          📡 dónde está tu marca en digital. Se envía SOLO el bloque
          <b>presencia</b> (INV2). El dictamen llega en la respuesta; la señal
          re-lee el informe.
        </p>

        {#if errPresencia}
          <div class="feedback error" role="alert">⚠ {errPresencia}</div>
        {/if}
        {#if $errorMutacion}
          <div class="feedback error" role="alert">⚠ {$errorMutacion}</div>
        {/if}
      </div>

      <footer class="editor-pie">
        <button class="btn-secundario" disabled={$mutacionesPendientes > 0} on:click={() => (editorPresenciaAbierto = false)}>
          Cancelar
        </button>
        <button class="btn-primario" disabled={$mutacionesPendientes > 0} on:click={guardarPresencia}>
          {$mutacionesPendientes > 0 ? 'Guardando…' : 'Declarar presencia'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<!-- ══════════ EDITOR-BLOQUE · FIDELIZACIÓN ══════════ -->
{#if editorFidelizacionAbierto}
  <div
    class="editor-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Declarar el programa de fidelización"
    tabindex="-1"
    on:mousedown={(e) => {
      if (e.target === e.currentTarget) editorFidelizacionAbierto = false;
    }}
  >
    <div class="editor-bloque">
      <header class="editor-cabecera">
        <h3>
          🎁 Programa de fidelización
          <span class="chip chip-jefe">{fidelActiva ? 'activo' : 'inactivo'}</span>
        </h3>
        <button class="btn-cerrar" title="Cerrar (Esc)" on:click={() => (editorFidelizacionAbierto = false)}>✕</button>
      </header>

      <div class="editor-cuerpo">
        <fieldset class="campo">
          <legend>① activar programa</legend>
          <label class="check-line">
            <input type="checkbox" bind:checked={fidelActiva} />
            la fidelización está activa
          </label>
        </fieldset>

        <fieldset class="campo">
          <legend>② puntos por euro (número &gt; 0, opcional)</legend>
          <input type="text" inputmode="decimal" placeholder="1" bind:value={puntosPorEuro} />
        </fieldset>

        <fieldset class="campo">
          <legend>③ recompensas (separadas por coma)</legend>
          <input type="text" placeholder="café gratis a los 50 puntos, 10% descuento" bind:value={recompensasCsv} />
        </fieldset>

        <p class="nota-euro">
          🎁 si no activas, el campo de puntos queda en null y no se acumulan
          puntos. Se envía SOLO el bloque <b>fidelizacion</b> (INV2). El
          dictamen llega en la respuesta; la señal re-lee el informe.
        </p>

        {#if errFidelizacion}
          <div class="feedback error" role="alert">⚠ {errFidelizacion}</div>
        {/if}
        {#if $errorMutacion}
          <div class="feedback error" role="alert">⚠ {$errorMutacion}</div>
        {/if}
      </div>

      <footer class="editor-pie">
        <button class="btn-secundario" disabled={$mutacionesPendientes > 0} on:click={() => (editorFidelizacionAbierto = false)}>
          Cancelar
        </button>
        <button class="btn-primario" disabled={$mutacionesPendientes > 0} on:click={guardarFidelizacion}>
          {$mutacionesPendientes > 0 ? 'Guardando…' : 'Declarar fidelización'}
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
  .campo input {
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
  .check-line {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.78rem;
    color: var(--color-text, #e4e4e7);
    cursor: pointer;
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
