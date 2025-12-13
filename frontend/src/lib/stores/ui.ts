/**
 * UI Store - Estado de la interfaz
 *
 * Gestiona:
 * - Panel activo (re-exportado del registry)
 * - WorkBar expandida/colapsada
 * - Notificaciones
 */

import { writable, derived } from 'svelte/store';
import {
  activePanel as registryActivePanel,
  openPanel as registryOpenPanel,
  closePanel as registryClosePanel
} from '$lib/ui-core/registry';

// ============================================================================
// PANEL ACTIVO (delegado al registry para consistencia)
// ============================================================================

export const activePanel = registryActivePanel;

export function openPanel(panelId: string): void {
  registryOpenPanel(panelId);
}

export function closePanel(): void {
  registryClosePanel();
}

export const isPanelOpen = derived(activePanel, ($panel) => $panel !== null);

// ============================================================================
// WORK BAR
// ============================================================================

export const workBarExpanded = writable<boolean>(true);

export function toggleWorkBar(): void {
  workBarExpanded.update(v => !v);
}

export function expandWorkBar(): void {
  workBarExpanded.set(true);
}

export function collapseWorkBar(): void {
  workBarExpanded.set(false);
}

// ============================================================================
// NOTIFICACIONES
// ============================================================================

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: string;
}

export const notifications = writable<Notification[]>([]);

// Derived: contador de notificaciones
export const notificationCount = derived(notifications, ($notifications) => $notifications.length);

export function addNotification(type: Notification['type'], message: string): void {
  const notification: Notification = {
    id: crypto.randomUUID(),
    type,
    message,
    timestamp: new Date().toISOString()
  };

  notifications.update(list => [...list, notification]);

  // Auto-remove después de 5 segundos
  setTimeout(() => {
    removeNotification(notification.id);
  }, 5000);
}

export function removeNotification(id: string): void {
  notifications.update(list => list.filter(n => n.id !== id));
}

export function clearNotifications(): void {
  notifications.set([]);
}

// Helpers
export function notifySuccess(message: string): void {
  addNotification('success', message);
}

export function notifyError(message: string): void {
  addNotification('error', message);
}

export function notifyWarning(message: string): void {
  addNotification('warning', message);
}

export function notifyInfo(message: string): void {
  addNotification('info', message);
}
