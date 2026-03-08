<script lang="ts">
  /**
   * CertificateAuthorityPanel - Panel de gestión de certificados
   *
   * Tabs:
   * - Clientes: Certificados tipo client
   * - Dispositivos: Certificados tipo device
   * - CRL: Lista de revocación
   * - CA: Certificado raíz e instrucciones de instalación
   */

  import { onMount, onDestroy } from 'svelte';
  import {
    caStore,
    filteredCertificates,
    selectedCertificate,
    caStats,
    caLoading,
    caError,
    initCASubscriptions,
    setActiveTab,
    selectCertificate,
    setFilter,
    issueCertificate,
    revokeCertificate,
    renewCertificate,
    downloadP12,
    getCACert,
    clearError,
    type Certificate,
    type CertType,
    type CertStatus
  } from '$lib/stores/certificate-authority';

  export let panelId: string = '';

  // ==========================================================================
  // STATE
  // ==========================================================================

  let cleanup: (() => void) | null = null;

  // Issue form
  let showIssueForm = false;
  let issueForm = {
    commonName: '',
    type: 'client' as CertType,
    identifier: '',
    organization: '',
    email: '',
    passphrase: ''
  };

  // Revoke confirm
  let revokeSerial: string | null = null;
  let revokeReason = '';

  // CA cert
  let caCert: { certificate: string; instructions: Record<string, string> } | null = null;

  // Reactive
  $: tab = $caStore.activeTab;
  $: stats = $caStats;
  $: loading = $caLoading;
  $: error = $caError;
  $: selected = $selectedCertificate;
  $: certs = $filteredCertificates;
  $: filter = $caStore.filter;

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  onMount(() => {
    cleanup = initCASubscriptions();
  });

  onDestroy(() => {
    cleanup?.();
  });

  // ==========================================================================
  // HANDLERS - TABS
  // ==========================================================================

  function handleTabChange(newTab: typeof tab) {
    setActiveTab(newTab);
    clearError();
    showIssueForm = false;
    revokeSerial = null;
  }

  // ==========================================================================
  // HANDLERS - ISSUE
  // ==========================================================================

  function openIssueForm() {
    issueForm = {
      commonName: '',
      type: tab === 'devices' ? 'device' : 'client',
      identifier: '',
      organization: '',
      email: '',
      passphrase: ''
    };
    showIssueForm = true;
  }

  async function handleIssue() {
    if (!issueForm.commonName || !issueForm.identifier) return;

    const success = await issueCertificate({
      commonName: issueForm.commonName,
      type: issueForm.type,
      identifier: issueForm.identifier,
      organization: issueForm.organization || undefined,
      email: issueForm.email || undefined,
      passphrase: issueForm.passphrase || undefined
    });

    if (success) {
      showIssueForm = false;
    }
  }

  // ==========================================================================
  // HANDLERS - REVOKE
  // ==========================================================================

  function confirmRevoke(serial: string) {
    revokeSerial = serial;
    revokeReason = '';
  }

  async function handleRevoke() {
    if (!revokeSerial) return;
    const success = await revokeCertificate(revokeSerial, revokeReason || 'unspecified');
    if (success) {
      revokeSerial = null;
      revokeReason = '';
    }
  }

  // ==========================================================================
  // HANDLERS - RENEW
  // ==========================================================================

  async function handleRenew(serial: string) {
    await renewCertificate(serial);
  }

  // ==========================================================================
  // HANDLERS - DOWNLOAD
  // ==========================================================================

  async function handleDownload(serial: string) {
    const bundle = await downloadP12(serial);
    if (bundle) {
      // Trigger download via data URI
      const link = document.createElement('a');
      link.href = `data:application/x-pkcs12;base64,${bundle}`;
      link.download = `certificate-${serial.substring(0, 8)}.p12`;
      link.click();
    }
  }

  // ==========================================================================
  // HANDLERS - CA CERT
  // ==========================================================================

  async function handleLoadCACert() {
    caCert = await getCACert();
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  function getStatusColor(status: CertStatus): string {
    const colors: Record<CertStatus, string> = {
      active: 'var(--color-success, #22c55e)',
      revoked: 'var(--color-error, #ef4444)',
      expired: 'var(--color-warning, #f59e0b)'
    };
    return colors[status] || 'var(--color-text)';
  }

  function getStatusIcon(status: CertStatus): string {
    const icons: Record<CertStatus, string> = {
      active: '✅',
      revoked: '❌',
      expired: '⏰'
    };
    return icons[status] || '📄';
  }

  function formatDate(dateStr?: string): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  function daysUntil(dateStr: string): number {
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  function truncate(str: string, len: number): string {
    return str.length > len ? str.substring(0, len) + '...' : str;
  }
</script>

<div class="ca-panel">
  <!-- Header -->
  <div class="panel-header">
    <div class="tabs">
      <button class="tab" class:active={tab === 'clients'} on:click={() => handleTabChange('clients')}>
        👤 Clientes
      </button>
      <button class="tab" class:active={tab === 'devices'} on:click={() => handleTabChange('devices')}>
        💻 Dispositivos
      </button>
      <button class="tab" class:active={tab === 'crl'} on:click={() => handleTabChange('crl')}>
        🚫 CRL
      </button>
      <button class="tab" class:active={tab === 'ca'} on:click={() => handleTabChange('ca')}>
        🏛️ CA
      </button>
    </div>
    <span class="stats-badge">
      {stats.active} activos
    </span>
  </div>

  <!-- Stats bar -->
  <div class="stats-bar">
    <span class="stat" title="Activos">✅ {stats.active}</span>
    <span class="stat" title="Revocados">❌ {stats.revoked}</span>
    <span class="stat" title="Expirados">⏰ {stats.expired}</span>
    <span class="stat" title="Por expirar">⚠️ {stats.expiring_soon}</span>
    {#if tab === 'clients' || tab === 'devices'}
      <button class="issue-btn" on:click={openIssueForm} disabled={loading}>
        + Emitir
      </button>
    {/if}
  </div>

  <!-- Content -->
  <div class="panel-content">

    <!-- ================================================================== -->
    <!-- ISSUE FORM (modal inline) -->
    <!-- ================================================================== -->
    {#if showIssueForm}
      <div class="issue-form">
        <div class="form-title">
          Emitir certificado {issueForm.type === 'client' ? 'cliente' : 'dispositivo'}
          <button class="close-btn" on:click={() => showIssueForm = false}>✕</button>
        </div>
        <div class="form-fields">
          <label>
            <span>Nombre (CN)</span>
            <input type="text" bind:value={issueForm.commonName} placeholder="Nombre del titular" />
          </label>
          <label>
            <span>Identificador</span>
            <input type="text" bind:value={issueForm.identifier}
              placeholder={issueForm.type === 'client' ? 'ID proyecto/cliente' : 'ID dispositivo'} />
          </label>
          <div class="form-row">
            <label>
              <span>Organizacion</span>
              <input type="text" bind:value={issueForm.organization} placeholder="Opcional" />
            </label>
            <label>
              <span>Email</span>
              <input type="email" bind:value={issueForm.email} placeholder="Opcional" />
            </label>
          </div>
          <label>
            <span>Passphrase (para .p12)</span>
            <input type="password" bind:value={issueForm.passphrase} placeholder="Proteger bundle" />
          </label>
          <button class="btn primary" on:click={handleIssue}
            disabled={loading || !issueForm.commonName || !issueForm.identifier}>
            {loading ? '⏳ Emitiendo...' : '🔐 Emitir certificado'}
          </button>
        </div>
      </div>

    <!-- ================================================================== -->
    <!-- REVOKE CONFIRM -->
    <!-- ================================================================== -->
    {:else if revokeSerial}
      <div class="revoke-confirm">
        <div class="form-title">
          Revocar certificado
          <button class="close-btn" on:click={() => revokeSerial = null}>✕</button>
        </div>
        <p class="revoke-warning">
          Esta accion es irreversible. El certificado <code>{truncate(revokeSerial, 16)}</code> sera
          marcado como revocado y no podra usarse para autenticacion.
        </p>
        <label>
          <span>Motivo</span>
          <select bind:value={revokeReason}>
            <option value="">Sin especificar</option>
            <option value="compromised">Comprometido</option>
            <option value="superseded">Reemplazado</option>
            <option value="cessation">Cese de operacion</option>
            <option value="lost">Dispositivo perdido</option>
          </select>
        </label>
        <div class="revoke-actions">
          <button class="btn secondary" on:click={() => revokeSerial = null}>Cancelar</button>
          <button class="btn danger" on:click={handleRevoke} disabled={loading}>
            {loading ? '⏳...' : '🚫 Revocar'}
          </button>
        </div>
      </div>

    <!-- ================================================================== -->
    <!-- TAB: CLIENTS / DEVICES -->
    <!-- ================================================================== -->
    {:else if tab === 'clients' || tab === 'devices'}
      <!-- Filtros -->
      <div class="filters">
        <input
          type="text"
          class="search-input"
          placeholder="Buscar..."
          value={filter.search}
          on:input={(e) => setFilter({ search: e.currentTarget.value })}
        />
        <select
          class="filter-select"
          value={filter.status}
          on:change={(e) => setFilter({ status: e.currentTarget.value as CertStatus | 'all' })}
        >
          <option value="all">Todos</option>
          <option value="active">✅ Activos</option>
          <option value="revoked">❌ Revocados</option>
          <option value="expired">⏰ Expirados</option>
        </select>
      </div>

      <!-- Lista -->
      {#if loading && certs.length === 0}
        <div class="empty-state">
          <span class="spinner">⏳</span>
          <span>Cargando certificados...</span>
        </div>
      {:else if certs.length === 0}
        <div class="empty-state">
          <span class="empty-icon">🔐</span>
          <span class="empty-title">Sin certificados</span>
          <span class="empty-text">
            {filter.search || filter.status !== 'all'
              ? 'No hay certificados que coincidan con los filtros'
              : `No hay certificados de ${tab === 'clients' ? 'clientes' : 'dispositivos'}`}
          </span>
          {#if !filter.search && filter.status === 'all'}
            <button class="btn primary" on:click={openIssueForm}>
              + Emitir certificado
            </button>
          {/if}
        </div>
      {:else}
        <div class="cert-list">
          {#each certs as cert (cert.serialNumber)}
            <div class="cert-item" class:selected={selected?.serialNumber === cert.serialNumber}>
              <button class="cert-main" on:click={() => selectCertificate(cert.serialNumber)}>
                <span class="cert-status" style="color: {getStatusColor(cert.status)}">
                  {getStatusIcon(cert.status)}
                </span>
                <div class="cert-info">
                  <span class="cert-name">{cert.commonName}</span>
                  <span class="cert-meta">
                    {cert.identifier}
                    {#if cert.status === 'active'}
                      · Expira {formatDate(cert.expiresAt)}
                      {#if daysUntil(cert.expiresAt) < 30}
                        <span class="expiring">({daysUntil(cert.expiresAt)}d)</span>
                      {/if}
                    {/if}
                  </span>
                </div>
                <span class="cert-serial">{truncate(cert.serialNumber, 8)}</span>
              </button>

              {#if selected?.serialNumber === cert.serialNumber}
                <div class="cert-detail">
                  <div class="detail-grid">
                    <div class="detail-row">
                      <span class="detail-label">Serial</span>
                      <span class="detail-value mono">{cert.serialNumber}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Fingerprint</span>
                      <span class="detail-value mono">{truncate(cert.fingerprint, 24)}</span>
                    </div>
                    {#if cert.organization}
                      <div class="detail-row">
                        <span class="detail-label">Organizacion</span>
                        <span class="detail-value">{cert.organization}</span>
                      </div>
                    {/if}
                    {#if cert.email}
                      <div class="detail-row">
                        <span class="detail-label">Email</span>
                        <span class="detail-value">{cert.email}</span>
                      </div>
                    {/if}
                    <div class="detail-row">
                      <span class="detail-label">Emitido</span>
                      <span class="detail-value">{formatDate(cert.issuedAt)}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Expira</span>
                      <span class="detail-value">{formatDate(cert.expiresAt)}</span>
                    </div>
                    {#if cert.revokedAt}
                      <div class="detail-row">
                        <span class="detail-label">Revocado</span>
                        <span class="detail-value">{formatDate(cert.revokedAt)} — {cert.revokeReason}</span>
                      </div>
                    {/if}
                  </div>
                  <div class="cert-actions">
                    {#if cert.status === 'active'}
                      <button class="btn-sm secondary" on:click={() => handleDownload(cert.serialNumber)}>
                        📥 P12
                      </button>
                      <button class="btn-sm secondary" on:click={() => handleRenew(cert.serialNumber)}>
                        🔄 Renovar
                      </button>
                      <button class="btn-sm danger" on:click={() => confirmRevoke(cert.serialNumber)}>
                        🚫 Revocar
                      </button>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

    <!-- ================================================================== -->
    <!-- TAB: CRL -->
    <!-- ================================================================== -->
    {:else if tab === 'crl'}
      {#if $caStore.crl.length === 0}
        <div class="empty-state">
          <span class="empty-icon">✅</span>
          <span class="empty-title">CRL vacia</span>
          <span class="empty-text">No hay certificados revocados</span>
        </div>
      {:else}
        <div class="crl-list">
          {#each $caStore.crl as entry (entry.serialNumber)}
            <div class="crl-item">
              <span class="crl-serial mono">{truncate(entry.serialNumber, 16)}</span>
              <span class="crl-reason">{entry.reason || 'Sin motivo'}</span>
              <span class="crl-date">{formatDate(entry.revokedAt)}</span>
            </div>
          {/each}
        </div>
      {/if}

    <!-- ================================================================== -->
    <!-- TAB: CA -->
    <!-- ================================================================== -->
    {:else if tab === 'ca'}
      <div class="ca-info">
        <div class="ca-section">
          <div class="section-title">🏛️ Autoridad Certificadora</div>
          <div class="detail-grid">
            <div class="detail-row">
              <span class="detail-label">Estado</span>
              <span class="detail-value" style="color: {stats.ca_initialized ? 'var(--color-success)' : 'var(--color-error)'}">
                {stats.ca_initialized ? '✅ Inicializada' : '❌ No inicializada'}
              </span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Total certificados</span>
              <span class="detail-value">{stats.total}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Activos</span>
              <span class="detail-value">{stats.active}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Revocados</span>
              <span class="detail-value">{stats.revoked}</span>
            </div>
          </div>
        </div>

        <div class="ca-section">
          <div class="section-title">📜 Certificado Raiz</div>
          {#if caCert}
            <div class="ca-cert-block">
              <textarea class="cert-pem" readonly rows="6">{caCert.certificate}</textarea>
              <div class="install-instructions">
                <div class="section-title">📋 Instrucciones de instalacion</div>
                {#each Object.entries(caCert.instructions) as [platform, instruction]}
                  <div class="instruction">
                    <span class="instruction-platform">{platform}</span>
                    <span class="instruction-text">{instruction}</span>
                  </div>
                {/each}
              </div>
            </div>
          {:else}
            <button class="btn primary" on:click={handleLoadCACert} disabled={loading}>
              📥 Obtener certificado raiz
            </button>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <!-- Error bar -->
  {#if error}
    <div class="error-bar">
      <span>❌ {error}</span>
      <button class="close-btn" on:click={clearError}>✕</button>
    </div>
  {/if}
</div>

<style>
  .ca-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--color-text, #e5e5e5);
  }

  /* ===== HEADER ===== */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem;
    border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  }

  .tabs {
    display: flex;
    gap: 0.25rem;
  }

  .tab {
    padding: 0.375rem 0.625rem;
    background: transparent;
    border: none;
    border-radius: 0.375rem;
    color: var(--color-text-muted, #888);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tab:hover { background: rgba(255, 255, 255, 0.05); color: var(--color-text, #e5e5e5); }
  .tab.active { background: var(--color-primary, #3b82f6); color: white; }

  .stats-badge {
    font-size: 0.7rem;
    color: var(--color-text-muted, #888);
  }

  /* ===== STATS BAR ===== */
  .stats-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.375rem 0.5rem;
    background: rgba(255, 255, 255, 0.02);
    border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
    font-size: 0.7rem;
  }

  .stat { color: var(--color-text-muted, #888); }

  .issue-btn {
    margin-left: auto;
    padding: 0.25rem 0.5rem;
    background: var(--color-success, #22c55e);
    border: none;
    border-radius: 0.25rem;
    color: white;
    font-size: 0.7rem;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .issue-btn:hover:not(:disabled) { opacity: 0.9; }
  .issue-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ===== CONTENT ===== */
  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  /* ===== FILTERS ===== */
  .filters {
    display: flex;
    gap: 0.375rem;
    margin-bottom: 0.5rem;
  }

  .search-input {
    flex: 1;
    padding: 0.375rem 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.75rem;
  }

  .search-input:focus { outline: none; border-color: var(--color-primary, #3b82f6); }

  .filter-select {
    padding: 0.375rem 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.7rem;
    cursor: pointer;
  }

  /* ===== CERT LIST ===== */
  .cert-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .cert-item {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
    border-radius: 0.375rem;
    overflow: hidden;
    transition: all 0.15s;
  }

  .cert-item:hover { border-color: rgba(255, 255, 255, 0.15); }
  .cert-item.selected { border-color: var(--color-primary, #3b82f6); }

  .cert-main {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: var(--color-text, #e5e5e5);
    cursor: pointer;
    text-align: left;
    width: 100%;
  }

  .cert-status { font-size: 1rem; }

  .cert-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .cert-name {
    font-size: 0.8rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cert-meta {
    font-size: 0.7rem;
    color: var(--color-text-muted, #888);
  }

  .expiring { color: var(--color-warning, #f59e0b); font-weight: 600; }

  .cert-serial {
    font-size: 0.65rem;
    color: var(--color-text-muted, #888);
    font-family: monospace;
  }

  /* ===== CERT DETAIL ===== */
  .cert-detail {
    padding: 0.5rem;
    border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
    background: rgba(255, 255, 255, 0.02);
  }

  .detail-grid {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.125rem 0;
  }

  .detail-label {
    font-size: 0.7rem;
    color: var(--color-text-muted, #888);
  }

  .detail-value {
    font-size: 0.75rem;
    color: var(--color-text, #e5e5e5);
  }

  .detail-value.mono, .mono {
    font-family: monospace;
    font-size: 0.7rem;
  }

  .cert-actions {
    display: flex;
    gap: 0.375rem;
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.06));
  }

  /* ===== ISSUE FORM ===== */
  .issue-form, .revoke-confirm {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.375rem;
    padding: 0.75rem;
  }

  .form-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.85rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
  }

  .form-fields {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .form-fields label, .revoke-confirm label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .form-fields label span, .revoke-confirm label span {
    font-size: 0.65rem;
    color: var(--color-text-muted, #888);
  }

  .form-fields input, .form-fields select,
  .revoke-confirm select {
    padding: 0.375rem 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.15));
    border-radius: 0.25rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.8rem;
  }

  .form-fields input:focus, .revoke-confirm select:focus {
    outline: none;
    border-color: var(--color-primary, #3b82f6);
  }

  /* ===== REVOKE ===== */
  .revoke-warning {
    font-size: 0.8rem;
    color: var(--color-warning, #f59e0b);
    margin: 0 0 0.75rem;
    line-height: 1.4;
  }

  .revoke-warning code {
    background: rgba(255, 255, 255, 0.1);
    padding: 0.1rem 0.3rem;
    border-radius: 0.2rem;
    font-size: 0.75rem;
  }

  .revoke-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 0.75rem;
  }

  /* ===== CRL ===== */
  .crl-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .crl-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: rgba(239, 68, 68, 0.05);
    border: 1px solid rgba(239, 68, 68, 0.15);
    border-radius: 0.375rem;
    font-size: 0.75rem;
  }

  .crl-serial { flex: 1; }
  .crl-reason { color: var(--color-text-muted, #888); }
  .crl-date { color: var(--color-text-muted, #888); font-size: 0.65rem; }

  /* ===== CA INFO ===== */
  .ca-info {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .ca-section {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
    border-radius: 0.375rem;
    padding: 0.625rem;
  }

  .section-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted, #888);
    margin-bottom: 0.5rem;
  }

  .cert-pem {
    width: 100%;
    padding: 0.5rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.25rem;
    color: var(--color-text, #e5e5e5);
    font-family: monospace;
    font-size: 0.65rem;
    resize: vertical;
    margin-bottom: 0.75rem;
  }

  .instruction {
    display: flex;
    gap: 0.5rem;
    padding: 0.375rem 0;
    border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.05));
    font-size: 0.75rem;
  }

  .instruction-platform {
    font-weight: 600;
    min-width: 60px;
    text-transform: capitalize;
  }

  .instruction-text {
    color: var(--color-text-muted, #888);
  }

  /* ===== BUTTONS ===== */
  .btn, .btn-sm {
    font-weight: 500;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn { padding: 0.5rem 0.75rem; font-size: 0.8rem; }
  .btn-sm { padding: 0.3rem 0.5rem; font-size: 0.7rem; }

  .btn.primary, .btn-sm.primary { background: var(--color-success, #22c55e); color: white; }
  .btn.primary:hover { filter: brightness(1.1); }

  .btn.secondary, .btn-sm.secondary { background: rgba(255, 255, 255, 0.1); color: var(--color-text, #e5e5e5); }
  .btn.secondary:hover, .btn-sm.secondary:hover { background: rgba(255, 255, 255, 0.15); }

  .btn.danger, .btn-sm.danger { background: var(--color-error, #ef4444); color: white; }
  .btn.danger:hover, .btn-sm.danger:hover { filter: brightness(1.1); }

  .btn:disabled, .btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ===== COMMON ===== */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    text-align: center;
  }

  .empty-icon { font-size: 2rem; opacity: 0.5; }
  .empty-title { font-size: 0.9rem; font-weight: 600; }
  .empty-text { font-size: 0.75rem; color: var(--color-text-muted, #888); }
  .spinner { font-size: 1.5rem; animation: spin 1s linear infinite; }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .error-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem;
    background: rgba(239, 68, 68, 0.15);
    border-top: 1px solid rgba(239, 68, 68, 0.3);
    color: var(--color-error, #ef4444);
    font-size: 0.75rem;
  }

  .close-btn {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 0.25rem;
  }
</style>
