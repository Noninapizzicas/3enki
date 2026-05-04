/**
 * contextStore — estado derivado del contexto activo (proyecto + conversación).
 *
 * Coherente con multi-tenancy.contract v1.1.0 + frontend.contract v1.2.0:
 * project_id y conversation_id son SIEMPRE obligatorios para el chat.
 * Si falta cualquiera de los dos, el frontend muestra el bloque canónico
 * setup_required (panel inline ≤33vh, no modal) y deshabilita el input
 * del chat hasta resolverlo.
 *
 * Este store NO escribe state — sólo deriva del activeProjectId
 * (projects.ts) y activeConversationId (conversations.ts) y expone
 * setupRequired como SetupNeed (qué falta) o null (todo presente).
 */

import { derived } from 'svelte/store';
import { activeProjectId } from './projects';
import { conversationsStore } from './conversations';

export type SetupNeed = 'project' | 'conversation' | 'both' | null;

export const setupRequired = derived(
  [activeProjectId, conversationsStore],
  ([$projectId, $conversations]): SetupNeed => {
    const hasProject = !!$projectId;
    const hasConversation = !!$conversations.activeConversationId;
    if (!hasProject && !hasConversation) return 'both';
    if (!hasProject) return 'project';
    if (!hasConversation) return 'conversation';
    return null;
  }
);

export const hasFullContext = derived(setupRequired, ($s) => $s === null);
