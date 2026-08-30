<script lang="ts">
  /**
   * CalendarioPanel — LA CARA DEL JEFE de la base del TIEMPO de producción/
   * distribución (F7, ciclo v2). Reescribe el panel de generación anterior:
   * agenda del día + ref-select de producto + editor-bloque (agendar producción).
   *
   * El módulo calendario es la BASE COMPARTIDA del tiempo de la panadería
   * (órgano agenda de Prisma): lo que el jefe declara aquí (días de salida ISO
   * 1..7 + margen de antelación horas) es lo que H2 (motor de validación),
   * encargos y cobro anticipado consumen por RPC. Editar aquí = re-agendar la
   * producción/distribución.
   *
   * Composición 3 capas (esquema-jefe de calendario):
   *   - CAPA 1 (SELECCIONAR): ref-select de PRODUCTO desde la carta (proyector
   *     productos.carta_completa) — nunca teclear el id. Conserva los que solo
   *     tienen calendario.
   *   - CAPA 2 (INFORMARSE): cinta-estado de la agenda del día (productos.leer
   *     → "n agendados · n salen HOY (lunes) · n con margen") + dictamen si una
   *     fecha de encargo cuadra (validar) + pulso de antelación (margen.leer).
   *   - CAPA 3 (DECLARAR, ROL JEFE): editor-bloque producto.actualizar — LA
   *     única escritura del módulo (ConfigCustodio). Chips de días ISO 1..7
   *     (L M X J V S D) + campo margen horas → agendarProduccion(). El dictamen
   *     {calendario} vuelve en la respuesta y la señal re-lee la agenda.
   *
   * Señal manda (R3): suscripción a calendario.producto.actualizado (1× por
   * producto agendado, ConfigCustodio) → re-lee productos.leer. Nunca recarga,
   * nunca estado optimista.
   *
   * LECCIÓN escandallo: TODOS los RPC llevan project_id inyectado (el store
   * usa pidActivo()); ConfigCustodio de calendario lee config por proyecto.
   *
   * Patrón del repo: IngredientesPanel (cara del jefe) — store + señales
   * dot-notation + debounce + error nombrado en el editor-bloque.
   */

  import { onMount } from 'svelte';
  import {
    calendarios,
    cinta,
    mutacionesPendientes,
    errorMutacion,
    catalogoProductos,
    productosAgenda,
    DIAS_ISO,
    nombreDia,
    loadCalendarios,
    loadCatalogoProductos,
    leerMargen,
    validarFecha,
    agendarProduccion,
    resetCalendario,
    initCalendarioSubscriptions,
    describeError,
    type Calendario,
    type DictamenValidar,
    type DictamenMargen
  } from './stores/calendario';
  import { activeProjectId } from '$lib/stores/projects';

  export let panelId: string = '';

  // ---- CAPA 1: ref-select de producto (proyector de la carta) ----
  let productoId = '';

  // ---- CAPA 2: cinta + dictámenes (INFORMARSE) ----
  let pulsoMargen: DictamenMargen | null = null;

  // ---- CAPA 3: editor-bloque (DECLARAR) ----
  let diasSel: number[] = [];
  let margenTexto = '';
  let guardando = false;
  let notaEditor: string | null = null;
  let notaTipo: 'ok' | 'error' = 'ok';

  // ---- H4: dictamen de fecha de encargo (validar, bajo demanda) ----
  let fechaDeseada = '';
  let dictamenValidar: DictamenValidar | null = null;
  let probando = false;

  /** Calendario actual del producto seleccionado (de la agenda ya leída). */
  $: selCal = productoId
    ? ($calendarios[productoId] as Calendario | undefined)
    : undefined;

  /** Los días de salida del producto seleccionado (para el editor, del agenda). */
  $: selDias = (selCal?.dias_salida as number[] | undefined) || [];

  function seleccionar(id: string): void {
    productoId = id;
    const cal = $calendarios[id];
    diasSel = cal?.dias_salida ? [...(cal.dias_salida as number[])] : [];
    margenTexto = typeof cal?.margen_antelacion_h === 'number'
      ? String(cal.margen_antelacion_h)
      : '';
    notaEditor = null;
    dictamenValidar = null;
    pulsoMargen = null;
    void leerMargen(id).then((d) => { pulsoMargen = d; });
  }

  function toggleDia(n: number): void {
    diasSel = diasSel.includes(n)
      ? diasSel.filter((d) => d !== n)
      : [...diasSel, n].sort((a, b) => a - b);
  }

  function nombreDe(id: string): string {
    return $productosAgenda.find((p) => p.id === id)?.nombre || id;
  }

  /** H3 · LA DECISIÓN: agendar la producción de un producto. */
  async function guardar(): Promise<void> {
    if (!productoId) return;
    if (diasSel.length === 0) {
      notaTipo = 'error';
      notaEditor = 'Marca al menos un día de salida.';
      return;
    }
    const margen = margenTexto.trim() === '' ? null : Number(margenTexto.replace(',', '.'));
    if (margen !== null && (!Number.isFinite(margen) || margen < 0)) {
      notaTipo = 'error';
      notaEditor = 'Margen no válido: indica horas >= 0.';
      return;
    }
    guardando = true;
    notaEditor = null;
    try {
      await agendarProduccion(productoId, {
        dias_salida: diasSel,
        margen_antelacion_h: margen
      }); // señal 1× re-lee la agenda (R3)
      notaTipo = 'ok';
      notaEditor = `Agendado: ${nombreDe(productoId)} sale ${diasSel
        .map((d) => DIAS_ISO.find((x) => x.n === d)?.corto)
        .join(' · ')} · margen ${margen === null ? 'sin declarar' : margen + 'h'}.`;
    } catch (err) {
      notaTipo = 'error';
      notaEditor = describeError(err);
    } finally {
      guardando = false;
    }
  }

  /** H4 · dictamen de fecha de encargo (validar — bajo demanda). */
  async function probar(): Promise<void> {
    if (!productoId || !fechaDeseada) return;
    probando = true;
    dictamenValidar = null;
    try {
      dictamenValidar = await validarFecha(productoId, fechaDeseada);
    } finally {
      probando = false;
    }
  }

  // ---- ciclo de vida + señales (R3) ----
  let cleanupSenal: (() => void) | null = null;

  onMount(() => {
    cleanupSenal = initCalendarioSubscriptions();
    return () => {
      if (cleanupSenal) cleanupSenal();
      resetCalendario();
    };
  });

  // Reaccionar al proyecto activo: cargar o vaciar (multi-tenant).
  let ultimoProjectId = '';
  $: {
    const pid = $activeProjectId;
    if (typeof pid === 'string' && pid && pid !== ultimoProjectId) {
      ultimoProjectId = pid;
      void loadCatalogoProductos();
      void loadCalendarios();
    } else if (!pid && ultimoProjectId) {
      ultimoProjectId = '';
      resetCalendario();
    }
  }
</script>

<div class="jefe-calendario" data-calendario-panel={panelId}>
  <!-- actor badge: la lente de rol -->
  <div class="actor-badge">
    <span class="badge-icon">CEO</span>
    <span class="badge-label">Vista Jefe</span>
    <span class="badge-scope">agenda de producción/distribución · base compartida del tiempo (la consume H2, encargos, cobro anticipado)</span>
    {#if $mutacionesPendientes > 0}
      <span class="badge-sync">sincronizando…</span>
    {/if}
  </div>

  {#if $errorMutacion}
    <div class="cinta-error">{$errorMutacion}</div>
  {/if}

  {#if !$activeProjectId}
    <div class="vacio">sin proyecto activo</div>
  {:else}
    <!-- CAPA 1 · ref-select de producto -->
    <div class="bloque">
      <label class="etiqueta" for="cal-prod">Producto</label>
      <select
        id="cal-prod"
        class="ref-select"
        bind:value={productoId}
        on:change={() => seleccionar(productoId)}
      >
        <option value="" disabled>elige un producto…</option>
        {#each $productosAgenda as p (p.id)}
          <option value={p.id}>{p.nombre}</option>
        {/each}
      </select>
    </div>

    <!-- CAPA 2 · cinta-estado: el pulso de la agenda sin navegar -->
    <div class="cinta-estado">
      <span class="pulso">{$cinta.total} agendados</span>
      <span class="pulso pulso-hoy">{$cinta.salen_hoy} salen hoy ({$cinta.dia_hoy})</span>
      <span class="pulso">{$cinta.con_margen} con margen</span>
    </div>

    {#if productoId}
      <!-- CAPA 2 · detalle del producto seleccionado (de la agenda ya leída) -->
      <div class="detalle">
        <span class="fila">
          <span class="k">Días de salida</span>
          <span class="v">{selDias.length ? selDias.map(nombreDia).join(', ') : 'sin agendar'}</span>
        </span>
        <span class="fila">
          <span class="k">Margen de antelación</span>
          <span class="v">
            {typeof selCal?.margen_antelacion_h === 'number' ? selCal.margen_antelacion_h + ' h' : (pulsoMargen?.margen_antelacion_h !== null && pulsoMargen?.margen_antelacion_h !== undefined ? pulsoMargen.margen_antelacion_h + ' h' : 'sin declarar')}
          </span>
        </span>
      </div>

      <!-- CAPA 3 · editor-bloque: AGENDAR la producción (LA DECISIÓN) -->
      <div class="bloque">
        <label class="etiqueta" for="cal-dias">Días de salida (1=Lun..7=Dom)</label>
        <div class="chips" id="cal-dias">
          {#each DIAS_ISO as d (d.n)}
            <button
              type="button"
              class="chip {diasSel.includes(d.n) ? 'activo' : ''}"
              on:click={() => toggleDia(d.n)}
              title={d.largo}
            >{d.corto}</button>
          {/each}
        </div>
      </div>

      <div class="bloque fila">
        <div class="campo">
          <label class="etiqueta" for="cal-margen">Margen de antelación (horas ≥ 0)</label>
          <input
            id="cal-margen"
            type="text"
            inputmode="decimal"
            bind:value={margenTexto}
            class="input"
            placeholder="p.ej. 24 (vacío = sin declarar)"
          />
        </div>
        <button
          type="button"
          class="btn primario"
          on:click={guardar}
          disabled={guardando}
        >{guardando ? 'Guardando…' : 'Agendar producción'}</button>
      </div>

      {#if notaEditor}
        <div class="aviso {notaTipo}">{notaEditor}</div>
      {/if}

      <div class="separador"></div>

      <!-- CAPA 2 · dictamen: ¿cuadra una fecha de encargo con la agenda? -->
      <div class="bloque">
        <label class="etiqueta" for="cal-fecha">Comprobar una fecha de encargo ({nombreDe(productoId)})</label>
        <div class="fila">
          <input
            id="cal-fecha"
            type="date"
            bind:value={fechaDeseada}
            class="campo"
          />
          <button
            type="button"
            class="btn"
            on:click={probar}
            disabled={probando || !fechaDeseada}
          >{probando ? 'Comprobando…' : '✔ Probar'}</button>
        </div>
        {#if dictamenValidar}
          <div class="valido {dictamenValidar.valido ? 'ok' : 'no'}">
            {#if dictamenValidar.valido}
              ✅ <strong>{nombreDe(productoId)}</strong> sale el {dictamenValidar.dia_semana}: fecha válida.
            {:else}
              ❌ <strong>{nombreDe(productoId)}</strong> — {dictamenValidar.motivo}.
              {#if dictamenValidar.propuesta?.fecha}
                Día válido más cercano: <strong>{dictamenValidar.propuesta.fecha} ({dictamenValidar.propuesta.dia})</strong>.
              {:else}
                No hay día de salida en el horizonte próximo.
              {/if}
            {/if}
          </div>
        {/if}
      </div>
    {:else}
      <div class="vacio">
        {#if $cinta.total === 0}
          No hay productos con calendario todavía.
        {:else}
          Elige un producto para ver/editar su agenda.
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .jefe-calendario { display: flex; flex-direction: column; gap: 1rem; padding: 0.75rem; }
  .vacio { color: var(--color-text-muted, #888); font-size: 0.9rem; }

  .actor-badge { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; font-size: 0.78rem; }
  .badge-icon { background: #2563eb; color: #fff; border-radius: 0.3rem; padding: 0.1rem 0.4rem; font-weight: 700; font-size: 0.7rem; }
  .badge-label { font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
  .badge-scope { color: var(--color-text-muted, #888); }
  .badge-sync { color: #2563eb; font-style: italic; }
  .cinta-error { background: rgba(220, 70, 70, 0.12); border: 1px solid rgba(220,70,70,0.4); color: #ff9a9a; border-radius: 0.4rem; padding: 0.5rem 0.7rem; font-size: 0.85rem; }

  .bloque { display: flex; flex-direction: column; gap: 0.4rem; }
  .etiqueta { font-size: 0.78rem; color: var(--color-text-muted, #888); font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
  .ref-select, .input, .campo {
    background: var(--color-bg-elevated, #1c1c22); color: var(--color-text, #e5e5e5);
    border: 1px solid var(--color-border, #333); border-radius: 0.4rem;
    padding: 0.45rem 0.6rem; font-size: 0.9rem; width: 100%;
  }
  .chips { display: flex; gap: 0.35rem; flex-wrap: wrap; }
  .chip {
    width: 2.2rem; height: 2.2rem; border-radius: 0.45rem;
    background: var(--color-bg-elevated, #1c1c22); color: var(--color-text-muted, #999);
    border: 1px solid var(--color-border, #333); font-weight: 700; font-size: 0.95rem; cursor: pointer;
    transition: all 0.12s;
  }
  .chip.activo { background: #2563eb; border-color: #2563eb; color: #fff; }
  .fila { display: flex; gap: 0.5rem; align-items: center; }

  .cinta-estado { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .pulso { border-radius: 0.35rem; padding: 0.3rem 0.6rem; font-size: 0.8rem; background: var(--color-bg-elevated, #1c1c22); color: var(--color-text, #e5e5e5); }
  .pulso-hoy { background: rgba(37, 99, 235, 0.15); border: 1px solid rgba(37,99,235,0.4); }

  .detalle { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.5rem 0.7rem; border-radius: 0.4rem; background: var(--color-bg-elevated, #1c1c22); font-size: 0.85rem; }
  .fila { display: flex; justify-content: space-between; }
  .k { color: var(--color-text-muted, #888); }
  .v { color: var(--color-text, #e5e5e5); }

  .btn {
    background: var(--color-bg-elevated, #1c1c22); color: var(--color-text, #e5e5e5);
    border: 1px solid var(--color-border, #333); border-radius: 0.4rem;
    padding: 0.45rem 0.8rem; font-size: 0.85rem; cursor: pointer; white-space: nowrap;
  }
  .btn:disabled { opacity: 0.45; cursor: default; }
  .btn.primario { background: #2563eb; border-color: #2563eb; color: #fff; }

  .aviso { border-radius: 0.4rem; padding: 0.5rem 0.7rem; font-size: 0.85rem; }
  .aviso.ok { background: rgba(56, 211, 159, 0.12); border: 1px solid rgba(56,211,159,0.4); color: #6ee7b7; }
  .aviso.error { background: rgba(220, 70, 70, 0.12); border: 1px solid rgba(220,70,70,0.4); color: #ff9a9a; }
  .separador { border-top: 1px solid var(--color-border, #2a2a30); }

  .valido { border-radius: 0.4rem; padding: 0.55rem 0.7rem; font-size: 0.88rem; margin-top: 0.4rem; }
  .valido.ok { background: rgba(38, 211, 159, 0.12); border: 1px solid rgba(38,211,159,0.4); color: #6ee7b7; }
  .valido.no { background: rgba(220, 70, 70, 0.12); border: 1px solid rgba(220,70,70,0.4); color: #ffc4a3; }
</style>
