/**
 * Módulo Certificate Authority
 *
 * Gestión de certificados digitales: emisión, revocación, renovación.
 * Se integra en LazyShell con work-bar + chat + panel flotante.
 */

import type { UIModule } from '$lib/ui-core';
import CertificateAuthorityPanel from './CertificateAuthorityPanel.svelte';

export const certificateAuthorityModule: UIModule = {
  manifest: {
    id: 'certificate-authority',
    name: 'Certificados',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'certificate-authority-btn',
      icon: '🔐',
      label: 'Certificados',
      action: { type: 'panel', panelId: 'certificate-authority-panel' },
      order: 2
    },
    panels: [{
      id: 'certificate-authority-panel',
      title: 'Certificados',
      size: 'lg'
    }]
  },
  PanelComponent: CertificateAuthorityPanel
};

export default certificateAuthorityModule;

export { default as CertificateAuthorityPanel } from './CertificateAuthorityPanel.svelte';

export {
  caStore,
  filteredCertificates,
  selectedCertificate,
  caStats,
  caLoading,
  caError,
  initCASubscriptions,
  loadCertificates,
  loadStatus,
  loadCRL,
  issueCertificate,
  revokeCertificate,
  renewCertificate,
  downloadP12,
  getCACert,
  setActiveTab,
  selectCertificate,
  setFilter,
  clearError,
  type Certificate,
  type CertType,
  type CertStatus,
  type CAState
} from '$lib/stores/certificate-authority';
