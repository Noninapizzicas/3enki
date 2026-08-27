<script lang="ts">
  /**
   * ResultView — presenta el resultado de una operación según su FORMA, no como JSON crudo.
   *
   *   - array de objetos        → tabla (columnas = claves de la primera fila)
   *   - array de primitivos     → lista
   *   - objeto con un array dentro→ tabla de ese array (+ escalares como cabecera clave/valor)
   *   - objeto plano            → lista clave → valor
   *   - primitivo / vacío       → texto
   *   - lo no tabulable         → JSON (último recurso, plegable)
   *
   * El user ve una tabla o una ficha legible; el JSON queda solo para lo que de
   * verdad no tiene forma tabular.
   */
  export let data: unknown = undefined;
  /** Máximo de columnas a mostrar en tablas (evita tablas ingobernables). */
  export let maxCols = 8;

  type Row = Record<string, unknown>;

  function esObjetoPlano(v: unknown): v is Row {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  /** Encuentra el primer array de objetos dentro de un objeto (p.ej. { items: [...] }). */
  function arrayInterno(obj: Row): { clave: string; filas: Row[] } | null {
    for (const [k, v] of Object.entries(obj)) {
      if (Array.isArray(v) && v.length > 0 && esObjetoPlano(v[0])) {
        return { clave: k, filas: v as Row[] };
      }
    }
    return null;
  }

  function celda(v: unknown): string {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'object') return JSON.stringify(v).slice(0, 80);
    return String(v);
  }

  // Determinación de la forma (reactiva).
  type Forma =
    | { tipo: 'vacio' }
    | { tipo: 'texto'; valor: string }
    | { tipo: 'lista'; items: unknown[] }
    | { tipo: 'tabla'; filas: Row[]; cols: string[]; escalares?: [string, unknown][] }
    | { tipo: 'kv'; pares: [string, unknown][] }
    | { tipo: 'json'; valor: string };

  function cols(filas: Row[]): string[] {
    const set = new Set<string>();
    for (const fila of filas.slice(0, 20)) {
      for (const k of Object.keys(fila)) set.add(k);
      if (set.size >= maxCols) break;
    }
    return [...set].slice(0, maxCols);
  }

  function analizar(d: unknown): Forma {
    if (d === undefined || d === null) return { tipo: 'vacio' };
    if (typeof d !== 'object') return { tipo: 'texto', valor: String(d) };

    if (Array.isArray(d)) {
      if (d.length === 0) return { tipo: 'vacio' };
      if (esObjetoPlano(d[0])) {
        const filas = d as Row[];
        return { tipo: 'tabla', filas, cols: cols(filas) };
      }
      return { tipo: 'lista', items: d };
    }

    // objeto: ¿tiene un array de filas dentro?
    const obj = d as Row;
    const interno = arrayInterno(obj);
    if (interno) {
      const escalares = Object.entries(obj).filter(
        ([k, v]) => k !== interno.clave && typeof v !== 'object'
      );
      return { tipo: 'tabla', filas: interno.filas, cols: cols(interno.filas), escalares };
    }

    const pares = Object.entries(obj);
    // Si todo son escalares → ficha clave/valor. Si hay estructuras anidadas → JSON.
    const soloEscalares = pares.every(([, v]) => typeof v !== 'object' || v === null);
    if (soloEscalares) return { tipo: 'kv', pares };

    return { tipo: 'json', valor: JSON.stringify(d, null, 2) };
  }

  $: forma = analizar(data);
</script>

{#if forma.tipo === 'vacio'}
  <p class="rv-vacio">sin datos</p>
{:else if forma.tipo === 'texto'}
  <p class="rv-texto">{forma.valor}</p>
{:else if forma.tipo === 'lista'}
  <ul class="rv-lista">
    {#each forma.items as it}
      <li>{celda(it)}</li>
    {/each}
  </ul>
{:else if forma.tipo === 'kv'}
  <dl class="rv-kv">
    {#each forma.pares as [k, v]}
      <div class="rv-kv-fila"><dt>{k}</dt><dd>{celda(v)}</dd></div>
    {/each}
  </dl>
{:else if forma.tipo === 'tabla'}
  {#if forma.escalares && forma.escalares.length}
    <dl class="rv-kv rv-cabecera">
      {#each forma.escalares as [k, v]}
        <div class="rv-kv-fila"><dt>{k}</dt><dd>{celda(v)}</dd></div>
      {/each}
    </dl>
  {/if}
  <div class="rv-tabla-wrap">
    <table class="rv-tabla">
      <thead>
        <tr>{#each forma.cols as c}<th>{c}</th>{/each}</tr>
      </thead>
      <tbody>
        {#each forma.filas as fila, i (i)}
          <tr>{#each forma.cols as c}<td>{celda(fila[c])}</td>{/each}</tr>
        {/each}
      </tbody>
    </table>
    {#if forma.filas.length > 20}
      <p class="rv-mas">… {forma.filas.length} filas en total</p>
    {/if}
  </div>
{:else}
  <pre class="rv-json">{forma.valor}</pre>
{/if}

<style>
  .rv-vacio { margin: 0.15rem 0 0; font-size: 0.72rem; color: var(--color-text-muted, #666); }
  .rv-texto { margin: 0.3rem 0 0; font-size: 0.8rem; color: var(--color-text, #ddd); }
  .rv-lista { margin: 0.3rem 0 0; padding-left: 1.1rem; font-size: 0.78rem; color: var(--color-text, #ddd); }
  .rv-lista li { margin: 1px 0; }
  .rv-kv { margin: 0.3rem 0 0; display: flex; flex-direction: column; gap: 2px; }
  .rv-kv-fila { display: flex; gap: 0.5rem; font-size: 0.76rem; }
  .rv-kv dt { color: var(--color-text-muted, #888); min-width: 8rem; flex-shrink: 0; }
  .rv-kv dd { margin: 0; color: var(--color-text, #ddd); overflow-wrap: anywhere; }
  .rv-cabecera { margin-bottom: 0.35rem; padding-bottom: 0.3rem; border-bottom: 1px dashed var(--color-border, #333); }
  .rv-tabla-wrap { overflow-x: auto; margin-top: 0.3rem; }
  .rv-tabla { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
  .rv-tabla th, .rv-tabla td { border: 1px solid var(--color-border, #333); padding: 3px 7px; text-align: left; white-space: nowrap; }
  .rv-tabla th { background: var(--color-surface-2, #1a1a1a); color: var(--color-text-muted, #aaa); font-weight: 600; }
  .rv-tabla td { color: var(--color-text, #ddd); }
  .rv-mas { margin: 0.25rem 0 0; font-size: 0.68rem; color: var(--color-text-muted, #666); }
  .rv-json { margin: 0.4rem 0 0; font-size: 0.72rem; background: #0a0a0a; border: 1px solid var(--color-border, #333); border-radius: 6px; padding: 0.4rem 0.55rem; overflow-x: auto; max-height: 140px; color: #9ecaed; }
</style>
