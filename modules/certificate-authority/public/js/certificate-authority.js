/**
 * Certificate Authority Panel - Frontend Logic
 */
class CertificateAuthorityPanel {
  constructor() {
    this.baseUrl = '/3333';
    this.currentTab = 'clients';
    this.data = {
      certificates: [],
      crl: [],
      caCert: null,
      instructions: null,
      stats: null
    };

    this.init();
  }

  async init() {
    await this.loadAll();
  }

  // ==========================================
  // Data Loading
  // ==========================================

  async loadAll() {
    await Promise.all([
      this.loadCertificates(),
      this.loadStats()
    ]);
    this.renderCurrentTab();
  }

  async loadCertificates() {
    try {
      const res = await fetch(`${this.baseUrl}/list`);
      const data = await res.json();
      this.data.certificates = data.data?.certificates || data.certificates || [];
    } catch (error) {
      this.toast('Error cargando certificados', 'error');
    }
  }

  async loadStats() {
    try {
      const res = await fetch(`${this.baseUrl}/status`);
      const data = await res.json();
      const stats = data.data?.ca || data.ca || {};

      document.getElementById('stat-active').textContent = stats.active || 0;
      document.getElementById('stat-revoked').textContent = stats.revoked || 0;
      document.getElementById('stat-expired').textContent = stats.expired || 0;
      document.getElementById('stat-expiring').textContent = stats.expiring_soon || 0;

      this.data.stats = stats;
    } catch (error) {
      // Stats will show dashes
    }
  }

  async loadCRL() {
    try {
      const res = await fetch(`${this.baseUrl}/crl`);
      const data = await res.json();
      this.data.crl = data.data?.revoked || data.revoked || [];
      this.renderCRL();
    } catch (error) {
      this.toast('Error cargando CRL', 'error');
    }
  }

  async loadCACert() {
    try {
      const res = await fetch(`${this.baseUrl}/ca-cert`);
      const data = await res.json();
      const certData = data.data || data;

      this.data.caCert = certData.certificate;
      this.data.instructions = certData.instructions;

      document.getElementById('ca-cert-content').textContent = certData.certificate || 'No disponible';

      const instructionsEl = document.getElementById('ca-instructions');
      if (certData.instructions) {
        instructionsEl.innerHTML = `
          <ul class="instruction-list">
            ${Object.entries(certData.instructions).map(([platform, instruction]) => `
              <li class="instruction-item">
                <strong>${this.platformLabel(platform)}</strong>
                <span>${instruction}</span>
              </li>
            `).join('')}
          </ul>
        `;
      }
    } catch (error) {
      this.toast('Error cargando CA', 'error');
    }
  }

  // ==========================================
  // Tab Navigation
  // ==========================================

  switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');

    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');

    this.currentTab = tabName;
    this.renderCurrentTab();

    // Load tab-specific data
    if (tabName === 'crl' && this.data.crl.length === 0) this.loadCRL();
    if (tabName === 'ca' && !this.data.caCert) this.loadCACert();
  }

  renderCurrentTab() {
    switch (this.currentTab) {
      case 'clients': this.renderCertificates('clients'); break;
      case 'devices': this.renderCertificates('devices'); break;
      case 'crl': this.renderCRL(); break;
    }
  }

  // ==========================================
  // Rendering
  // ==========================================

  renderCertificates(tab) {
    const type = tab === 'clients' ? 'client' : 'device';
    const containerId = `${tab}-container`;
    const container = document.getElementById(containerId);
    if (!container) return;

    let certs = this.data.certificates.filter(c => c.type === type);

    // Apply filters
    const statusFilter = document.getElementById(`filter-${tab === 'clients' ? 'client' : 'device'}-status`)?.value;
    const searchFilter = document.getElementById(`filter-${tab === 'clients' ? 'client' : 'device'}-search`)?.value?.toLowerCase();

    if (statusFilter) {
      certs = certs.filter(c => c.status === statusFilter);
    }
    if (searchFilter) {
      certs = certs.filter(c =>
        (c.commonName || '').toLowerCase().includes(searchFilter) ||
        (c.identifier || '').toLowerCase().includes(searchFilter) ||
        (c.serialNumber || '').toLowerCase().includes(searchFilter)
      );
    }

    if (certs.length === 0) {
      const typeLabel = type === 'client' ? 'clientes' : 'dispositivos';
      container.innerHTML = `
        <div class="empty-state">
          <p>No hay certificados de ${typeLabel}</p>
          <button class="btn-primary" onclick="caPanel.showIssueModal('${type}')">Emitir primer certificado</button>
        </div>
      `;
      return;
    }

    container.innerHTML = certs.map(cert => this.renderCertCard(cert)).join('');
  }

  renderCertCard(cert) {
    const isExpiring = this.isExpiringSoon(cert.expiresAt);
    const statusClass = cert.status === 'active' ? (isExpiring ? 'status-expiring' : 'status-active')
      : cert.status === 'revoked' ? 'status-revoked' : 'status-expired';

    const badgeClass = cert.status === 'active' ? (isExpiring ? 'badge-pending' : 'badge-success')
      : cert.status === 'revoked' ? 'badge-error' : 'badge-expired';

    const badgeText = cert.status === 'active' ? (isExpiring ? 'Por expirar' : 'Activo')
      : cert.status === 'revoked' ? 'Revocado' : 'Expirado';

    const serial = cert.serialNumber || '';
    const shortSerial = serial.substring(0, 12) + '...';

    const actions = cert.status === 'active' ? `
      <button class="btn-primary btn-sm" onclick="caPanel.downloadP12('${serial}')">Descargar .p12</button>
      <button class="btn-warning btn-sm" onclick="caPanel.showRenewConfirm('${serial}')">Renovar</button>
      <button class="btn-error btn-sm" onclick="caPanel.showRevokeModal('${serial}', '${this.escapeHtml(cert.commonName)}')">Revocar</button>
    ` : cert.status === 'revoked' ? `
      <button class="btn-secondary btn-sm" onclick="caPanel.showDetail('${serial}')">Ver detalle</button>
    ` : `
      <button class="btn-secondary btn-sm" onclick="caPanel.showDetail('${serial}')">Ver detalle</button>
      <button class="btn-warning btn-sm" onclick="caPanel.showRenewConfirm('${serial}')">Renovar</button>
    `;

    return `
      <div class="card ${statusClass}">
        <div class="card-header">
          <div class="card-title">${this.escapeHtml(cert.commonName)}</div>
          <span class="card-badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="card-body">
          <div class="card-info">
            <div class="card-info-item">
              <span class="card-info-label">Identificador</span>
              <span class="card-info-value">${this.escapeHtml(cert.identifier)}</span>
            </div>
            <div class="card-info-item">
              <span class="card-info-label">N/Serie</span>
              <span class="card-info-value" title="${serial}">${shortSerial}</span>
            </div>
            ${cert.organization ? `
            <div class="card-info-item">
              <span class="card-info-label">Organizacion</span>
              <span class="card-info-value">${this.escapeHtml(cert.organization)}</span>
            </div>` : ''}
            ${cert.email ? `
            <div class="card-info-item">
              <span class="card-info-label">Email</span>
              <span class="card-info-value">${this.escapeHtml(cert.email)}</span>
            </div>` : ''}
            <div class="card-info-item">
              <span class="card-info-label">Emitido</span>
              <span class="card-info-value">${this.formatDate(cert.issuedAt)}</span>
            </div>
            <div class="card-info-item">
              <span class="card-info-label">Expira</span>
              <span class="card-info-value">${this.formatDate(cert.expiresAt)}</span>
            </div>
            ${cert.revokedAt ? `
            <div class="card-info-item">
              <span class="card-info-label">Revocado</span>
              <span class="card-info-value">${this.formatDate(cert.revokedAt)}</span>
            </div>` : ''}
          </div>
        </div>
        <div class="card-actions">
          ${actions}
        </div>
      </div>
    `;
  }

  renderCRL() {
    const container = document.getElementById('crl-container');
    if (!container) return;

    if (this.data.crl.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No hay certificados revocados</p></div>';
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>N/Serie</th>
            <th>Fecha revocacion</th>
            <th>Motivo</th>
          </tr>
        </thead>
        <tbody>
          ${this.data.crl.map(entry => `
            <tr>
              <td title="${entry.serialNumber}">${entry.serialNumber.substring(0, 16)}...</td>
              <td>${this.formatDate(entry.revokedAt)}</td>
              <td>${this.reasonLabel(entry.reason)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  // ==========================================
  // Actions
  // ==========================================

  showIssueModal(type) {
    document.getElementById('issue-type').value = type;
    const title = type === 'client' ? 'Emitir Certificado de Cliente' : 'Emitir Certificado de Dispositivo';
    document.getElementById('issue-modal-title').textContent = title;

    const hint = type === 'client'
      ? 'ProjectId del cliente (ej: project-001)'
      : 'DeviceId del dispositivo (ej: device-laptop-01)';
    document.getElementById('issue-id-hint').textContent = hint;

    document.getElementById('issue-form').reset();
    document.getElementById('issue-modal').classList.add('active');
  }

  async issueCertificate(event) {
    event.preventDefault();

    const form = event.target;
    const data = {
      commonName: form.commonName.value,
      type: form.type.value,
      identifier: form.identifier.value,
      organization: form.organization.value || undefined,
      email: form.email.value || undefined,
      validityDays: parseInt(form.validityDays.value) || 365,
      passphrase: form.passphrase.value || undefined
    };

    try {
      const res = await fetch(`${this.baseUrl}/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await res.json();

      if (res.ok && (result.data?.serialNumber || result.serialNumber)) {
        const serial = result.data?.serialNumber || result.serialNumber;
        this.closeModal('issue-modal');
        this.toast(`Certificado emitido: ${serial.substring(0, 12)}...`, 'success');
        await this.loadAll();

        // Ofrecer descarga
        if (result.data?.hasP12 || result.hasP12) {
          if (confirm('Certificado emitido. Descargar archivo .p12 ahora?')) {
            this.downloadP12(serial);
          }
        }
      } else {
        const error = result.data?.error || result.error || 'Error desconocido';
        this.toast(`Error: ${error}`, 'error');
      }
    } catch (error) {
      this.toast('Error de conexion', 'error');
    }
  }

  showRevokeModal(serialNumber, commonName) {
    document.getElementById('revoke-serial').value = serialNumber;
    document.getElementById('revoke-cert-name').textContent = commonName;
    document.getElementById('revoke-reason').value = 'unspecified';
    document.getElementById('revoke-modal').classList.add('active');
  }

  async confirmRevoke(event) {
    event.preventDefault();

    const form = event.target;
    const data = {
      serialNumber: form.serialNumber.value,
      reason: form.reason.value
    };

    try {
      const res = await fetch(`${this.baseUrl}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await res.json();

      if (result.data?.revoked || result.revoked) {
        this.closeModal('revoke-modal');
        this.toast('Certificado revocado', 'success');
        await this.loadAll();
      } else {
        this.toast(`Error: ${result.data?.error || result.error || 'No se pudo revocar'}`, 'error');
      }
    } catch (error) {
      this.toast('Error de conexion', 'error');
    }
  }

  async showRenewConfirm(serialNumber) {
    if (!confirm('Renovar este certificado? Se revocara el actual y se emitira uno nuevo.')) return;

    try {
      const res = await fetch(`${this.baseUrl}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serialNumber })
      });

      const result = await res.json();

      if (result.data?.serialNumber || result.serialNumber) {
        const newSerial = result.data?.serialNumber || result.serialNumber;
        this.toast(`Certificado renovado: ${newSerial.substring(0, 12)}...`, 'success');
        await this.loadAll();

        if (confirm('Descargar nuevo archivo .p12?')) {
          this.downloadP12(newSerial);
        }
      } else {
        this.toast(`Error: ${result.data?.error || result.error}`, 'error');
      }
    } catch (error) {
      this.toast('Error de conexion', 'error');
    }
  }

  async downloadP12(serialNumber) {
    try {
      const res = await fetch(`${this.baseUrl}/download-p12?serialNumber=${serialNumber}`);
      const result = await res.json();
      const data = result.data || result;

      if (data.bundle) {
        // Decodificar base64 y crear descarga
        const bytes = atob(data.bundle);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) {
          arr[i] = bytes.charCodeAt(i);
        }
        const blob = new Blob([arr], { type: 'application/x-pkcs12' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename || `certificate-${serialNumber.substring(0, 8)}.p12`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.toast('Archivo .p12 descargado', 'success');
      } else {
        this.toast('No hay archivo .p12 disponible (puede haber sido revocado)', 'warning');
      }
    } catch (error) {
      this.toast('Error descargando .p12', 'error');
    }
  }

  showDetail(serialNumber) {
    const cert = this.data.certificates.find(c => c.serialNumber === serialNumber);
    if (!cert) return;

    const content = document.getElementById('detail-content');
    content.innerHTML = `
      <div class="detail-grid">
        <div class="detail-field">
          <div class="detail-label">Nombre</div>
          <div class="detail-value">${this.escapeHtml(cert.commonName)}</div>
        </div>
        <div class="detail-field">
          <div class="detail-label">Tipo</div>
          <div class="detail-value">${cert.type === 'client' ? 'Cliente' : 'Dispositivo'}</div>
        </div>
        <div class="detail-field">
          <div class="detail-label">Identificador</div>
          <div class="detail-value">${this.escapeHtml(cert.identifier)}</div>
        </div>
        <div class="detail-field">
          <div class="detail-label">Estado</div>
          <div class="detail-value">
            <span class="card-badge ${this.statusBadgeClass(cert.status)}">${this.statusLabel(cert.status)}</span>
          </div>
        </div>
        <div class="detail-field detail-full">
          <div class="detail-label">Numero de serie</div>
          <div class="detail-value">${cert.serialNumber}</div>
        </div>
        ${cert.fingerprint ? `
        <div class="detail-field detail-full">
          <div class="detail-label">Fingerprint (SHA-256)</div>
          <div class="detail-value" style="font-family: monospace; font-size: 12px;">${cert.fingerprint}</div>
        </div>` : ''}
        ${cert.organization ? `
        <div class="detail-field">
          <div class="detail-label">Organizacion</div>
          <div class="detail-value">${this.escapeHtml(cert.organization)}</div>
        </div>` : ''}
        ${cert.email ? `
        <div class="detail-field">
          <div class="detail-label">Email</div>
          <div class="detail-value">${this.escapeHtml(cert.email)}</div>
        </div>` : ''}
        <div class="detail-field">
          <div class="detail-label">Emitido</div>
          <div class="detail-value">${this.formatDate(cert.issuedAt)}</div>
        </div>
        <div class="detail-field">
          <div class="detail-label">Expira</div>
          <div class="detail-value">${this.formatDate(cert.expiresAt)}</div>
        </div>
        ${cert.revokedAt ? `
        <div class="detail-field">
          <div class="detail-label">Revocado</div>
          <div class="detail-value">${this.formatDate(cert.revokedAt)}</div>
        </div>
        <div class="detail-field">
          <div class="detail-label">Motivo</div>
          <div class="detail-value">${this.reasonLabel(cert.revokeReason)}</div>
        </div>` : ''}
      </div>
    `;

    document.getElementById('detail-modal').classList.add('active');
  }

  async downloadCACert() {
    if (!this.data.caCert) await this.loadCACert();
    if (!this.data.caCert) return;

    const blob = new Blob([this.data.caCert], { type: 'application/x-pem-file' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'event-core-ca.pem';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.toast('Certificado CA descargado', 'success');
  }

  async copyCACert() {
    if (!this.data.caCert) await this.loadCACert();
    if (!this.data.caCert) return;

    try {
      await navigator.clipboard.writeText(this.data.caCert);
      this.toast('PEM copiado al portapapeles', 'success');
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = this.data.caCert;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      this.toast('PEM copiado', 'success');
    }
  }

  // ==========================================
  // Filters
  // ==========================================

  filterCerts(tab) {
    this.renderCertificates(tab);
  }

  // ==========================================
  // UI Helpers
  // ==========================================

  async refresh() {
    await this.loadAll();
    this.toast('Datos actualizados', 'info');
  }

  closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
  }

  toast(message, type = 'info') {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = `toast toast-${type} visible`;

    setTimeout(() => {
      el.classList.remove('visible');
    }, 3000);
  }

  // ==========================================
  // Formatters
  // ==========================================

  formatDate(dateString) {
    if (!dateString) return '-';
    const d = new Date(dateString);
    return d.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  isExpiringSoon(expiresAt) {
    if (!expiresAt) return false;
    const now = new Date();
    const expires = new Date(expiresAt);
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    return (expires - now) < thirtyDays && (expires - now) > 0;
  }

  statusBadgeClass(status) {
    switch (status) {
      case 'active': return 'badge-success';
      case 'revoked': return 'badge-error';
      case 'expired': return 'badge-expired';
      default: return 'badge-info';
    }
  }

  statusLabel(status) {
    switch (status) {
      case 'active': return 'Activo';
      case 'revoked': return 'Revocado';
      case 'expired': return 'Expirado';
      default: return status;
    }
  }

  reasonLabel(reason) {
    const labels = {
      'unspecified': 'Sin especificar',
      'key_compromise': 'Clave comprometida',
      'device_lost': 'Dispositivo perdido/robado',
      'client_terminated': 'Cliente dado de baja',
      'employee_left': 'Empleado se fue',
      'superseded': 'Reemplazado'
    };
    return labels[reason] || reason || 'Sin especificar';
  }

  platformLabel(platform) {
    const labels = {
      'browser': 'Navegador',
      'windows': 'Windows',
      'macos': 'macOS',
      'linux': 'Linux',
      'android': 'Android',
      'ios': 'iOS'
    };
    return labels[platform] || platform;
  }

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

// Initialize
const caPanel = new CertificateAuthorityPanel();
