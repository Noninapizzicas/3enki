<script lang="ts">
  /**
   * IdentidadZone — branding + negocio, BEBIDOS de la marca (proyección). Solo lectura.
   * El branding se edita en MARKETING, no aquí. El dominio público sí es del canal.
   */
  import { cartaPublica, cartaDigitalConfig } from '$lib/stores/carta-digital';
  import { storageImg } from '$lib/ui-core/storage-image';
  import { activeProjectId } from '$lib/stores/projects';

  $: branding = $cartaPublica?.branding ?? null;
  $: negocio = (branding?.negocio ?? {}) as Record<string, any>;
  $: local = (negocio.local ?? {}) as Record<string, any>;
  $: redes = (negocio.redes ?? {}) as Record<string, any>;
  $: colores = (branding?.colores ?? {}) as Record<string, string>;
  $: tipografias = (branding?.tipografias ?? {}) as Record<string, string>;

  const tieneKeys = (o: Record<string, unknown> | undefined | null) => !!o && Object.keys(o).length > 0;
  const etiqueta = (k: string) => k.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  const esColor = (v: unknown): v is string => typeof v === 'string' && /^#?[0-9a-fA-F]{3,8}$/.test(v.trim());
  const hex = (v: string) => (v.trim().startsWith('#') ? v.trim() : '#' + v.trim());
</script>

<section class="zona-identidad">
  <h2>Identidad del local</h2>
  <p class="hint">Lo que el cliente ve. El branding viene de la <strong>marca</strong> — se edita en marketing.</p>

  {#if branding}
    {#if branding.logo || branding.nombre || branding.lema}
      <div class="cabecera-marca">
        {#if branding.logo}<img class="logo" use:storageImg={{ path: branding.logo, project: $activeProjectId }} alt="Logo del local" />{/if}
        <div>
          {#if branding.nombre}<div class="marca-nombre">{branding.nombre}</div>{/if}
          {#if branding.lema}<div class="marca-lema">{branding.lema}</div>{/if}
        </div>
      </div>
    {/if}

    {#if tieneKeys(colores)}
      <div class="subseccion">
        <h3>Colores</h3>
        <div class="swatches">
          {#each Object.entries(colores) as [k, v]}
            {#if esColor(v)}
              <div class="swatch">
                <span class="muestra" style="background:{hex(v)}"></span>
                <span class="sw-label">{etiqueta(k)}</span>
                <span class="sw-hex">{hex(v)}</span>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}

    {#if tieneKeys(tipografias)}
      <div class="subseccion">
        <h3>Tipografías</h3>
        <ul class="tipos">
          {#each Object.entries(tipografias) as [k, v]}
            <li><span class="tipo-rol">{etiqueta(k)}</span><span class="tipo-fam" style="font-family:{v}">{v}</span></li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if tieneKeys(local) || tieneKeys(redes)}
      <div class="subseccion">
        <h3>Negocio</h3>
        <dl>
          {#each Object.entries(local) as [k, v]}
            {#if typeof v !== 'object'}<dt>{etiqueta(k)}</dt><dd>{v}</dd>{/if}
          {/each}
        </dl>
        {#if tieneKeys(redes)}
          <div class="redes">
            {#each Object.entries(redes) as [k, v]}
              {#if v}<span class="red-chip">{etiqueta(k)}: {v}</span>{/if}
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {:else}
    <p class="hint">Sin marca definida todavía — complétala en marketing.</p>
  {/if}

  {#if $cartaDigitalConfig?.dominio_publico}
    <div class="subseccion">
      <h3>Dominio público</h3>
      <a class="dominio" href={$cartaDigitalConfig.dominio_publico} target="_blank" rel="noopener">{$cartaDigitalConfig.dominio_publico}</a>
    </div>
  {/if}
</section>

<style>
  .zona-identidad {
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
    padding: 1rem 1.25rem;
    background: var(--color-surface, #1a1a1a);
    color: var(--color-text, #e5e5e5);
  }
  h2 { font-size: 1rem; margin: 0 0 0.25rem; }
  .hint {
    color: var(--color-text-muted, #888);
    font-size: 0.8rem;
    margin: 0 0 1rem;
  }
  .cabecera-marca {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px;
    background: var(--color-surface-2, #222);
    border-radius: 8px;
    margin-bottom: 1rem;
  }
  .logo { max-height: 48px; max-width: 80px; border-radius: 6px; }
  .marca-nombre { font-weight: 700; font-size: 1rem; }
  .marca-lema { color: var(--color-text-muted, #888); font-size: 0.82rem; }
  .subseccion { margin-bottom: 1rem; }
  .subseccion h3 {
    margin: 0 0 0.5rem;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted, #888);
  }
  .swatches { display: flex; flex-wrap: wrap; gap: 10px; }
  .swatch { display: flex; flex-direction: column; align-items: center; gap: 3px; }
  .muestra {
    width: 40px; height: 40px; border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    display: block;
  }
  .sw-label { font-size: 0.65rem; color: var(--color-text-muted, #888); }
  .sw-hex { font-size: 0.6rem; color: var(--color-text-muted, #666); font-family: monospace; }
  .tipos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .tipos li {
    display: flex; justify-content: space-between; gap: 1rem;
    padding: 4px 8px; background: var(--color-surface-2, #222); border-radius: 6px;
    font-size: 0.8rem;
  }
  .tipo-rol { color: var(--color-text-muted, #888); }
  .tipo-fam { font-weight: 500; }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 1rem;
    margin: 0 0 0.5rem;
    font-size: 0.82rem;
  }
  dt { font-weight: 600; color: var(--color-text-muted, #888); }
  dd { margin: 0; }
  .redes { display: flex; flex-wrap: wrap; gap: 6px; }
  .red-chip {
    font-size: 0.72rem;
    padding: 3px 8px;
    background: var(--color-surface-2, #222);
    border-radius: 20px;
    color: var(--color-text, #e5e5e5);
  }
  .dominio { color: var(--color-primary, #f59e0b); font-size: 0.85rem; word-break: break-all; }
</style>
