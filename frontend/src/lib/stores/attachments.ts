/**
 * Attachments Store - Gestión de archivos adjuntos
 *
 * Gestiona:
 * - Lista de archivos adjuntos pendientes de enviar
 * - Añadir/quitar adjuntos
 * - Límites y validación
 */

import { writable, derived, get } from 'svelte/store';
import type { Attachment } from '$lib/ui-core';
import { generateUUID } from '$lib/utils';

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const MAX_ATTACHMENTS = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ============================================================================
// STORES
// ============================================================================

export const attachments = writable<Attachment[]>([]);

// ============================================================================
// STORES DERIVADOS
// ============================================================================

/**
 * Número de adjuntos
 */
export const attachmentCount = derived(attachments, ($attachments) => $attachments.length);

/**
 * ¿Hay adjuntos?
 */
export const hasAttachments = derived(attachments, ($attachments) => $attachments.length > 0);

/**
 * ¿Se puede añadir más?
 */
export const canAddMore = derived(attachments, ($attachments) => $attachments.length < MAX_ATTACHMENTS);

/**
 * Tamaño total de adjuntos
 */
export const totalSize = derived(attachments, ($attachments) => {
  return $attachments.reduce((sum, a) => sum + (a.size || 0), 0);
});

// ============================================================================
// ACCIONES
// ============================================================================

/**
 * Añadir adjunto
 */
export function addAttachment(attachment: Omit<Attachment, 'id'>): boolean {
  const current = get(attachments);

  // Validar límite
  if (current.length >= MAX_ATTACHMENTS) {
    console.warn('[attachments] Límite de adjuntos alcanzado');
    return false;
  }

  // Validar tamaño
  if (attachment.size && attachment.size > MAX_FILE_SIZE) {
    console.warn('[attachments] Archivo demasiado grande:', attachment.name);
    return false;
  }

  // Verificar duplicados por path
  if (current.some(a => a.path === attachment.path)) {
    console.warn('[attachments] Archivo ya adjuntado:', attachment.path);
    return false;
  }

  const newAttachment: Attachment = {
    ...attachment,
    id: generateUUID()
  };

  attachments.update(list => [...list, newAttachment]);
  return true;
}

/**
 * Añadir múltiples adjuntos
 */
export function addAttachments(files: Array<Omit<Attachment, 'id'>>): number {
  let added = 0;
  for (const file of files) {
    if (addAttachment(file)) {
      added++;
    }
  }
  return added;
}

/**
 * Quitar adjunto por ID
 */
export function removeAttachment(id: string): void {
  attachments.update(list => list.filter(a => a.id !== id));
}

/**
 * Quitar adjunto por path
 */
export function removeAttachmentByPath(path: string): void {
  attachments.update(list => list.filter(a => a.path !== path));
}

/**
 * Limpiar todos los adjuntos
 */
export function clearAttachments(): void {
  attachments.set([]);
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Obtener tipo de archivo por extensión
 */
export function getFileType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  const typeMap: Record<string, string> = {
    // Documentos
    pdf: 'document',
    doc: 'document',
    docx: 'document',
    txt: 'text',
    md: 'text',

    // Código
    js: 'code',
    ts: 'code',
    py: 'code',
    json: 'code',
    html: 'code',
    css: 'code',
    svelte: 'code',

    // Imágenes
    png: 'image',
    jpg: 'image',
    jpeg: 'image',
    gif: 'image',
    svg: 'image',
    webp: 'image',

    // Datos
    csv: 'data',
    xlsx: 'data',
    xls: 'data',
  };

  return typeMap[ext] || 'file';
}

/**
 * Obtener icono por tipo
 */
export function getAttachmentIcon(type: string): string {
  const iconMap: Record<string, string> = {
    document: '📄',
    text: '📝',
    code: '💻',
    image: '🖼️',
    data: '📊',
    file: '📎',
  };

  return iconMap[type] || '📎';
}

/**
 * Formatear tamaño de archivo
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// ============================================================================
// GETTERS
// ============================================================================

export function getAttachments(): Attachment[] {
  return get(attachments);
}

export function getAttachmentCount(): number {
  return get(attachments).length;
}
