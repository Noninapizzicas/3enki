<script lang="ts">
  /**
   * CloudTab - Gestión de servicios de almacenamiento en la nube
   *
   * Servicios planificados:
   * - Google Drive
   * - AWS S3
   * - Dropbox
   * - etc.
   *
   * Por ahora es un placeholder.
   */

  const plannedServices = [
    { id: 'gdrive', name: 'Google Drive', icon: '📁', status: 'planned' },
    { id: 's3', name: 'AWS S3', icon: '🪣', status: 'planned' },
    { id: 'dropbox', name: 'Dropbox', icon: '📦', status: 'planned' },
    { id: 'onedrive', name: 'OneDrive', icon: '☁️', status: 'planned' }
  ];
</script>

<div class="cloud-tab">
  <div class="coming-soon">
    <span class="coming-icon">🚧</span>
    <span class="coming-title">Próximamente</span>
    <span class="coming-text">
      Integración con servicios de almacenamiento en la nube
    </span>
  </div>

  <div class="services-preview">
    <span class="preview-label">Servicios planificados:</span>
    <div class="services-grid">
      {#each plannedServices as service (service.id)}
        <div class="service-preview">
          <span class="service-icon">{service.icon}</span>
          <span class="service-name">{service.name}</span>
          <span class="service-badge">Próximo</span>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .cloud-tab {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1rem;
  }

  /* Coming Soon */
  .coming-soon {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 2rem;
    text-align: center;
  }

  .coming-icon {
    font-size: 3rem;
  }

  .coming-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--_text, #e5e5e5);
  }

  .coming-text {
    font-size: 0.875rem;
    color: var(--_text-muted, #a3a3a3);
  }

  /* Services Preview */
  .services-preview {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .preview-label {
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--_text-muted, #a3a3a3);
  }

  .services-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .service-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 1rem;
    background: var(--_bg-surface, rgba(255, 255, 255, 0.05));
    border: 1px dashed var(--_border, rgba(255, 255, 255, 0.1));
    border-radius: 0.5rem;
    opacity: 0.6;
  }

  .service-icon {
    font-size: 1.5rem;
  }

  .service-name {
    font-size: 0.75rem;
    color: var(--_text-muted, #a3a3a3);
  }

  .service-badge {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    background: var(--_border, rgba(255, 255, 255, 0.1));
    border-radius: 9999px;
    color: var(--_text-muted, #a3a3a3);
  }
</style>
