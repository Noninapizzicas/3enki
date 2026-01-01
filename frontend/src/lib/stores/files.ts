/**
 * Files Store - MQTT Request/Response
 *
 * Unified file management combining:
 * - file-browser: Navigation, CRUD, search
 * - text-editor: Open, save, validate, format
 * - pdf-viewer: View PDFs
 *
 * @see contexto/ui-generator.json
 */

import { writable, derived } from 'svelte/store';
import {
  mqttRequest,
  MqttTimeoutError,
  MqttRequestError
} from '$lib/ui-core/mqtt-request';

// =============================================================================
// TYPES
// =============================================================================

export interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  extension?: string | null;
  size: number;
  modified: string;
  // Root mode enrichment for project directories
  displayName?: string;
  projectId?: string;
}

export interface FileContent {
  file_path: string;
  type: 'text' | 'image' | 'pdf';
  content: string;
  content_type?: string;
  extension?: string;
  size: number;
  modified: string;
  readonly?: boolean;
}

export interface SearchResult {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
  match_type: 'filename' | 'content';
}

export type ViewType = 'explorer' | 'editor' | 'pdf' | 'image';

export interface FilesStoreState {
  // Navigation
  currentPath: string;
  files: FileItem[];
  pathHistory: string[];

  // Current file
  currentFile: FileContent | null;
  currentFilePath: string | null;
  currentView: ViewType;

  // Editor state
  editorContent: string;
  editorDirty: boolean;
  editorValidation: {
    valid: boolean;
    errors: Array<{ line: number | null; message: string; type: string }>;
    warnings: Array<{ line: number | null; message: string; type: string }>;
  } | null;

  // Search
  searchQuery: string;
  searchResults: SearchResult[];
  searchActive: boolean;

  // Loading/Error
  loading: boolean;
  error: string | null;
  saving: boolean;

  // Project context
  projectId: string | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const TEXT_EXTENSIONS = ['md', 'json', 'txt', 'html', 'css', 'js', 'ts', 'yaml', 'yml', 'xml', 'svelte', 'jsx', 'tsx'];
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'];
export const PDF_EXTENSION = 'pdf';

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: FilesStoreState = {
  currentPath: '/',
  files: [],
  pathHistory: ['/'],
  currentFile: null,
  currentFilePath: null,
  currentView: 'explorer',
  editorContent: '',
  editorDirty: false,
  editorValidation: null,
  searchQuery: '',
  searchResults: [],
  searchActive: false,
  loading: false,
  error: null,
  saving: false,
  projectId: null
};

// =============================================================================
// STORE
// =============================================================================

export const filesStore = writable<FilesStoreState>(initialState);

// =============================================================================
// ACTIONS - Navigation
// =============================================================================

/**
 * Sets the current project context (optional - can work in root mode)
 */
export function setProject(projectId: string | null): void {
  filesStore.update(s => ({ ...s, projectId, currentPath: '/' }));
  listFiles('/');
}

/**
 * Lists files in a directory
 * Works in root mode (no project) or project mode
 */
export async function listFiles(path: string = '/'): Promise<void> {
  filesStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    let projectId: string | null = null;
    filesStore.subscribe(s => { projectId = s.projectId; })();

    // Root mode: project_id is optional
    const response = await mqttRequest<{
      project_id: string | null;
      path: string;
      files: FileItem[];
      root_mode: boolean;
    }>('fs', 'list', { project_id: projectId, path });

    filesStore.update(s => ({
      ...s,
      currentPath: path,
      files: response.data.files || [],
      pathHistory: path === '/' ? ['/'] : [...s.pathHistory.filter(p => p !== path), path],
      loading: false,
      error: null,
      // Clear file view when navigating
      currentFile: null,
      currentFilePath: null,
      currentView: 'explorer',
      searchActive: false
    }));

    console.log('[Files] Listed:', response.data.files?.length || 0, 'items at', path, response.data.root_mode ? '(root mode)' : '');
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    filesStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Files] List failed:', errorMessage);
  }
}

/**
 * Navigate to parent directory
 */
export function navigateUp(): void {
  let currentPath = '/';
  filesStore.subscribe(s => { currentPath = s.currentPath; })();

  if (currentPath === '/') return;

  const parts = currentPath.split('/').filter(Boolean);
  parts.pop();
  const parentPath = '/' + parts.join('/');

  listFiles(parentPath || '/');
}

/**
 * Navigate to a specific path in history
 */
export function navigateTo(path: string): void {
  listFiles(path);
}

// =============================================================================
// ACTIONS - File Operations
// =============================================================================

/**
 * Opens a file for viewing/editing
 * Works in root mode (no project) or project mode
 */
export async function openFile(filePath: string): Promise<void> {
  filesStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    let projectId: string | null = null;
    filesStore.subscribe(s => { projectId = s.projectId; })();

    // Determine file type by extension
    const ext = filePath.split('.').pop()?.toLowerCase() || '';

    let viewType: ViewType = 'explorer';
    let fileContent: FileContent;

    if (ext === PDF_EXTENSION) {
      // Use pdf-viewer
      const response = await mqttRequest<{
        file_path: string;
        size: number;
        size_formatted: string;
        modified: string;
        content: string;
        content_type: string;
      }>('pdf', 'view', { project_id: projectId, file_path: filePath });

      fileContent = {
        file_path: response.data.file_path,
        type: 'pdf',
        content: response.data.content,
        content_type: response.data.content_type,
        size: response.data.size,
        modified: response.data.modified
      };
      viewType = 'pdf';

    } else if (IMAGE_EXTENSIONS.includes(ext)) {
      // Use filesystem for images (reads as base64)
      const response = await mqttRequest<{
        file_path: string;
        type: 'image';
        content: string;
        content_type: string;
        size: number;
        modified: string;
      }>('fs', 'read', { project_id: projectId, file_path: filePath });

      fileContent = {
        file_path: response.data.file_path,
        type: 'image',
        content: response.data.content,
        content_type: response.data.content_type,
        size: response.data.size,
        modified: response.data.modified
      };
      viewType = 'image';

    } else {
      // Use filesystem for text files (fs.read supports text)
      const response = await mqttRequest<{
        path: string;
        content: string;
        encoding: string;
        size: number;
        modified: string;
        type: string;
      }>('fs', 'read', { path: filePath });

      fileContent = {
        file_path: response.data.path,
        type: 'text',
        content: response.data.content,
        extension: ext,
        size: response.data.size,
        modified: response.data.modified,
        readonly: false
      };
      viewType = 'editor';
    }

    filesStore.update(s => ({
      ...s,
      currentFile: fileContent,
      currentFilePath: filePath,
      currentView: viewType,
      editorContent: fileContent.type === 'text' ? fileContent.content : '',
      editorDirty: false,
      editorValidation: null,
      loading: false,
      error: null
    }));

    console.log('[Files] Opened:', filePath, 'as', viewType);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    filesStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Files] Open failed:', errorMessage);
  }
}

/**
 * Saves the current file
 */
export async function saveFile(): Promise<boolean> {
  let state: FilesStoreState = initialState;
  filesStore.subscribe(s => { state = s; })();

  if (!state.currentFilePath) {
    console.error('[Files] Cannot save: no file open');
    return false;
  }

  filesStore.update(s => ({ ...s, saving: true, error: null }));

  try {
    await mqttRequest<{
      path: string;
      created: boolean;
      size: number;
    }>('fs', 'write', {
      path: state.currentFilePath,
      content: state.editorContent
    });

    filesStore.update(s => ({
      ...s,
      saving: false,
      editorDirty: false,
      error: null
    }));

    console.log('[Files] Saved:', state.currentFilePath);
    return true;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    filesStore.update(s => ({ ...s, saving: false, error: errorMessage }));
    console.error('[Files] Save failed:', errorMessage);
    return false;
  }
}

/**
 * Creates a new file or directory
 */
export async function createFile(
  fileName: string,
  type: 'file' | 'directory' = 'file',
  content: string = ''
): Promise<boolean> {
  let state: FilesStoreState = initialState;
  filesStore.subscribe(s => { state = s; })();

  filesStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const filePath = state.currentPath === '/'
      ? `/${fileName}`
      : `${state.currentPath}/${fileName}`;

    if (type === 'directory') {
      // Use fs/mkdir for directories
      await mqttRequest<{
        path: string;
        created: boolean;
      }>('fs', 'mkdir', {
        project_id: state.projectId,
        path: filePath
      });
    } else {
      // Use fs/write for files
      await mqttRequest<{
        file_path: string;
        written: boolean;
        size: number;
      }>('fs', 'write', {
        project_id: state.projectId,
        file_path: filePath,
        content
      });
    }

    // Refresh file list
    await listFiles(state.currentPath);

    console.log('[Files] Created:', filePath);
    return true;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    filesStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Files] Create failed:', errorMessage);
    return false;
  }
}

/**
 * Deletes a file or directory
 */
export async function deleteFile(filePath: string): Promise<boolean> {
  let state: FilesStoreState = initialState;
  filesStore.subscribe(s => { state = s; })();

  filesStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    await mqttRequest<{
      file_path: string;
      deleted: boolean;
    }>('fs', 'delete', {
      project_id: state.projectId,
      file_path: filePath
    });

    // If we deleted the current file, go back to explorer
    if (state.currentFilePath === filePath) {
      filesStore.update(s => ({
        ...s,
        currentFile: null,
        currentFilePath: null,
        currentView: 'explorer'
      }));
    }

    // Refresh file list
    await listFiles(state.currentPath);

    console.log('[Files] Deleted:', filePath);
    return true;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    filesStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Files] Delete failed:', errorMessage);
    return false;
  }
}

/**
 * Moves a file or directory to a new location
 */
export async function moveFile(fromPath: string, toPath: string): Promise<boolean> {
  let state: FilesStoreState = initialState;
  filesStore.subscribe(s => { state = s; })();

  filesStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    await mqttRequest<{
      from: string;
      to: string;
      moved: boolean;
    }>('fs', 'move', {
      from: fromPath,
      to: toPath
    });

    // Refresh file list
    await listFiles(state.currentPath);

    console.log('[Files] Moved:', fromPath, '->', toPath);
    return true;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    filesStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Files] Move failed:', errorMessage);
    return false;
  }
}

// =============================================================================
// ACTIONS - Search
// =============================================================================

/**
 * Searches for files
 */
export async function searchFiles(query: string, searchContent: boolean = false): Promise<void> {
  if (!query.trim()) {
    filesStore.update(s => ({
      ...s,
      searchQuery: '',
      searchResults: [],
      searchActive: false
    }));
    return;
  }

  filesStore.update(s => ({ ...s, loading: true, error: null, searchQuery: query, searchActive: true }));

  try {
    let projectId: string | null = null;
    filesStore.subscribe(s => { projectId = s.projectId; })();

    const response = await mqttRequest<{
      query: string;
      results: SearchResult[];
      count: number;
    }>('fs', 'search', {
      project_id: projectId,
      query,
      search_content: searchContent
    });

    filesStore.update(s => ({
      ...s,
      searchResults: response.data.results || [],
      loading: false,
      error: null
    }));

    console.log('[Files] Search:', response.data.count, 'results for', query);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    filesStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Files] Search failed:', errorMessage);
  }
}

/**
 * Clears search results
 */
export function clearSearch(): void {
  filesStore.update(s => ({
    ...s,
    searchQuery: '',
    searchResults: [],
    searchActive: false
  }));
}

// =============================================================================
// ACTIONS - Editor
// =============================================================================

/**
 * Updates editor content
 */
export function updateEditorContent(content: string): void {
  filesStore.update(s => ({
    ...s,
    editorContent: content,
    editorDirty: content !== (s.currentFile?.content || '')
  }));
}

/**
 * Validates editor content
 */
export async function validateContent(): Promise<boolean> {
  let state: FilesStoreState = initialState;
  filesStore.subscribe(s => { state = s; })();

  if (!state.currentFile || state.currentFile.type !== 'text') {
    return true;
  }

  const ext = state.currentFile.extension || '';

  try {
    const response = await mqttRequest<{
      valid: boolean;
      errors: Array<{ line: number | null; message: string; type: string }>;
      warnings: Array<{ line: number | null; message: string; type: string }>;
    }>('editor', 'validate', {
      content: state.editorContent,
      format: ext
    });

    filesStore.update(s => ({
      ...s,
      editorValidation: response.data
    }));

    return response.data.valid;
  } catch (error) {
    console.error('[Files] Validate failed:', getErrorMessage(error));
    return true; // Don't block on validation error
  }
}

/**
 * Formats editor content
 */
export async function formatContent(): Promise<void> {
  let state: FilesStoreState = initialState;
  filesStore.subscribe(s => { state = s; })();

  if (!state.currentFile || state.currentFile.type !== 'text') {
    return;
  }

  const ext = state.currentFile.extension || '';

  try {
    const response = await mqttRequest<{
      formatted: string;
      changed: boolean;
    }>('editor', 'format', {
      content: state.editorContent,
      format: ext
    });

    if (response.data.changed) {
      filesStore.update(s => ({
        ...s,
        editorContent: response.data.formatted,
        editorDirty: true
      }));
      console.log('[Files] Formatted content');
    }
  } catch (error) {
    console.error('[Files] Format failed:', getErrorMessage(error));
  }
}

// =============================================================================
// ACTIONS - View
// =============================================================================

/**
 * Closes the current file and returns to explorer
 */
export function closeFile(): void {
  filesStore.update(s => ({
    ...s,
    currentFile: null,
    currentFilePath: null,
    currentView: 'explorer',
    editorContent: '',
    editorDirty: false,
    editorValidation: null
  }));
}

/**
 * Sets the current view
 */
export function setView(view: ViewType): void {
  filesStore.update(s => ({ ...s, currentView: view }));
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getErrorMessage(error: unknown): string {
  if (error instanceof MqttTimeoutError) {
    return 'Request timeout - server did not respond';
  }
  if (error instanceof MqttRequestError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
}

/**
 * Gets the icon for a file type
 */
export function getFileIcon(item: FileItem): string {
  if (item.type === 'directory') return '📁';

  const ext = item.extension?.replace('.', '') || '';
  const icons: Record<string, string> = {
    md: '📝',
    json: '📋',
    ts: '💻',
    js: '💻',
    svelte: '🔥',
    pdf: '📕',
    png: '🖼️',
    jpg: '🖼️',
    jpeg: '🖼️',
    gif: '🖼️',
    txt: '📄',
    html: '🌐',
    css: '🎨',
    yaml: '⚙️',
    yml: '⚙️'
  };

  return icons[ext] || '📎';
}

/**
 * Formats file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initializes the files store
 */
export function initFiles(projectId?: string): () => void {
  if (projectId) {
    setProject(projectId);
  }

  return () => {
    filesStore.set(initialState);
  };
}

// =============================================================================
// DERIVED STORES
// =============================================================================

/** Current view */
export const currentView = derived(filesStore, $s => $s.currentView);

/** Current path */
export const currentPath = derived(filesStore, $s => $s.currentPath);

/** Current file list */
export const files = derived(filesStore, $s => $s.files);

/** Current file content */
export const currentFile = derived(filesStore, $s => $s.currentFile);

/** Path breadcrumbs */
export const breadcrumbs = derived(filesStore, $s => {
  const parts = $s.currentPath.split('/').filter(Boolean);
  const crumbs = [{ name: 'Root', path: '/' }];

  let accumulated = '';
  for (const part of parts) {
    accumulated += '/' + part;
    crumbs.push({ name: part, path: accumulated });
  }

  return crumbs;
});

/** Editor dirty state */
export const editorDirty = derived(filesStore, $s => $s.editorDirty);

/** Loading state */
export const isLoading = derived(filesStore, $s => $s.loading);

/** Saving state */
export const isSaving = derived(filesStore, $s => $s.saving);

/** Error state */
export const filesError = derived(filesStore, $s => $s.error);

/** Search active */
export const searchActive = derived(filesStore, $s => $s.searchActive);

/** Search results */
export const searchResults = derived(filesStore, $s => $s.searchResults);

/** Can save (editor dirty and not saving) */
export const canSave = derived(filesStore, $s => $s.editorDirty && !$s.saving && $s.currentView === 'editor');
