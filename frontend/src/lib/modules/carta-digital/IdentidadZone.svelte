<script lang="ts">
  /**
   * IdentidadZone — branding + negocio, BEBIDOS de la marca (proyección). Solo lectura.
   * El branding se edita en MARKETING, no aquí. El dominio público sí es del canal.
   */
  import { cartaPublica, cartaDigitalConfig } from '$lib/stores/carta-digital';

  $: branding = $cartaPublica?.branding ?? null;
  $: negocio = (branding?.negocio ?? {}) as Record<string, any>;
  $: local = (negocio.local ?? {}) as Record<string, any>;
  $: redes = (negocio.redes ?? {}) as Record<string, any>;
  const tieneKeys = (o: Record<string, unknown> | undefined | null) => !!o && Object.keys(o).length > 0;
</script>

<section class="zona-identidad">
  <h2>Identidad del local</h2>
  <p class="hint">Lo que el cliente ve. El branding viene de la <strong>marca</strong> — se edita en marketing.</p>

  {#if branding}
    <div class="subseccion">
      <h3>Branding (de la marca)</h3>
      <dl>
        {#if branding.nombre}<dt>Nombre</dt><dd>{branding.nombre}</dd>{/if}
        {#if branding.lema}<dt>Lema</dt><dd>{branding.lema}</dd>{/if}
        {#if tieneKeys(branding.colores)}<dt>Colores</dt><dd><pre>{JSON.stringify(branding.colores, null, 2)}</pre></dd>{/if}
        {#if branding.logo}<dt>Logo</dt><dd><img src={branding.logo} alt="logo" /></dd>{/if}
        {#if tieneKeys(branding.tipografias)}<dt>Tipografías</dt><dd><pre>{JSON.stringify(branding.tipografias, null, 2)}</pre></dd>{/if}
      </dl>
    </div>

    {#if tieneKeys(local) || tieneKeys(redes)}
      <div class="subseccion">
        <h3>Negocio</h3>
        <dl>
          {#each Object.entries(local) as [k, v]}<dt>{k}</dt><dd>{typeof v === 'object' ? JSON.stringify(v) : v}</dd>{/each}
          {#if tieneKeys(redes)}<dt>Redes</dt><dd><pre>{JSON.stringify(redes, null, 2)}</pre></dd>{/if}
        </dl>
      </div>
    {/if}
  {:else}
    <p class="hint">Sin marca definida todavía — complétala en marketing.</p>
  {/if}

  {#if $cartaDigitalConfig?.dominio_publico}
    <div class="subseccion">
      <h3>Dominio público</h3>
      <a href={$cartaDigitalConfig.dominio_publico} target="_blank" rel="noopener">{$cartaDigitalConfig.dominio_publico}</a>
    </div>
  {/if}
</section>

<style>
  .zona-identidad {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1rem 1.25rem;
  }
  .hint {
    color: #888;
    font-size: 0.85rem;
    margin: 0 0 1rem;
  }
  .subseccion {
    margin-bottom: 1rem;
  }
  .subseccion h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 1rem;
    margin: 0 0 0.5rem;
  }
  dt {
    font-weight: 600;
    color: #555;
  }
  dd {
    margin: 0;
  }
  pre {
    margin: 0;
    font-size: 0.8rem;
    white-space: pre-wrap;
  }
  img {
    max-height: 50px;
  }
</style>
