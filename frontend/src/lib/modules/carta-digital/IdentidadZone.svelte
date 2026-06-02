<script lang="ts">
  /**
   * IdentidadZone - branding + contacto fusionados (D2). Solo lectura + prefill (Postura B).
   */
  import { cartaDigitalConfig } from '$lib/stores/carta-digital';
  import { prefillChatInput } from '$lib/stores/chatInputDraft';

  function editarBranding() {
    prefillChatInput('Cambia el branding de la carta digital: [describe cambios: nombre, lema, colores, logo, fuente].');
  }
  function editarContacto() {
    prefillChatInput('Actualiza los datos de contacto de la carta digital: [telefono, email, web, redes].');
  }
</script>

<section class="zona-identidad">
  <h2>Identidad del local</h2>
  <p class="hint">Datos que el cliente final ve en la carta pública.</p>

  {#if $cartaDigitalConfig}
    <div class="subseccion">
      <h3>Branding</h3>
      <dl>
        {#if $cartaDigitalConfig.branding?.nombre}<dt>Nombre</dt><dd>{$cartaDigitalConfig.branding.nombre}</dd>{/if}
        {#if $cartaDigitalConfig.branding?.lema}<dt>Lema</dt><dd>{$cartaDigitalConfig.branding.lema}</dd>{/if}
        {#if $cartaDigitalConfig.branding?.colores}<dt>Colores</dt><dd><pre>{JSON.stringify($cartaDigitalConfig.branding.colores, null, 2)}</pre></dd>{/if}
        {#if $cartaDigitalConfig.branding?.logo_url}<dt>Logo</dt><dd><img src={$cartaDigitalConfig.branding.logo_url} alt="logo" /></dd>{/if}
        {#if $cartaDigitalConfig.branding?.fuente}<dt>Fuente</dt><dd>{$cartaDigitalConfig.branding.fuente}</dd>{/if}
      </dl>
      <button on:click={editarBranding}>Editar branding</button>
    </div>

    <div class="subseccion">
      <h3>Contacto</h3>
      <dl>
        {#if $cartaDigitalConfig.contacto?.telefono}<dt>Teléfono</dt><dd>{$cartaDigitalConfig.contacto.telefono}</dd>{/if}
        {#if $cartaDigitalConfig.contacto?.email}<dt>Email</dt><dd>{$cartaDigitalConfig.contacto.email}</dd>{/if}
        {#if $cartaDigitalConfig.contacto?.web}<dt>Web</dt><dd>{$cartaDigitalConfig.contacto.web}</dd>{/if}
        {#if $cartaDigitalConfig.contacto?.redes}<dt>Redes</dt><dd><pre>{JSON.stringify($cartaDigitalConfig.contacto.redes, null, 2)}</pre></dd>{/if}
      </dl>
      <button on:click={editarContacto}>Editar contacto</button>
    </div>

    {#if $cartaDigitalConfig.dominio_publico}
      <div class="subseccion">
        <h3>Dominio público</h3>
        <a href={$cartaDigitalConfig.dominio_publico} target="_blank" rel="noopener">{$cartaDigitalConfig.dominio_publico}</a>
      </div>
    {/if}
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
  button {
    cursor: pointer;
  }
</style>
