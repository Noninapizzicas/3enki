/**
 * Event Core UI - Advanced Interactions
 *
 * JavaScript para componentes avanzados:
 * - Split Buttons
 * - Long-press Actions
 * - Tooltips dinámicos
 */

class AdvancedInteractions {
  constructor() {
    this.init();
  }

  init() {
    this.initSplitButtons();
    this.initLongPressButtons();
    this.initTooltips();
  }

  /**
   * Initialize Split Buttons
   *
   * Permite botones con acción principal + dropdown
   */
  initSplitButtons() {
    document.addEventListener('click', (e) => {
      // Toggle split button dropdown
      if (e.target.closest('.btn-split-toggle')) {
        e.stopPropagation();
        const splitBtn = e.target.closest('.btn-split');
        const isOpen = splitBtn.classList.contains('open');

        // Close all other split buttons
        document.querySelectorAll('.btn-split.open').forEach(btn => {
          btn.classList.remove('open');
        });

        // Toggle current
        splitBtn.classList.toggle('open', !isOpen);
      }

      // Handle split button menu item clicks
      else if (e.target.closest('.btn-split-menu-item')) {
        const item = e.target.closest('.btn-split-menu-item');
        const splitBtn = item.closest('.btn-split');

        // Get action from data attribute
        const action = item.dataset.action;

        // Trigger custom event
        splitBtn.dispatchEvent(new CustomEvent('split-action', {
          detail: { action, item }
        }));

        // Close dropdown
        splitBtn.classList.remove('open');
      }

      // Close split buttons when clicking outside
      else if (!e.target.closest('.btn-split')) {
        document.querySelectorAll('.btn-split.open').forEach(btn => {
          btn.classList.remove('open');
        });
      }
    });
  }

  /**
   * Initialize Long-press Buttons
   *
   * Requiere mantener presionado 1.5s para confirmar acción peligrosa
   */
  initLongPressButtons() {
    let pressTimer = null;
    let isPressing = false;

    document.addEventListener('mousedown', (e) => {
      const btn = e.target.closest('.btn-long-press');
      if (!btn) return;

      isPressing = true;
      btn.classList.add('pressing');

      pressTimer = setTimeout(() => {
        if (isPressing) {
          // Long press completed
          btn.classList.remove('pressing');
          isPressing = false;

          // Trigger custom event
          btn.dispatchEvent(new CustomEvent('long-press-complete'));
        }
      }, 1500); // 1.5 seconds
    });

    document.addEventListener('mouseup', (e) => {
      const btn = e.target.closest('.btn-long-press');
      if (!btn) return;

      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }

      if (isPressing) {
        // Released too early
        btn.classList.remove('pressing');
        isPressing = false;
      }
    });

    document.addEventListener('mouseleave', (e) => {
      const btn = e.target.closest('.btn-long-press');
      if (!btn) return;

      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }

      btn.classList.remove('pressing');
      isPressing = false;
    });

    // Touch events for mobile
    document.addEventListener('touchstart', (e) => {
      const btn = e.target.closest('.btn-long-press');
      if (!btn) return;

      e.preventDefault();
      isPressing = true;
      btn.classList.add('pressing');

      pressTimer = setTimeout(() => {
        if (isPressing) {
          btn.classList.remove('pressing');
          isPressing = false;
          btn.dispatchEvent(new CustomEvent('long-press-complete'));
        }
      }, 1500);
    });

    document.addEventListener('touchend', (e) => {
      const btn = e.target.closest('.btn-long-press');
      if (!btn) return;

      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }

      if (isPressing) {
        btn.classList.remove('pressing');
        isPressing = false;
      }
    });
  }

  /**
   * Initialize Tooltips
   *
   * Tooltips dinámicos para botones icon-only
   */
  initTooltips() {
    // Auto-add tooltip class to buttons with data-tooltip
    document.querySelectorAll('[data-tooltip]').forEach(el => {
      if (!el.classList.contains('tooltip')) {
        el.classList.add('tooltip');
      }
    });
  }

  /**
   * Create Split Button Programmatically
   *
   * @param {Object} options - Button options
   * @param {string} options.label - Main button label
   * @param {string} options.icon - Main button icon (emoji)
   * @param {Function} options.onClick - Main button click handler
   * @param {Array} options.menu - Menu items [{label, icon, action}]
   * @param {string} options.variant - Button variant (primary, success, danger, etc.)
   * @returns {HTMLElement} Split button element
   */
  static createSplitButton(options) {
    const {
      label,
      icon = '',
      onClick,
      menu = [],
      variant = 'primary'
    } = options;

    const splitBtn = document.createElement('div');
    splitBtn.className = 'btn-split';

    // Main button
    const mainBtn = document.createElement('button');
    mainBtn.className = `btn-split-main btn-${variant}`;
    mainBtn.innerHTML = `${icon} ${label}`;
    mainBtn.addEventListener('click', onClick);

    // Toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn-split-toggle';

    // Dropdown menu
    const menuEl = document.createElement('div');
    menuEl.className = 'btn-split-menu';

    menu.forEach(item => {
      const menuItem = document.createElement('button');
      menuItem.className = 'btn-split-menu-item';
      menuItem.dataset.action = item.action;
      menuItem.innerHTML = `${item.icon || ''} ${item.label}`;
      menuEl.appendChild(menuItem);
    });

    splitBtn.appendChild(mainBtn);
    splitBtn.appendChild(toggleBtn);
    splitBtn.appendChild(menuEl);

    return splitBtn;
  }

  /**
   * Create Icon Button Programmatically
   *
   * @param {Object} options - Button options
   * @param {string} options.icon - Emoji or icon
   * @param {string} options.tooltip - Tooltip text
   * @param {string} options.variant - Button variant (create, edit, delete, view)
   * @param {string} options.size - Button size (sm, md, lg)
   * @param {Function} options.onClick - Click handler
   * @returns {HTMLElement} Icon button element
   */
  static createIconButton(options) {
    const {
      icon,
      tooltip,
      variant = '',
      size = 'md',
      onClick
    } = options;

    const btn = document.createElement('button');
    const sizeClass = size === 'md' ? '' : `btn-icon-${size}`;
    btn.className = `btn-icon ${variant} ${sizeClass}`.trim();
    btn.innerHTML = icon;

    if (tooltip) {
      btn.dataset.tooltip = tooltip;
      btn.classList.add('tooltip');
    }

    if (onClick) {
      btn.addEventListener('click', onClick);
    }

    return btn;
  }

  /**
   * Create Compact Card Programmatically
   *
   * @param {Object} options - Card options
   * @param {string} options.icon - Icon emoji
   * @param {string} options.iconVariant - Icon background variant (success, warning, danger, info, primary)
   * @param {string} options.title - Card title
   * @param {string} options.subtitle - Card subtitle
   * @param {Array} options.actions - Action buttons
   * @param {Function} options.onClick - Card click handler
   * @returns {HTMLElement} Compact card element
   */
  static createCompactCard(options) {
    const {
      icon,
      iconVariant = 'primary',
      title,
      subtitle,
      actions = [],
      onClick
    } = options;

    const card = document.createElement('div');
    card.className = 'card-compact';

    // Icon
    const iconEl = document.createElement('div');
    iconEl.className = `card-compact-icon ${iconVariant}`;
    iconEl.textContent = icon;

    // Content
    const content = document.createElement('div');
    content.className = 'card-compact-content';

    const titleEl = document.createElement('h4');
    titleEl.className = 'card-compact-title';
    titleEl.textContent = title;

    const subtitleEl = document.createElement('p');
    subtitleEl.className = 'card-compact-subtitle';
    subtitleEl.textContent = subtitle;

    content.appendChild(titleEl);
    content.appendChild(subtitleEl);

    // Actions
    const actionsEl = document.createElement('div');
    actionsEl.className = 'card-compact-actions';

    actions.forEach(action => {
      const actionBtn = this.createIconButton(action);
      actionsEl.appendChild(actionBtn);
    });

    card.appendChild(iconEl);
    card.appendChild(content);
    card.appendChild(actionsEl);

    if (onClick) {
      card.addEventListener('click', onClick);
    }

    return card;
  }

  /**
   * Create Status Badge
   *
   * @param {string} status - Status (pending, in-progress, completed, error)
   * @param {string} label - Label text
   * @returns {HTMLElement} Status badge element
   */
  static createStatusBadge(status, label) {
    const badge = document.createElement('span');
    badge.className = `status-badge ${status}`;

    const iconMap = {
      'pending': '⏳',
      'in-progress': '🔄',
      'completed': '✅',
      'error': '❌'
    };

    badge.innerHTML = `${iconMap[status] || ''} ${label}`;
    return badge;
  }

  /**
   * Create Priority Indicator
   *
   * @param {string} priority - Priority level (high, medium, low)
   * @param {string} label - Label text (optional)
   * @returns {HTMLElement} Priority indicator element
   */
  static createPriorityIndicator(priority, label = null) {
    const indicator = document.createElement('span');
    indicator.className = `priority-indicator ${priority}`;

    const dot = document.createElement('span');
    dot.className = 'priority-dot';

    indicator.appendChild(dot);

    if (label) {
      const text = document.createElement('span');
      text.textContent = label;
      indicator.appendChild(text);
    }

    return indicator;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.advancedUI = new AdvancedInteractions();
  });
} else {
  window.advancedUI = new AdvancedInteractions();
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdvancedInteractions;
}
