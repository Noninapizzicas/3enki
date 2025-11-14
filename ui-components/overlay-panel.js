/**
 * OverlayPanel - Panel superpuesto semi-transparente
 * Mantiene la pantalla anterior visible como referencia
 *
 * Uso:
 * const overlay = new OverlayPanel({
 *   title: 'Detalles del Agente',
 *   content: '<div>Contenido aquí</div>',
 *   size: 'medium'
 * });
 * overlay.open();
 */

class OverlayPanel {
  constructor(options = {}) {
    this.options = {
      title: options.title || 'Panel',
      content: options.content || '',
      size: options.size || 'medium', // small, medium, large
      closeOnBackdrop: options.closeOnBackdrop !== false,
      closeOnEscape: options.closeOnEscape !== false,
      showFooter: options.showFooter || false,
      footerButtons: options.footerButtons || [],
      onOpen: options.onOpen || (() => {}),
      onClose: options.onClose || (() => {}),
      resizable: options.resizable || false,
      level: options.level || 1 // Para overlays apilados
    };

    this.isOpen = false;
    this.element = null;
    this.backdropElement = null;

    this.create();
  }

  create() {
    // Crear backdrop
    this.backdropElement = document.createElement('div');
    this.backdropElement.className = 'overlay-backdrop';
    this.backdropElement.setAttribute('data-level', this.options.level);

    // Crear panel
    this.element = document.createElement('div');
    this.element.className = `overlay-panel size-${this.options.size}`;

    // Header
    const header = document.createElement('div');
    header.className = 'overlay-header';

    const title = document.createElement('h3');
    title.className = 'overlay-title';
    title.textContent = this.options.title;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'overlay-close';
    closeBtn.innerHTML = '×';
    closeBtn.setAttribute('aria-label', 'Cerrar');
    closeBtn.onclick = () => this.close();

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Content
    const content = document.createElement('div');
    content.className = 'overlay-content';

    if (typeof this.options.content === 'string') {
      content.innerHTML = this.options.content;
    } else if (this.options.content instanceof HTMLElement) {
      content.appendChild(this.options.content);
    }

    // Footer (opcional)
    let footer = null;
    if (this.options.showFooter) {
      footer = document.createElement('div');
      footer.className = 'overlay-footer';

      this.options.footerButtons.forEach(btnConfig => {
        const btn = document.createElement('button');
        btn.className = `overlay-btn overlay-btn-${btnConfig.type || 'secondary'}`;
        btn.textContent = btnConfig.label;
        btn.onclick = () => {
          if (btnConfig.onClick) btnConfig.onClick();
          if (btnConfig.closeOnClick !== false) this.close();
        };
        footer.appendChild(btn);
      });
    }

    // Resize handle (opcional)
    if (this.options.resizable) {
      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'overlay-resize-handle';
      this.element.appendChild(resizeHandle);
      this.makeResizable(resizeHandle);
    }

    // Ensamblar
    this.element.appendChild(header);
    this.element.appendChild(content);
    if (footer) this.element.appendChild(footer);

    this.backdropElement.appendChild(this.element);

    // Event listeners
    this.attachEvents();
  }

  attachEvents() {
    // Click en backdrop para cerrar
    if (this.options.closeOnBackdrop) {
      this.backdropElement.addEventListener('click', (e) => {
        if (e.target === this.backdropElement) {
          this.close();
        }
      });
    }

    // ESC key para cerrar
    if (this.options.closeOnEscape) {
      this.escapeHandler = (e) => {
        if (e.key === 'Escape' && this.isOpen) {
          this.close();
        }
      };
      document.addEventListener('keydown', this.escapeHandler);
    }

    // Prevenir propagación de clicks dentro del panel
    this.element.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  open() {
    if (this.isOpen) return;

    // Añadir al DOM
    document.body.appendChild(this.backdropElement);

    // Prevenir scroll del body
    document.body.classList.add('overlay-active');

    // Trigger reflow para animación
    this.backdropElement.offsetHeight;

    // Activar
    this.backdropElement.classList.add('active');
    this.isOpen = true;

    // Focus trap
    this.trapFocus();

    // Callback
    this.options.onOpen();
  }

  close() {
    if (!this.isOpen) return;

    // Animación de cierre
    this.backdropElement.classList.add('closing');

    setTimeout(() => {
      // Remover del DOM
      if (this.backdropElement.parentNode) {
        this.backdropElement.parentNode.removeChild(this.backdropElement);
      }

      // Restaurar scroll del body
      document.body.classList.remove('overlay-active');

      this.backdropElement.classList.remove('active', 'closing');
      this.isOpen = false;

      // Callback
      this.options.onClose();
    }, 200); // Duración de la animación
  }

  setTitle(title) {
    const titleElement = this.element.querySelector('.overlay-title');
    if (titleElement) {
      titleElement.textContent = title;
    }
  }

  setContent(content) {
    const contentElement = this.element.querySelector('.overlay-content');
    if (contentElement) {
      if (typeof content === 'string') {
        contentElement.innerHTML = content;
      } else if (content instanceof HTMLElement) {
        contentElement.innerHTML = '';
        contentElement.appendChild(content);
      }
    }
  }

  setSize(size) {
    this.element.className = `overlay-panel size-${size}`;
    this.options.size = size;
  }

  trapFocus() {
    // Elementos focuseables
    const focusableElements = this.element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Focus inicial
    firstElement.focus();

    // Tab trap
    this.tabHandler = (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          // Shift + Tab
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    this.element.addEventListener('keydown', this.tabHandler);
  }

  makeResizable(handle) {
    let startX, startY, startWidth, startHeight;

    const onMouseDown = (e) => {
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      startWidth = parseInt(getComputedStyle(this.element).width, 10);
      startHeight = parseInt(getComputedStyle(this.element).height, 10);

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
      const width = startWidth + (e.clientX - startX);
      const height = startHeight + (e.clientY - startY);

      this.element.style.width = `${Math.max(320, width)}px`;
      this.element.style.height = `${Math.max(200, height)}px`;
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    handle.addEventListener('mousedown', onMouseDown);
  }

  destroy() {
    // Remover event listeners
    if (this.escapeHandler) {
      document.removeEventListener('keydown', this.escapeHandler);
    }
    if (this.tabHandler) {
      this.element.removeEventListener('keydown', this.tabHandler);
    }

    // Cerrar si está abierto
    if (this.isOpen) {
      this.close();
    }

    // Cleanup
    this.element = null;
    this.backdropElement = null;
  }
}

// Helpers para crear overlays comunes

// Overlay de confirmación
OverlayPanel.confirm = function(options) {
  return new OverlayPanel({
    title: options.title || '¿Estás seguro?',
    content: options.message || '',
    size: 'small',
    showFooter: true,
    footerButtons: [
      {
        label: options.cancelLabel || 'Cancelar',
        type: 'secondary',
        onClick: () => {
          if (options.onCancel) options.onCancel();
        }
      },
      {
        label: options.confirmLabel || 'Confirmar',
        type: options.danger ? 'danger' : 'primary',
        onClick: () => {
          if (options.onConfirm) options.onConfirm();
        }
      }
    ]
  });
};

// Overlay de información
OverlayPanel.info = function(title, content, size = 'medium') {
  return new OverlayPanel({
    title,
    content,
    size,
    showFooter: true,
    footerButtons: [
      {
        label: 'Cerrar',
        type: 'primary'
      }
    ]
  });
};

// Overlay de detalles (para usar con emoji buttons)
OverlayPanel.details = function(options) {
  const content = document.createElement('div');

  // Secciones de información
  if (options.sections) {
    options.sections.forEach(section => {
      const sectionDiv = document.createElement('div');
      sectionDiv.className = 'overlay-section';

      if (section.title) {
        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'overlay-section-title';
        sectionTitle.textContent = section.title;
        sectionDiv.appendChild(sectionTitle);
      }

      if (section.items) {
        const grid = document.createElement('div');
        grid.className = 'overlay-info-grid';

        section.items.forEach(item => {
          const itemDiv = document.createElement('div');
          itemDiv.className = 'overlay-info-item';

          const label = document.createElement('div');
          label.className = 'overlay-info-label';
          label.textContent = item.label;

          const value = document.createElement('div');
          value.className = 'overlay-info-value';
          value.textContent = item.value;

          itemDiv.appendChild(label);
          itemDiv.appendChild(value);
          grid.appendChild(itemDiv);
        });

        sectionDiv.appendChild(grid);
      }

      if (section.content) {
        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = section.content;
        sectionDiv.appendChild(contentDiv);
      }

      content.appendChild(sectionDiv);
    });
  }

  return new OverlayPanel({
    title: options.title,
    content,
    size: options.size || 'medium',
    showFooter: options.showFooter,
    footerButtons: options.footerButtons
  });
};

// Export para módulos ES6
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OverlayPanel;
}
