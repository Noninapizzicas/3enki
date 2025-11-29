/**
 * FileDropZone Component
 * Zona de carga de archivos genérica con drag & drop, camera, clipboard y preview
 * @version 1.0.0
 */

class FileDropZone {
  constructor(element, config = {}) {
    this.element = element;
    this.config = { ...this.parseConfig(), ...config };
    this.files = [];
    this.uploading = false;
    this.state = 'idle'; // idle, dragging, uploading, success, error

    this.init();
  }

  parseConfig() {
    const config = {};

    // Parse data attributes
    config.variant = this.element.getAttribute('data-variant') || 'any';
    config.size = this.element.getAttribute('data-size') || 'md';
    config.maxFileSize = parseInt(this.element.getAttribute('data-max-file-size')) || 10485760;
    config.maxFiles = parseInt(this.element.getAttribute('data-max-files')) || 1;
    config.uploadMode = this.element.getAttribute('data-upload-mode') || 'single';
    config.captureMode = this.element.getAttribute('data-capture-mode') || 'none';
    config.showPreview = this.element.getAttribute('data-show-preview') !== 'false';
    config.enablePaste = this.element.getAttribute('data-enable-paste') !== 'false';
    config.enableCrop = this.element.getAttribute('data-enable-crop') === 'true';
    config.dropMessage = this.element.getAttribute('data-drop-message') || 'Arrastra archivos aquí o haz click para seleccionar';
    config.icon = this.element.getAttribute('data-icon') || '📁';
    config.endpoint = this.element.getAttribute('data-endpoint');
    config.uploadOnSelect = this.element.getAttribute('data-upload-on-select') === 'true';
    config.showProgress = this.element.getAttribute('data-show-progress') !== 'false';
    config.thumbnailSize = this.element.getAttribute('data-thumbnail-size') || '120px';
    config.compressionEnabled = this.element.getAttribute('data-compression-enabled') === 'true';
    config.compressionQuality = parseFloat(this.element.getAttribute('data-compression-quality')) || 0.8;
    config.disabled = this.element.hasAttribute('disabled');

    // Parse accepted types
    const acceptedTypesAttr = this.element.getAttribute('data-accepted-types');
    config.acceptedTypes = acceptedTypesAttr ? JSON.parse(acceptedTypesAttr) : this.getVariantAcceptedTypes(config.variant);

    // Parse metadata
    const metadataAttr = this.element.getAttribute('data-metadata');
    config.metadata = metadataAttr ? JSON.parse(metadataAttr) : {};

    return config;
  }

  getVariantAcceptedTypes(variant) {
    const types = {
      'image-only': ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      'document': ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      'media': ['image/*', 'video/mp4', 'video/webm', 'video/ogg'],
      'any': ['*/*']
    };
    return types[variant] || types.any;
  }

  init() {
    this.render();
    this.attachEventListeners();

    if (this.config.enablePaste) {
      this.enablePasteSupport();
    }
  }

  render() {
    this.element.classList.add('file-drop-zone');
    this.element.classList.add(`file-drop-zone--${this.config.variant}`);
    this.element.classList.add(`file-drop-zone--${this.config.size}`);
    this.element.setAttribute('role', 'region');
    this.element.setAttribute('aria-label', 'Zona de carga de archivos');
    this.element.setAttribute('tabindex', '0');

    if (this.config.disabled) {
      this.element.classList.add('file-drop-zone--disabled');
    }

    this.element.innerHTML = `
      <div class="file-drop-zone__inner">
        <div class="file-drop-zone__icon">${this.config.icon}</div>
        <div class="file-drop-zone__message">${this.config.dropMessage}</div>
        <div class="file-drop-zone__hint">o haz click para seleccionar</div>
        ${this.config.captureMode !== 'none' ? '<button class="file-drop-zone__camera-btn" aria-label="Abrir cámara">📷 Cámara</button>' : ''}
      </div>

      <div class="file-drop-zone__preview" style="display: none;"></div>

      <div class="file-drop-zone__progress" style="display: none;">
        <div class="file-drop-zone__progress-bar"></div>
        <div class="file-drop-zone__progress-text">0%</div>
      </div>

      <input
        type="file"
        class="file-drop-zone__input"
        ${this.config.uploadMode === 'multiple' ? 'multiple' : ''}
        accept="${this.config.acceptedTypes.join(',')}"
        ${this.config.captureMode !== 'none' ? `capture="${this.config.captureMode}"` : ''}
        style="display: none;"
      />
    `;

    this.inputElement = this.element.querySelector('.file-drop-zone__input');
    this.previewElement = this.element.querySelector('.file-drop-zone__preview');
    this.progressElement = this.element.querySelector('.file-drop-zone__progress');
    this.progressBar = this.element.querySelector('.file-drop-zone__progress-bar');
    this.progressText = this.element.querySelector('.file-drop-zone__progress-text');
    this.cameraBtn = this.element.querySelector('.file-drop-zone__camera-btn');
  }

  attachEventListeners() {
    // Drag & drop
    this.element.addEventListener('dragover', (e) => this.handleDragOver(e));
    this.element.addEventListener('dragleave', (e) => this.handleDragLeave(e));
    this.element.addEventListener('drop', (e) => this.handleDrop(e));

    // Click to select
    this.element.addEventListener('click', (e) => {
      if (!this.config.disabled && !e.target.classList.contains('file-drop-zone__camera-btn')) {
        this.inputElement.click();
      }
    });

    // Camera button
    if (this.cameraBtn) {
      this.cameraBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openCamera();
      });
    }

    // File input change
    this.inputElement.addEventListener('change', (e) => this.handleFileSelect(e));

    // Keyboard support
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.inputElement.click();
      }
    });
  }

  enablePasteSupport() {
    document.addEventListener('paste', (e) => {
      if (this.element.contains(document.activeElement) || document.activeElement === this.element) {
        this.handlePaste(e);
      }
    });
  }

  handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();

    if (!this.config.disabled) {
      this.setState('dragging');
      this.element.classList.add('file-drop-zone--dragging');
    }
  }

  handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();

    if (e.target === this.element) {
      this.setState('idle');
      this.element.classList.remove('file-drop-zone--dragging');
    }
  }

  handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    this.element.classList.remove('file-drop-zone--dragging');

    if (this.config.disabled) return;

    const files = Array.from(e.dataTransfer.files);
    this.processFiles(files);
  }

  handleFileSelect(e) {
    const files = Array.from(e.target.files);
    this.processFiles(files);
  }

  handlePaste(e) {
    e.preventDefault();

    const items = Array.from(e.clipboardData.items);
    const files = items
      .filter(item => item.kind === 'file')
      .map(item => item.getAsFile());

    if (files.length > 0) {
      this.processFiles(files);
    }
  }

  openCamera() {
    // Trigger file input with capture mode
    this.inputElement.click();
  }

  async processFiles(files) {
    // Validate file count
    if (this.config.uploadMode === 'single' && files.length > 1) {
      files = [files[0]];
    }

    if (files.length > this.config.maxFiles) {
      this.showError(`Máximo ${this.config.maxFiles} archivo(s) permitido(s)`);
      this.dispatchEvent('validationError', { reason: 'maxFiles', maxFiles: this.config.maxFiles });
      return;
    }

    // Validate each file
    const validFiles = [];
    for (const file of files) {
      if (this.validateFile(file)) {
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) return;

    this.files = validFiles;
    this.dispatchEvent('fileSelected', { files: validFiles });

    // Show preview
    if (this.config.showPreview) {
      await this.showPreview(validFiles);
    }

    // Upload if configured
    if (this.config.uploadOnSelect) {
      this.upload();
    }
  }

  validateFile(file) {
    // Validate size
    if (file.size > this.config.maxFileSize) {
      const maxSizeMB = (this.config.maxFileSize / 1048576).toFixed(1);
      this.showError(`Archivo demasiado grande. Máximo: ${maxSizeMB}MB`);
      this.dispatchEvent('validationError', { reason: 'fileSize', file, maxSize: this.config.maxFileSize });
      return false;
    }

    // Validate type
    const acceptsAll = this.config.acceptedTypes.includes('*/*');
    const acceptsType = this.config.acceptedTypes.some(type => {
      if (type.endsWith('/*')) {
        const baseType = type.split('/')[0];
        return file.type.startsWith(baseType + '/');
      }
      return file.type === type;
    });

    if (!acceptsAll && !acceptsType) {
      this.showError(`Tipo de archivo no permitido: ${file.type}`);
      this.dispatchEvent('validationError', { reason: 'fileType', file, acceptedTypes: this.config.acceptedTypes });
      return false;
    }

    return true;
  }

  async showPreview(files) {
    this.previewElement.innerHTML = '';
    this.previewElement.style.display = 'flex';

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const thumbnail = document.createElement('div');
      thumbnail.className = 'file-drop-zone__thumbnail';
      thumbnail.style.width = this.config.thumbnailSize;
      thumbnail.style.height = this.config.thumbnailSize;

      // Preview for images
      if (file.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.onload = () => URL.revokeObjectURL(img.src);
        thumbnail.appendChild(img);
      } else {
        // Generic file icon
        const icon = document.createElement('div');
        icon.className = 'file-drop-zone__file-icon';
        icon.textContent = this.getFileIcon(file.type);
        thumbnail.appendChild(icon);
      }

      // File info
      const info = document.createElement('div');
      info.className = 'file-drop-zone__file-info';
      info.innerHTML = `
        <div class="file-drop-zone__file-name">${file.name}</div>
        <div class="file-drop-zone__file-size">${this.formatFileSize(file.size)}</div>
      `;
      thumbnail.appendChild(info);

      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.className = 'file-drop-zone__remove-btn';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', 'Eliminar archivo');
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeFile(i);
      });
      thumbnail.appendChild(removeBtn);

      this.previewElement.appendChild(thumbnail);
    }
  }

  removeFile(index) {
    this.files.splice(index, 1);
    this.dispatchEvent('fileRemoved', { index });

    if (this.files.length === 0) {
      this.previewElement.style.display = 'none';
      this.setState('idle');
    } else {
      this.showPreview(this.files);
    }
  }

  async upload() {
    if (!this.config.endpoint) {
      console.error('FileDropZone: No endpoint configured');
      return;
    }

    if (this.files.length === 0) {
      return;
    }

    this.setState('uploading');
    this.uploading = true;
    this.showProgress(0);

    this.dispatchEvent('uploadStart', { files: this.files });

    try {
      const formData = new FormData();

      // Add files
      for (let i = 0; i < this.files.length; i++) {
        let file = this.files[i];

        // Compress if needed
        if (this.config.compressionEnabled && file.type.startsWith('image/')) {
          file = await this.compressImage(file);
        }

        formData.append(this.config.uploadMode === 'multiple' ? 'files[]' : 'file', file);
      }

      // Add metadata
      for (const [key, value] of Object.entries(this.config.metadata)) {
        formData.append(key, value);
      }

      // Upload with progress
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          this.showProgress(percent);
          this.dispatchEvent('uploadProgress', { loaded: e.loaded, total: e.total, percent });
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const response = JSON.parse(xhr.responseText);
          this.setState('success');
          this.uploading = false;
          this.hideProgress();
          this.dispatchEvent('uploadSuccess', { response, files: this.files });

          if (this.config.onUploadSuccess) {
            this.config.onUploadSuccess(response);
          }

          // Reset after success
          setTimeout(() => {
            this.reset();
          }, 2000);
        } else {
          throw new Error(`Upload failed with status ${xhr.status}`);
        }
      });

      xhr.addEventListener('error', () => {
        this.handleUploadError(new Error('Network error'));
      });

      xhr.open('POST', this.config.endpoint);
      xhr.send(formData);

    } catch (error) {
      this.handleUploadError(error);
    }
  }

  handleUploadError(error) {
    this.setState('error');
    this.uploading = false;
    this.hideProgress();
    this.showError(error.message || 'Error al subir archivo');
    this.dispatchEvent('uploadError', { error });

    if (this.config.onUploadError) {
      this.config.onUploadError(error);
    }
  }

  async compressImage(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);

          canvas.toBlob((blob) => {
            resolve(new File([blob], file.name, { type: file.type }));
          }, file.type, this.config.compressionQuality);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  showProgress(percent) {
    if (!this.config.showProgress) return;

    this.progressElement.style.display = 'flex';
    this.progressBar.style.width = `${percent}%`;
    this.progressText.textContent = `${percent}%`;
  }

  hideProgress() {
    this.progressElement.style.display = 'none';
  }

  showError(message) {
    // Create temporary error message
    const errorEl = document.createElement('div');
    errorEl.className = 'file-drop-zone__error';
    errorEl.textContent = message;
    this.element.appendChild(errorEl);

    setTimeout(() => {
      errorEl.remove();
    }, 5000);
  }

  setState(state) {
    this.state = state;
    this.element.setAttribute('data-state', state);
    this.element.className = this.element.className.replace(/file-drop-zone--state-\w+/g, '');
    this.element.classList.add(`file-drop-zone--state-${state}`);
  }

  reset() {
    this.files = [];
    this.uploading = false;
    this.setState('idle');
    this.previewElement.style.display = 'none';
    this.previewElement.innerHTML = '';
    this.inputElement.value = '';
  }

  getFileIcon(mimeType) {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎬';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.includes('word')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    return '📁';
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  dispatchEvent(eventName, detail = {}) {
    const event = new CustomEvent(`filedropzone:${eventName}`, {
      detail,
      bubbles: true
    });
    this.element.dispatchEvent(event);
  }

  // Public methods
  getFiles() {
    return this.files;
  }

  clearFiles() {
    this.reset();
  }

  enable() {
    this.config.disabled = false;
    this.element.classList.remove('file-drop-zone--disabled');
  }

  disable() {
    this.config.disabled = true;
    this.element.classList.add('file-drop-zone--disabled');
  }

  triggerUpload() {
    if (this.files.length > 0) {
      this.upload();
    }
  }
}

// Auto-initialize
if (typeof window !== 'undefined') {
  window.AutoUI = window.AutoUI || {};
  window.AutoUI.components = window.AutoUI.components || {};
  window.AutoUI.components['file-drop-zone'] = FileDropZone;

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFileDropZones);
  } else {
    initFileDropZones();
  }
}

function initFileDropZones() {
  document.querySelectorAll('[data-component="file-drop-zone"]').forEach(element => {
    if (!element.__fileDropZone) {
      element.__fileDropZone = new FileDropZone(element);
    }
  });
}
