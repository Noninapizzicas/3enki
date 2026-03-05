/**
 * Certificate Authority Store - MQTT Request/Response + Real-time Events
 *
 * Gestión de certificados digitales:
 * - Emitir, revocar, renovar certificados via mqttRequest
 * - Real-time updates via subscriptions (certificate.issued, etc.)
 * - Estadísticas de la CA
 */

import { writable, derived, get } from 'svelte/store';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import {
  mqttRequest,
  MqttTimeoutError,
  MqttRequestError
} from '$lib/ui-core/mqtt-request';

// =============================================================================
// TYPES
// =============================================================================

export type CertType = 'client' | 'device';
export type CertStatus = 'active' | 'revoked' | 'expired';

export interface Certificate {
  serialNumber: string;
  commonName: string;
  type: CertType;
  identifier: string;
  organization?: string;
  email?: string;
  fingerprint: string;
  status: CertStatus;
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string;
  revokeReason?: string;
}

export interface CRLEntry {
  serialNumber: string;
  revokedAt: string;
  reason: string;
}

export interface CAStats {
  ca_initialized: boolean;
  total: number;
  active: number;
  revoked: number;
  expired: number;
  expiring_soon: number;
}

export interface CAState {
  certificates: Certificate[];
  crl: CRLEntry[];
  stats: CAStats;
  selectedSerial: string | null;
  filter: {
    type: CertType | 'all';
    status: CertStatus | 'all';
    search: string;
  };
  loading: boolean;
  error: string | null;
  activeTab: 'clients' | 'devices' | 'crl' | 'ca';
}

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: CAState = {
  certificates: [],
  crl: [],
  stats: {
    ca_initialized: false,
    total: 0,
    active: 0,
    revoked: 0,
    expired: 0,
    expiring_soon: 0
  },
  selectedSerial: null,
  filter: {
    type: 'all',
    status: 'all',
    search: ''
  },
  loading: false,
  error: null,
  activeTab: 'clients'
};

// =============================================================================
// STORE
// =============================================================================

export const caStore = writable<CAState>(initialState);

// =============================================================================
// ACTIONS - DATA LOADING
// =============================================================================

/**
 * Carga la lista de certificados
 */
export async function loadCertificates(): Promise<void> {
  caStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const response = await mqttRequest<{
      certificates: Certificate[];
      total: number;
    }>('certificate-authority', 'list', {});

    caStore.update(s => ({
      ...s,
      certificates: response.data.certificates || [],
      loading: false,
      error: null
    }));

    await loadStatus();
    console.log('[CA] Loaded:', response.data.total, 'certificates');
  } catch (error) {
    const msg = getErrorMessage(error);
    caStore.update(s => ({ ...s, loading: false, error: msg }));
    console.error('[CA] Load failed:', msg);
  }
}

/**
 * Carga estado y estadísticas de la CA
 */
export async function loadStatus(): Promise<void> {
  try {
    const response = await mqttRequest<{
      ca: CAStats;
    }>('certificate-authority', 'status', {});

    caStore.update(s => ({
      ...s,
      stats: response.data.ca || s.stats
    }));
  } catch (error) {
    console.error('[CA] Status failed:', getErrorMessage(error));
  }
}

/**
 * Carga la CRL
 */
export async function loadCRL(): Promise<void> {
  try {
    const response = await mqttRequest<{
      revoked: CRLEntry[];
    }>('certificate-authority', 'crl', {});

    caStore.update(s => ({
      ...s,
      crl: response.data.revoked || []
    }));
  } catch (error) {
    console.error('[CA] CRL failed:', getErrorMessage(error));
  }
}

// =============================================================================
// ACTIONS - CERTIFICATE OPERATIONS
// =============================================================================

/**
 * Emite un nuevo certificado
 */
export async function issueCertificate(opts: {
  commonName: string;
  type: CertType;
  identifier: string;
  organization?: string;
  email?: string;
  validityDays?: number;
  passphrase?: string;
}): Promise<boolean> {
  caStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    await mqttRequest('certificate-authority', 'issue', opts);
    await loadCertificates();
    console.log('[CA] Issued:', opts.commonName);
    return true;
  } catch (error) {
    const msg = getErrorMessage(error);
    caStore.update(s => ({ ...s, loading: false, error: msg }));
    console.error('[CA] Issue failed:', msg);
    return false;
  }
}

/**
 * Revoca un certificado
 */
export async function revokeCertificate(
  serialNumber: string,
  reason: string = 'unspecified'
): Promise<boolean> {
  caStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    await mqttRequest('certificate-authority', 'revoke', { serialNumber, reason });
    await loadCertificates();
    await loadCRL();
    console.log('[CA] Revoked:', serialNumber);
    return true;
  } catch (error) {
    const msg = getErrorMessage(error);
    caStore.update(s => ({ ...s, loading: false, error: msg }));
    console.error('[CA] Revoke failed:', msg);
    return false;
  }
}

/**
 * Renueva un certificado
 */
export async function renewCertificate(
  serialNumber: string,
  passphrase?: string,
  validityDays?: number
): Promise<boolean> {
  caStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    await mqttRequest('certificate-authority', 'renew', {
      serialNumber,
      passphrase,
      validityDays
    });
    await loadCertificates();
    console.log('[CA] Renewed:', serialNumber);
    return true;
  } catch (error) {
    const msg = getErrorMessage(error);
    caStore.update(s => ({ ...s, loading: false, error: msg }));
    console.error('[CA] Renew failed:', msg);
    return false;
  }
}

/**
 * Descarga el bundle P12 de un certificado
 */
export async function downloadP12(serialNumber: string): Promise<string | null> {
  try {
    const response = await mqttRequest<{
      bundle: string;
      filename: string;
      contentType: string;
    }>('certificate-authority', 'download-p12', { serialNumber });

    return response.data.bundle;
  } catch (error) {
    console.error('[CA] Download P12 failed:', getErrorMessage(error));
    caStore.update(s => ({ ...s, error: getErrorMessage(error) }));
    return null;
  }
}

/**
 * Obtiene el certificado raíz de la CA
 */
export async function getCACert(): Promise<{
  certificate: string;
  instructions: Record<string, string>;
} | null> {
  try {
    const response = await mqttRequest<{
      certificate: string;
      instructions: Record<string, string>;
    }>('certificate-authority', 'ca-cert', {});

    return response.data;
  } catch (error) {
    console.error('[CA] Get CA cert failed:', getErrorMessage(error));
    caStore.update(s => ({ ...s, error: getErrorMessage(error) }));
    return null;
  }
}

// =============================================================================
// UI ACTIONS
// =============================================================================

export function setActiveTab(tab: CAState['activeTab']): void {
  caStore.update(s => ({ ...s, activeTab: tab }));
}

export function selectCertificate(serial: string | null): void {
  caStore.update(s => ({ ...s, selectedSerial: serial }));
}

export function setFilter(filter: Partial<CAState['filter']>): void {
  caStore.update(s => ({
    ...s,
    filter: { ...s.filter, ...filter }
  }));
}

export function clearError(): void {
  caStore.update(s => ({ ...s, error: null }));
}

// =============================================================================
// REAL-TIME SUBSCRIPTIONS
// =============================================================================

let cleanupFns: (() => void)[] = [];

/**
 * Inicializa suscripciones a eventos en tiempo real
 */
export function initCASubscriptions(): () => void {
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];

  // Certificado emitido
  cleanupFns.push(
    mqttSubscribe('certificate.issued', () => {
      console.log('[CA] Certificate issued event');
      loadCertificates();
    })
  );

  // Certificado revocado
  cleanupFns.push(
    mqttSubscribe('certificate.revoked', () => {
      console.log('[CA] Certificate revoked event');
      loadCertificates();
      loadCRL();
    })
  );

  // Certificado renovado
  cleanupFns.push(
    mqttSubscribe('certificate.renewed', () => {
      console.log('[CA] Certificate renewed event');
      loadCertificates();
    })
  );

  // Cargar datos iniciales
  loadCertificates();
  loadCRL();

  return () => {
    cleanupFns.forEach(fn => fn());
    cleanupFns = [];
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function getErrorMessage(error: unknown): string {
  if (error instanceof MqttTimeoutError) {
    return 'Timeout - el servidor no respondió';
  }
  if (error instanceof MqttRequestError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Error desconocido';
}

// =============================================================================
// DERIVED STORES
// =============================================================================

/** Certificados filtrados */
export const filteredCertificates = derived(caStore, $s => {
  let result = $s.certificates;

  // Filtrar por tipo (tab)
  if ($s.activeTab === 'clients') {
    result = result.filter(c => c.type === 'client');
  } else if ($s.activeTab === 'devices') {
    result = result.filter(c => c.type === 'device');
  }

  // Filtrar por estado
  if ($s.filter.status !== 'all') {
    result = result.filter(c => c.status === $s.filter.status);
  }

  // Filtrar por búsqueda
  if ($s.filter.search) {
    const search = $s.filter.search.toLowerCase();
    result = result.filter(c =>
      c.commonName.toLowerCase().includes(search) ||
      c.identifier.toLowerCase().includes(search) ||
      c.serialNumber.toLowerCase().includes(search) ||
      c.email?.toLowerCase().includes(search) ||
      c.organization?.toLowerCase().includes(search)
    );
  }

  return result;
});

/** Certificado seleccionado */
export const selectedCertificate = derived(caStore, $s =>
  $s.certificates.find(c => c.serialNumber === $s.selectedSerial) || null
);

/** Estadísticas */
export const caStats = derived(caStore, $s => $s.stats);

/** Loading */
export const caLoading = derived(caStore, $s => $s.loading);

/** Error */
export const caError = derived(caStore, $s => $s.error);
