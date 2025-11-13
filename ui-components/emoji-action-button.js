/**
 * EmojiActionButton - Botón 10x10mm con 3 tipos de interacción
 *
 * Uso:
 * const btn = new EmojiActionButton('🗑️', {
 *   singleClick: () => console.log('Single click'),
 *   doubleClick: () => console.log('Double click'),
 *   longPress: () => console.log('Long press')
 * });
 * document.body.appendChild(btn.element);
 */

class EmojiActionButton {
  constructor(emoji, callbacks = {}, options = {}) {
    this.emoji = emoji;
    this.callbacks = {
      singleClick: callbacks.singleClick || (() => {}),
      doubleClick: callbacks.doubleClick || (() => {}),
      longPress: callbacks.longPress || (() => {})
    };

    // Opciones configurables
    this.options = {
      doubleClickDelay: options.doubleClickDelay || 300, // ms entre clicks
      longPressDuration: options.longPressDuration || 3000, // ms hold
      haptic: options.haptic !== false, // Vibración por defecto activada
      showProgress: options.showProgress !== false, // Barra de progreso
      label: options.label || null, // Label opcional debajo del botón
      frameStyle: options.frameStyle || 'default' // default, active, pressed, critical
    };

    // Estado interno
    this.clickCount = 0;
    this.clickTimer = null;
    this.pressTimer = null;
    this.progressInterval = null;
    this.isLongPress = false;
    this.isPressing = false;

    // Crear elemento
    this.element = this.createElement();
    this.attachEvents();
  }

  createElement() {
    // Wrapper si hay label
    if (this.options.label) {
      const wrapper = document.createElement('div');
      wrapper.className = 'emoji-btn-wrapper';

      const button = document.createElement('button');
      button.className = `emoji-btn frame-${this.options.frameStyle}`;
      button.setAttribute('type', 'button');
      button.setAttribute('aria-label', this.options.label);
      button.textContent = this.emoji;

      const label = document.createElement('span');
      label.className = 'emoji-btn-label';
      label.textContent = this.options.label;

      wrapper.appendChild(button);
      wrapper.appendChild(label);

      this.button = button;
      return wrapper;
    } else {
      const button = document.createElement('button');
      button.className = `emoji-btn frame-${this.options.frameStyle}`;
      button.setAttribute('type', 'button');
      button.setAttribute('aria-label', `Button ${this.emoji}`);
      button.textContent = this.emoji;

      this.button = button;
      return button;
    }
  }

  attachEvents() {
    // Soportar touch y mouse
    this.button.addEventListener('mousedown', this.handlePressStart.bind(this));
    this.button.addEventListener('mouseup', this.handlePressEnd.bind(this));
    this.button.addEventListener('mouseleave', this.handlePressCancel.bind(this));

    this.button.addEventListener('touchstart', this.handlePressStart.bind(this), { passive: false });
    this.button.addEventListener('touchend', this.handlePressEnd.bind(this), { passive: false });
    this.button.addEventListener('touchcancel', this.handlePressCancel.bind(this));

    // Prevenir context menu en long press
    this.button.addEventListener('contextmenu', (e) => {
      if (this.isPressing) {
        e.preventDefault();
      }
    });
  }

  handlePressStart(e) {
    e.preventDefault();
    this.isPressing = true;
    this.isLongPress = false;

    // Feedback visual inmediato
    this.button.classList.add('frame-pressed');

    // Iniciar barra de progreso
    if (this.options.showProgress) {
      this.startProgressBar();
    }

    // Timer para long press
    this.pressTimer = setTimeout(() => {
      this.isLongPress = true;
      this.clickCount = 0;
      clearTimeout(this.clickTimer);
      this.stopProgressBar();

      // Feedback háptico
      if (this.options.haptic && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]); // Patrón de vibración
      }

      // Cambiar a estado crítico
      this.button.classList.remove('frame-pressed');
      this.button.classList.add('frame-critical', 'long-press-active');

      // Ejecutar callback
      this.callbacks.longPress();

      // Feedback visual
      this.showFeedback('long_press');

    }, this.options.longPressDuration);
  }

  handlePressEnd(e) {
    e.preventDefault();
    this.isPressing = false;

    clearTimeout(this.pressTimer);
    this.stopProgressBar();

    // Quitar estado pressed
    this.button.classList.remove('frame-pressed', 'long-press-active');

    if (this.isLongPress) {
      // Ya se ejecutó el long press
      setTimeout(() => {
        this.button.classList.remove('frame-critical');
      }, 1000);
      return;
    }

    // Contar clicks
    this.clickCount++;

    if (this.clickCount === 1) {
      // Esperar posible segundo click
      this.clickTimer = setTimeout(() => {
        // Single click confirmado
        this.callbacks.singleClick();
        this.showFeedback('single_click');
        this.clickCount = 0;
      }, this.options.doubleClickDelay);

    } else if (this.clickCount === 2) {
      // Double click detectado
      clearTimeout(this.clickTimer);

      // Feedback háptico suave
      if (this.options.haptic && navigator.vibrate) {
        navigator.vibrate(50);
      }

      this.callbacks.doubleClick();
      this.showFeedback('double_click');
      this.clickCount = 0;
    }
  }

  handlePressCancel(e) {
    this.isPressing = false;
    clearTimeout(this.pressTimer);
    clearTimeout(this.clickTimer);
    this.stopProgressBar();
    this.button.classList.remove('frame-pressed', 'long-press-active', 'frame-critical');
    this.clickCount = 0;
  }

  startProgressBar() {
    // Crear elemento de progreso si no existe
    let progressBar = this.button.querySelector('.emoji-btn-progress');
    if (!progressBar) {
      progressBar = document.createElement('div');
      progressBar.className = 'emoji-btn-progress';
      this.button.appendChild(progressBar);
    }

    // Animar progreso
    let progress = 0;
    const interval = 50; // ms
    const increment = (interval / this.options.longPressDuration);

    this.progressInterval = setInterval(() => {
      progress += increment;
      progressBar.style.transform = `scaleX(${Math.min(progress, 1)})`;
    }, interval);
  }

  stopProgressBar() {
    clearInterval(this.progressInterval);
    const progressBar = this.button.querySelector('.emoji-btn-progress');
    if (progressBar) {
      progressBar.style.transform = 'scaleX(0)';
    }
  }

  showFeedback(type) {
    const feedbackClasses = {
      single_click: 'single-click-feedback',
      double_click: 'double-click-feedback',
      long_press: 'frame-critical'
    };

    const feedbackClass = feedbackClasses[type];
    this.button.classList.add(feedbackClass);

    // Quitar después de la animación
    setTimeout(() => {
      this.button.classList.remove(feedbackClass);
      if (type === 'long_press') {
        this.button.classList.remove('frame-critical');
      }
    }, type === 'double_click' ? 600 : 300);
  }

  // Métodos públicos

  setEmoji(emoji) {
    this.emoji = emoji;
    this.button.textContent = emoji;
  }

  setLabel(label) {
    if (this.options.label) {
      const labelElement = this.element.querySelector('.emoji-btn-label');
      if (labelElement) {
        labelElement.textContent = label;
      }
    }
  }

  setFrameStyle(style) {
    this.button.classList.remove(`frame-${this.options.frameStyle}`);
    this.options.frameStyle = style;
    this.button.classList.add(`frame-${style}`);
  }

  enable() {
    this.button.disabled = false;
    this.button.style.opacity = '1';
  }

  disable() {
    this.button.disabled = true;
    this.button.style.opacity = '0.5';
  }

  destroy() {
    clearTimeout(this.clickTimer);
    clearTimeout(this.pressTimer);
    clearInterval(this.progressInterval);
    this.element.remove();
  }
}

// Export para módulos ES6
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmojiActionButton;
}
