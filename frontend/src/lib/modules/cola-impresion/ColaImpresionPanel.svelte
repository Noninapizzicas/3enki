<script lang="ts">
  /**
   * ColaImpresionPanel — la CINTA DE LA COLA + MANO DEL JEFE del taller 3D (F7, prisma-universal).
   *
   * REEMPLAZA el envoltorio genérico (BlueprintForm): panel ESPECÍFICO con store MQTT,
   * siguiendo el patrón de HistorialImpresionesPanel / CatalogoModelosPanel (3ª iteración
   * de la práctica F7).
   *
   * EL JEFE AQUÍ ESCUCHA (escritor-reordenador-disparador): a diferencia de historial
   * (jefe LECTOR puro) y catalogo (jefe registrador único), cola-impresion da al dueño
   * TRES gestos de decisión reales (esquema-jefe rol JEFE):
   *   - ENTRAR pieza (entrar, ROL JEFE): la escritura clave del custodio (append →
   *     cola.entrada). Editor-bloque multi-campo en un modal.
   *   - REORDENAR pendiente (reordenar, ROL JEFE): la mano del dueño sobre la prioridad
   *     del motor _ordenar. Subir/bajar una pendiente a una posición (SOLO pendientes).
   *   - SIGUIENTE (siguiente, ROL JEFE disparador): extrae el que toca según el motor.
   *     cola.extraccion confirma y avanza; cola.vacia avisa si no hay trabajo.
   *   - LONGITUD (neutro) → cabecera de pulso (n pendientes · total) + materialCargado badge.
   *
   * F7 ROL TRABAJADOR (SUMAR, no duplicar): una segunda pestaña del mismo panel — "Trabajador"
   * — con la cara del OPERADOR (esquema-trabajador F6), un LECTOR casi puro de la cinta:
   *   - cabecera de pulso (longitud → n pendientes · total · completadas) + materialCargado.
   *   - cinta "qué viene" (listar): pieza EN CURSO (imprimiendo) + la siguiente pendiente a
   *     preparar, con su MATERIAL (clave para el rollo) y estado (🖨️/🔵/✅/🗑️), + cinta completa.
   *   - aviso de próximo cambio de filamento (pieza pendiente con material ≠ cargado, [hueco d]).
   *   - SIN gestos de escritura: el trabajador NO ve entrar/reordenar/siguiente (esos son del
   *     JEFE). Refresco en vivo por las señales cola.entrada/extraccion/reordenada/vacia.
   *
   * La cola NUNCA decide qué imprimir (invariante 6): solo ordena lo aprobado. La vista
   * muestra el ORDEN PROPUESTO por el motor, no una lista cruda. El item cabeza de los
   * pendientes es "siguiente a imprimir".
   *
   * Composición:
   *   - CABECERA de pulso: n pendientes · total en cola + materialCargado (badge).
   *   - CINTA de la cola: filas/tarjetas de cada pieza en su orden (nombre, material,
   *     urgencia, tamaño). Estados de pieza con lenguaje visual color=estado
   *     (pendiente 🔵 / imprimiendo 🖨️ / hecho ✅ / retirada 🗑️), icono=entidad (🖨️).
   *   - Control subir/bajar sobre cada pendiente (reordenar → pos).
   *   - Acción "Siguiente a imprimir" (siguiente).
   *   - Modal de alta (+ pieza → entrar): modelo_id, nombre, material, urgencia, tamaño.
   *   - Estados: cargando → vacío ("cola vacía — entra la primera pieza" con icono) → datos.
   *   - REFRESCO EN VIVO: cola.entrada/extraccion/reordenada/vacia re-leen la cinta sin recargar.
   */

  import { onMount } from 'svelte';
  import {
    itemsCola,
    pendientesCola,
    materialCargado,
    totalCola,
    colaLoading,
    colaError,
    mutacionesPendientes,
    ultimaAccion,
    colaVacia,
    loadCola,
    resetCola,
    initColaSubscriptions,
    entrarPieza,
    siguientePieza,
    reordenarPieza,
    describeError,
    type ItemCola,
    type EstadoCola,
    type ColaAlta
  } from './stores/cola';
  import { sessionProjectId } from '$lib/stores/sessionProject';

  export let panelId: string = '';

  // ---- modal de alta (+ pieza) ----
  let altaAbierta = false;
  let altaBusy = false;
  let altaError: string | null = null;
  let altaModeloId = '';
  let altaNombre = '';
  let altaMaterial = '';
  let altaUrgenciaStr = '3';
  let altaTamanoStr = '';

  /* Suscripción a las señales pareadas — R3. */
  let cleanupSenal: (() => void) | null = null;

  onMount(() => {
    cleanupSenal = initColaSubscriptions();
    return () => {
      if (cleanupSenal) cleanupSenal();
      resetCola();
    };
  });

  // Reaccionar al proyecto activo: cargar o vaciar (multi-tenant).
  let ultimoProjectId = '';
  $: {
    const pid = $sessionProjectId;
    if (typeof pid === 'string' && pid && pid !== ultimoProjectId) {
      ultimoProjectId = pid;
      void loadCola(pid);
    } else if (!pid && ultimoProjectId) {
      ultimoProjectId = '';
      resetCola();
    }
  }

  // ---- pestaña de rol (Jefe | Trabajador) — la cara del TRABAJADOR se SUMA al panel ----
  // Convención F7 (prisma-universal): SUMAR, nunca reemplazar ni duplicar. Un solo
  // ColaImpresionPanel con la cara del jefe (gestos) + la del trabajador (lector).
  let rolActivo: 'jefe' | 'trabajador' = 'jefe';

  // ---- derivados de la cara TRABAJADOR (LECTOR de la cinta, esquema-trabajador F6) ----
  // La pieza en curso de la impresora (imprimiendo) o null.
  $: enCurso = $itemsCola.find((i) => i.estado === 'imprimiendo') ?? null;
  // La siguiente pendiente a preparar (el que toca si la máquina estuviera libre).
  $: siguienteParaPreparar = $pendientesCola.find((i) => i.estado === 'pendiente') ?? null;
  // [LECTURA, hueco (d)] la primera pieza pendiente cuyo material difiere del cargado
  // → próximo cambio de rollo que anticipar (consulta, nunca escritura).
  $: proximoCambioFilamento = (() => {
    const actual = enCurso?.material || $materialCargado || null;
    if (!actual || actual === 'desconocido') return null;
    return (
      $pendientesCola.find(
        (i) => i.material && i.material !== 'desconocido' && i.material !== actual
      ) ?? null
    );
  })();
  // Piezas ya terminadas / retiradas (pie de cinta del trabajador).
  $: terminadasCola = $itemsCola.filter((i) => i.estado === 'hecho' || i.estado === 'retirada').length;

  // ---- gesto ENTRAR ----
  function abrirAlta(): void {
    altaAbierta = true;
    altaBusy = false;
    altaError = null;
    altaModeloId = '';
    altaNombre = '';
    altaMaterial = '';
    altaUrgenciaStr = '3';
    altaTamanoStr = '';
  }
  function cerrarAlta(): void {
    if (altaBusy) return;
    altaAbierta = false;
  }
  async function ejecutarAlta(): Promise<void> {
    const pid = $sessionProjectId;
    if (!pid) return;
    if (!altaModeloId.trim() || !altaNombre.trim()) {
      altaError = 'modelo_id y nombre son obligatorios';
      return;
    }
    altaBusy = true;
    altaError = null;
    try {
      const datos: ColaAlta = {
        modelo_id: altaModeloId.trim(),
        nombre: altaNombre.trim(),
        material: altaMaterial.trim() || undefined,
        urgencia: Math.min(5, Math.max(1, Number(altaUrgenciaStr) || 1)),
        tamano: altaTamanoStr.trim() ? Number(altaTamanoStr) : undefined
      };
      await entrarPieza(pid, datos);
      altaAbierta = false; // la señal cola.entrada re-lee la cinta (R3)
    } catch (err) {
      altaError = describeError(err);
    } finally {
      altaBusy = false;
    }
  }

  // ---- gesto SIGUIENTE ----
  let siguienteBusy = false;
  let siguienteError: string | null = null;
  async function ejecutarSiguiente(): Promise<void> {
    const pid = $sessionProjectId;
    if (!pid) return;
    siguienteBusy = true;
    siguienteError = null;
    try {
      await siguientePieza(pid);
    } catch (err) {
      siguienteError = describeError(err);
    } finally {
      siguienteBusy = false;
    }
  }

  // ---- gesto REORDENAR (subir/bajar a posición, SOLO pendientes) ----
  // El módulo _reordenar toma `pos` como posición 1-based DENTRO de la lista de
  // pendientes (clamp 1..len), no el `orden` global. Calculamos el índice del item
  // en $pendientesCola (que refleja el orden propuesto por el motor) + 1.
  let reordenandoId: string | null = null;
  function posDe(item: ItemCola): number {
    return $pendientesCola.findIndex((i) => i.id === item.id) + 1;
  }
  async function subir(item: ItemCola): Promise<void> {
    await mover(item, Math.max(1, posDe(item) - 1));
  }
  async function bajar(item: ItemCola): Promise<void> {
    await mover(item, Math.min($pendientesCola.length, posDe(item) + 1));
  }
  async function mover(item: ItemCola, pos: number): Promise<void> {
    const pid = $sessionProjectId;
    if (!pid) return;
    reordenandoId = item.id;
    try {
      await reordenarPieza(pid, item.id, pos);
    } catch (err) {
      // el store ya dejó el error; el refresco por cola.reordenada lo limpia
    } finally {
      reordenandoId = null;
    }
  }

  // ---- helpers de visual ----
  /** Badge de estado (color=estado): pendiente 🔵 · imprimiendo 🖨️ · hecho ✅ · retirada 🗑️. */
  function estadoChip(estado: EstadoCola): string {
    const map: Record<EstadoCola, string> = {
      pendiente: '🟦 pendiente',
      imprimiendo: '🖨️ imprimiendo',
      hecho: '✅ hecho',
      retirada: '🗑️ retirada'
    };
    return map[estado] || estado;
  }
  /** Clase CSS del estado (color). */
  function estadoCls(estado: EstadoCola): string {
    const map: Record<EstadoCola, string> = {
      pendiente: 'st-pendiente',
      imprimiendo: 'st-imprimiendo',
      hecho: 'st-hecho',
      retirada: 'st-retirada'
    };
    return map[estado] || 'st-desconocido';
  }
  /** Hueco 'desconocido' (invariante 5) o valor real. */
  function campoValor(v: string | null | undefined): string {
    return v && v !== 'desconocido' ? v : 'desconocido';
  }
</script>

<div class="cola-panel" data-cola-panel={panelId}>
  <div class="actor-badge">
    <span class="badge-icon">🖨️</span>
    <span class="badge-label">Cola de impresión</span>
    <span class="badge-scope">CUSTODIO · jefe ESCRITOR-REORDENADOR · entrar+reordenar+siguiente</span>
    {#if $mutacionesPendientes > 0}
      <span class="badge-sync">sincronizando…</span>
    {/if}
  </div>

  <!-- PESTAÑAS DE ROL: la cara del TRABAJADOR se SUMA al panel del JEFE (F7 sumar, no duplicar) -->
  <div class="rol-tabs" role="tablist">
    <button
      class:rol-tab-activa={rolActivo === 'jefe'}
      class="rol-tab"
      class:rol-tab-jefe
      role="tab"
      aria-selected={rolActivo === 'jefe'}
      on:click={() => (rolActivo = 'jefe')}
      title="jefe: entrar · reordenar · siguiente + cinta completa">👨‍🔧 Jefe</button>
    <button
      class:rol-tab-activa={rolActivo === 'trabajador'}
      class="rol-tab"
      class:rol-tab-worker
      role="tab"
      aria-selected={rolActivo === 'trabajador'}
      on:click={() => (rolActivo = 'trabajador')}
      title="trabajador: vigilar qué viene para preparar el material (lectura pura)">🧑‍🔧 Trabajador</button>
  </div>

  {#if rolActivo === 'jefe'}
  {#if $colaError || siguienteError}
    <div class="cinta-error">
      {#if $colaError}⚠️ {$colaError}{:else}⚠️ {siguienteError}{/if}
    </div>
  {/if}

  <!-- CABECERA DE PULSO: n pendientes · total + material cargado -->
  <div class="cabecera">
    <span class="pulso" title="pendientes · total en cola">
      ⏳ {$pendientesCola.length} pendientes
    </span>
    <span class="pulso-total">🧮 {$totalCola} en cola</span>
    {#if $materialCargado && $materialCargado !== 'desconocido'}
      <span class="badge-material" title="filamento cargado en la impresora">🧵 {$materialCargado}</span>
    {/if}
    <button class="btn-jefe" on:click={abrirAlta} title="entrar una pieza aprobada (cola.entrar → cola.entrada)">➕ Pieza</button>
  </div>

  {#if $ultimaAccion}
    <div class="senal-confirmacion">
      {#if $ultimaAccion.tipo === 'entrada'}🆕 entró <strong>{$ultimaAccion.nombre}</strong> · la cinta se refrescó sola
      {:else if $ultimaAccion.tipo === 'extraccion'}🚀 extrajiste <strong>{$ultimaAccion.nombre}</strong> · ya es siguiente a imprimir
      {:else if $ultimaAccion.tipo === 'vacia'}🕯️ la cola estaba vacía — entra la primera pieza
      {:else if $ultimaAccion.tipo === 'reordenado'}🔄 reordenado · el motor propone un nuevo orden
      {/if}
    </div>
  {/if}

  <!-- CINTA DE LA COLA (listar → orden propuesto del motor) -->
  {#if $colaLoading && $itemsCola.length === 0}
    <div class="vacio">
      <div class="vacio-ico">🖨️</div>
      <div class="vacio-txt">cargando la cola…</div>
    </div>
  {:else if $itemsCola.length === 0}
    <div class="vacio" role="button" tabindex="0" on:click={abrirAlta} on:keydown={(e) => e.key === 'Enter' && abrirAlta()}>
      <div class="vacio-ico">🧭</div>
      <div class="vacio-txt">cola vacía — entra la primera pieza</div>
      <button class="btn-neutro" on:click|stopPropagation={abrirAlta}>➕ Entrar pieza</button>
    </div>
  {:else}
    <ol class="cinta">
      {#each $itemsCola as item (item.id)}
        <li class="fila {estadoCls(item.estado)} {item.estado === 'pendiente' ? 'fila-pendiente' : ''}">
          <div class="fila-pos">
            {#if item.estado === 'pendiente'}
              <div class="ctrl-reordenar">
                <button
                  class="btn-mover"
                  title="subir (reordenar → pos {Math.max(1, posDe(item) - 1)})"
                  disabled={posDe(item) <= 1 || reordenandoId === item.id}
                  on:click={() => subir(item)}>▲</button>
                <button
                  class="btn-mover"
                  title="bajar (reordenar → pos {posDe(item) + 1})"
                  disabled={posDe(item) >= $pendientesCola.length || reordenandoId === item.id}
                  on:click={() => bajar(item)}>▼</button>
              </div>
              <span class="orden">{item.orden}</span>
            {:else}
              <span class="orden muted">—</span>
            {/if}
          </div>
          <div class="fila-cuerpo">
            <div class="fila-encabezado">
              {#if item.estado === 'pendiente' && item.orden === 1}
                <span class="chip-siguiente" title="es la pieza que el motor propone imprimir">👉 siguiente</span>
              {/if}
              <span class="fila-nombre" title="modelo_id: {item.modelo_id}">🧊 {item.nombre}</span>
              <span class="chip-estado {estadoCls(item.estado)}">{estadoChip(item.estado)}</span>
            </div>
            <div class="fila-meta">
              <span class="chip-chip">🧵 {campoValor(item.material)}</span>
              <span class="chip-chip">⚡ urgencia {item.urgencia}/5</span>
              {#if item.tamano > 0}
                <span class="chip-chip">📐 {item.tamano} mm³</span>
              {/if}
            </div>
          </div>
        </li>
      {/each}
    </ol>
  {/if}

  <!-- ACCIÓN SIGUIENTE A IMPRIMIR (siguiente, ROL JEFE disparador) -->
  {#if $pendientesCola.length > 0}
    <div class="accion-siguiente">
      <span class="siguiente-label">el motor propone imprimir «<strong>{$pendientesCola[0].nombre}</strong>»</span>
      <button class="btn-jefe" disabled={siguienteBusy} on:click={ejecutarSiguiente} title="extrae el que toca (cola.siguiente → cola.extraccion)">
        {siguienteBusy ? '⏳ extrayendo…' : '🚀 Siguiente a imprimir'}
      </button>
    </div>
  {:else if $colaVacia}
    <div class="aviso-vacia">🕯️ cola vacía — no hay nada que imprimir. El dueño decide si entra más.</div>
  {/if}

  <div class="pie-hint">
    entra · reordena (subir/bajar solo pendientes) · saca el siguiente · la cinta se refresca en vivo por señal, sin recargar
  </div>
  {/if}

  <!-- ===== CARA DEL TRABAJADOR (LECTOR / VIGILAR) — se SUMA al panel del jefe ===== -->
  {#if rolActivo === 'trabajador'}
  <div class="worker-view" data-rol="trabajador">
    {#if $colaError || siguienteError}
      <div class="cinta-error">
        {#if $colaError}⚠️ {$colaError}{:else}⚠️ {siguienteError}{/if}
      </div>
    {/if}

    <!-- VIGILAR 1 · cabecera de pulso + material cargado (longitud → "n pendientes · total") -->
    <div class="worker-cabecera">
      <span class="worker-titulo">🧭 Qué viene — vigila la cinta para preparar la impresora</span>
      <div class="worker-pulso">
        <span class="pulso" title="pendientes · total en cola">⏳ {$pendientesCola.length} pendientes</span>
        <span class="pulso-total" title="total de piezas vivas en cola">🧮 {$totalCola} en cola</span>
        <span class="pulso-total" title="piezas ya hechas / retiradas">✔ {$terminadasCola} completadas</span>
        {#if enCurso && enCurso.material && enCurso.material !== 'desconocido'}
          <span class="badge-material" title="filamento en la impresora AHORA">🖨️ en curso: 🧵 {enCurso.material}</span>
        {:else if $materialCargado && $materialCargado !== 'desconocido'}
          <span class="badge-material" title="filamento cargado en la impresora">🧵 {$materialCargado}</span>
        {/if}
      </div>
    </div>

    {#if $colaLoading && $itemsCola.length === 0 && !enCurso}
      <div class="vacio">
        <div class="vacio-ico">🖨️</div>
        <div class="vacio-txt">cargando la cinta…</div>
      </div>
    {:else if $itemsCola.length === 0}
      <div class="vacio">
        <div class="vacio-ico">🫙</div>
        <div class="vacio-txt">la cola está vacía — no hay piezas que preparar</div>
      </div>
    {:else}
      <!-- VIGILAR 2 · lo que toca AHORA: pieza en curso + la siguiente a preparar -->
      <div class="worker-ahora">
        {#if enCurso}
          <div class="wcard wcard-encurso {estadoCls(enCurso.estado)}">
            <span class="wcard-kicker">🖨️ EN CURSO — imprimiendo ahora</span>
            <span class="wcard-titulo">🧊 {enCurso.nombre}</span>
            <div class="wcard-meta">
              <span class="chip-chip">🧵 {campoValor(enCurso.material)}</span>
              <span class="chip-chip">⚡ urgencia {enCurso.urgencia}/5</span>
              {#if enCurso.tamano > 0}<span class="chip-chip">📐 {enCurso.tamano} mm³</span>{/if}
            </div>
          </div>
        {/if}
        {#if siguienteParaPreparar && (!enCurso || siguienteParaPreparar.id !== enCurso.id)}
          <div class="wcard wcard-prepara {estadoCls(siguienteParaPreparar.estado)}">
            <span class="wcard-kicker">⏭️ A CONTINUACIÓN — prepara este rollo</span>
            <span class="wcard-titulo">🧊 {siguienteParaPreparar.nombre}</span>
            <div class="wcard-meta">
              <span class="chip-chip">🧵 {campoValor(siguienteParaPreparar.material)}</span>
              <span class="chip-chip">⚡ urgencia {siguienteParaPreparar.urgencia}/5</span>
              {#if siguienteParaPreparar.tamano > 0}<span class="chip-chip">📐 {siguienteParaPreparar.tamano} mm³</span>{/if}
              {#if proximoCambioFilamento && proximoCambioFilamento.id === siguienteParaPreparar.id}
                <span class="chip-aviso" title="este material difiere del cargado — habrá cambio de rollo">🔄 cambio de filamento</span>
              {/if}
            </div>
          </div>
        {/if}
        {#if proximoCambioFilamento && proximoCambioFilamento.id !== siguienteParaPreparar?.id}
          <div class="wcard wcard-aviso">
            <span class="wcard-kicker">🧵 PRÓXIMO CAMBIO DE ROLLO</span>
            <span class="wcard-titulo">🧊 {proximoCambioFilamento.nombre}</span>
            <div class="wcard-meta">
              <span class="chip-chip">🧵 {campoValor(proximoCambioFilamento.material)} (≠ cargado)</span>
            </div>
          </div>
        {/if}
      </div>

      <!-- VIGILAR 3 · cinta completa "qué viene" ordenada (listar, LECTOR) -->
      <div class="worker-cinta-titulo">📋 La cola, en orden de impresión</div>
      <ol class="cinta">
        {#each $itemsCola as item (item.id)}
          <li class="fila {estadoCls(item.estado)} {item.estado === 'pendiente' ? 'fila-pendiente' : ''}">
            <div class="fila-pos">
              <span class="orden muted">#{item.orden}</span>
            </div>
            <div class="fila-cuerpo">
              <div class="fila-encabezado">
                {#if item.estado === 'imprimiendo'}
                  <span class="chip-proximo" title="pieza en curso">🖨️ ahora</span>
                {:else if item.estado === 'pendiente' && item.orden === 1}
                  <span class="chip-proximo" title="próximo a imprimir">⏭️ luego</span>
                {/if}
                <span class="fila-nombre" title="modelo_id: {item.modelo_id}">🧊 {item.nombre}</span>
                <span class="chip-estado {estadoCls(item.estado)}">{estadoChip(item.estado)}</span>
              </div>
              <div class="fila-meta">
                <span class="chip-chip">🧵 {campoValor(item.material)}</span>
                <span class="chip-chip">⚡ urgencia {item.urgencia}/5</span>
                {#if item.tamano > 0}
                  <span class="chip-chip">📐 {item.tamano} mm³</span>
                {/if}
              </div>
            </div>
          </li>
        {/each}
      </ol>
    {/if}

    <div class="pie-hint worker-pie">
      👉 el trabajador VIGILA (lista · pulso) para preparar el material — no entra, no reordena, no dispara «siguiente» (esos gestos son del JEFE). La cinta se refresca sola por señal (cola.entrada / extraccion / reordenada / vacia).
    </div>
  </div>
  {/if}

  <!-- MODAL DE ALTA (entrar, ROL JEFE — editor-bloque) -->
  {#if altaAbierta}
    <div class="overlay" on:click={cerrarAlta}>
      <div class="panel" on:click|stopPropagation>
        <h3 class="panel-titulo">➕ Entrar pieza</h3>
        {#if altaError}
          <div class="err-panel">⚠️ {altaError}</div>
        {/if}
        <label class="campo">
          <span>modelo_id <em>· obligatorio</em></span>
          <input class="input" bind:value={altaModeloId} placeholder="id del modelo aprobado" on:keydown={(e) => e.key === 'Enter' && ejecutarAlta()} />
        </label>
        <label class="campo">
          <span>Nombre <em>· obligatorio</em></span>
          <input class="input" bind:value={altaNombre} placeholder="nombre legible de la pieza" on:keydown={(e) => e.key === 'Enter' && ejecutarAlta()} />
        </label>
        <div class="grid2">
          <label class="campo">
            <span>Material</span>
            <input class="input" bind:value={altaMaterial} placeholder="PLA / PETG…" />
          </label>
          <label class="campo">
            <span>Urgencia (1..5)</span>
            <input class="input" type="number" min="1" max="5" bind:value={altaUrgenciaStr} />
          </label>
        </div>
        <label class="campo">
          <span>Tamaño (mm³)</span>
          <input class="input" type="number" min="0" bind:value={altaTamanoStr} placeholder="0 = desconocido" />
        </label>
        <div class="panel-gestos">
          <button class="btn-jefe" disabled={altaBusy} on:click={ejecutarAlta}>
            {altaBusy ? '⏳ entrando…' : '🆕 Entrar'}
          </button>
          <button class="btn-neutro" disabled={altaBusy} on:click={cerrarAlta}>cerrar</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .cola-panel {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.5rem;
  }
  .actor-badge {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.7rem;
    margin-bottom: 0.25rem;
    font-size: 0.7rem;
    border-bottom: 1px solid var(--color-border, #333);
  }
  .badge-icon { font-size: 0.85rem; }
  .badge-label {
    font-weight: 700;
    color: var(--color-primary, #eab308);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .badge-scope { color: var(--color-text-muted, #888); font-size: 0.65rem; }
  .badge-sync { margin-left: auto; color: var(--color-primary, #eab308); font-size: 0.65rem; }
  .cinta-error { font-size: 0.75rem; color: #ef4444; padding: 0.3rem 0.7rem; }
  .cabecera {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0.45rem 0.7rem;
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
  }
  .pulso {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-weight: 600;
    font-size: 0.75rem;
    color: #60a5fa;
    background: rgba(96, 165, 250, 0.12);
  }
  .pulso-total {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-weight: 600;
    font-size: 0.75rem;
    color: #a3a3a3;
    background: rgba(163, 163, 163, 0.12);
  }
  .badge-material {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-weight: 600;
    font-size: 0.72rem;
    color: #22c55e;
    background: rgba(34, 197, 94, 0.12);
  }
  .btn-jefe, .btn-neutro {
    font-size: 0.78rem;
    padding: 0.35rem 0.75rem;
    border-radius: 6px;
    border: 1px solid transparent;
    cursor: pointer;
  }
  .btn-jefe { background: var(--color-primary, #eab308); color: #111; font-weight: 700; }
  .btn-jefe:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-neutro { background: transparent; color: inherit; border-color: var(--color-border, #444); }
  .senal-confirmacion {
    font-size: 0.72rem;
    padding: 0.35rem 0.7rem;
    border-radius: 6px;
    color: #22c55e;
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.25);
  }
  .vacio {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 140px;
    border: 1px dashed var(--color-border, #444);
    border-radius: 8px;
    color: var(--color-text-muted, #888);
    font-size: 0.8rem;
    text-align: center;
    cursor: pointer;
  }
  .vacio-ico { font-size: 2rem; }
  .vacio-txt { text-align: center; }
  .cinta { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
  .fila {
    display: grid;
    grid-template-columns: 96px minmax(0, 1fr);
    gap: 0.5rem;
    align-items: center;
    padding: 0.5rem 0.7rem;
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 6px;
    font-size: 0.78rem;
  }
  .fila-pendiente { border-left: 3px solid #3b82f6; }
  .fila-pos { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; }
  .ctrl-reordenar { display: flex; gap: 0.2rem; }
  .btn-mover {
    font-size: 0.6rem;
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    border: 1px solid var(--color-border, #444);
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .btn-mover:disabled { opacity: 0.35; cursor: not-allowed; }
  .btn-mover:hover:not(:disabled) { border-color: var(--color-primary, #eab308); color: var(--color-primary, #eab308); }
  .orden { font-size: 0.8rem; font-weight: 700; color: #60a5fa; }
  .orden.muted { color: var(--color-text-muted, #666); }
  .fila-cuerpo { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
  .fila-encabezado { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .fila-nombre { font-weight: 600; display: inline-flex; align-items: center; gap: 0.3rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fila-meta { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .chip-chip {
    font-size: 0.66rem;
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    background: rgba(163, 163, 163, 0.14);
    color: inherit;
  }
  .chip-siguiente {
    font-size: 0.62rem;
    padding: 0.05rem 0.5rem;
    border-radius: 999px;
    font-weight: 700;
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.14);
  }
  .chip-estado {
    font-size: 0.66rem;
    padding: 0.05rem 0.5rem;
    border-radius: 999px;
    font-weight: 700;
  }
  .st-pendiente { color: #60a5fa; background: rgba(96, 165, 250, 0.14); }
  .st-imprimiendo { color: #f59e0b; background: rgba(245, 158, 11, 0.14); }
  .st-hecho { color: #22c55e; background: rgba(34, 197, 94, 0.14); }
  .st-retirada { color: #a3a3a3; background: rgba(163, 163, 163, 0.14); }
  .st-desconocido { color: #a3a3a3; background: rgba(163, 163, 163, 0.14); }
  .accion-siguiente {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0.5rem 0.7rem;
    background: rgba(245, 158, 11, 0.06);
    border: 1px solid rgba(245, 158, 11, 0.25);
    border-radius: 8px;
    font-size: 0.78rem;
  }
  .siguiente-label { color: var(--color-text-muted, #aaa); }
  .aviso-vacia {
    padding: 0.5rem 0.7rem;
    border: 1px dashed var(--color-border, #444);
    border-radius: 8px;
    font-size: 0.78rem;
    color: var(--color-text-muted, #888);
  }
  .pie-hint { font-size: 0.62rem; color: var(--color-text-muted, #888); padding: 0 0.2rem; }
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
  }
  .panel {
    width: min(92vw, 460px);
    max-height: 90vh;
    overflow-y: auto;
    background: var(--color-bg, #141414);
    border: 1px solid var(--color-border, #444);
    border-radius: 10px;
    padding: 1rem 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .panel-titulo { margin: 0; font-size: 1rem; }
  .err-panel { font-size: 0.75rem; color: #ef4444; }
  .campo { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.74rem; color: var(--color-text-muted, #aaa); }
  .campo em { font-style: normal; color: #f59e0b; }
  .input {
    background: var(--color-surface, #1a1a1a);
    color: inherit;
    border: 1px solid var(--color-border, #444);
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    font-size: 0.8rem;
  }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .panel-gestos { display: flex; gap: 0.5rem; justify-content: flex-end; }
  /* ---- pestañas de rol (Jefe | Trabajador) ---- */
  .rol-tabs {
    display: flex;
    gap: 0.25rem;
    padding: 0.15rem;
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
  }
  .rol-tab {
    flex: 1;
    font-size: 0.78rem;
    padding: 0.35rem 0.5rem;
    border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--color-text-muted, #888);
    cursor: pointer;
    font-weight: 600;
  }
  .rol-tab:hover:not(.rol-tab-activa) { border-color: var(--color-border, #444); color: inherit; }
  .rol-tab-jefe.rol-tab-activa { background: var(--color-primary, #eab308); color: #111; }
  .rol-tab-worker.rol-tab-activa { background: #60a5fa; color: #111; }
  /* ---- cara del trabajador (LECTOR / VIGILAR) ---- */
  .worker-view { display: flex; flex-direction: column; gap: 0.6rem; }
  .worker-cabecera {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.45rem 0.7rem;
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
  }
  .worker-titulo { font-size: 0.72rem; font-weight: 700; color: var(--color-text-muted, #888); text-transform: uppercase; letter-spacing: 0.04em; }
  .worker-pulso { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .worker-ahora { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.5rem; }
  .wcard {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.55rem 0.7rem;
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
    font-size: 0.78rem;
  }
  .wcard-encurso { border-left: 3px solid #f59e0b; }
  .wcard-prepara { border-left: 3px solid #3b82f6; }
  .wcard-aviso { border-left: 3px solid #a3a3a3; }
  .wcard-kicker { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
  .wcard-encurso .wcard-kicker { color: #f59e0b; }
  .wcard-prepara .wcard-kicker { color: #60a5fa; }
  .wcard-aviso .wcard-kicker { color: #a3a3a3; }
  .wcard-titulo { font-size: 0.95rem; font-weight: 700; }
  .wcard-meta { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .chip-aviso {
    font-size: 0.64rem;
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    font-weight: 700;
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.14);
  }
  .chip-proximo {
    font-size: 0.62rem;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    font-weight: 700;
    color: #34d399;
    background: rgba(52, 211, 153, 0.14);
  }
  .worker-cinta-titulo { font-size: 0.72rem; font-weight: 700; color: var(--color-text-muted, #888); text-transform: uppercase; letter-spacing: 0.04em; }
  .worker-pie { color: var(--color-text-muted, #888); line-height: 1.5; }
</style>
