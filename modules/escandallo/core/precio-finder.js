/**
 * Precio Finder v2
 *
 * Busca precios de ingredientes en múltiples fuentes:
 * 1. Mercadona API (oficial, JSON)
 * 2. Carrefour scraping
 * 3. Google Images + OCR
 * 4. Histórico como fallback
 *
 * Reintentos automáticos con backoff exponencial
 */

const https = require('https');
const http = require('http');
const cheerio = require('cheerio');

class PrecioFinder {
  constructor(logger, cacheManager) {
    this.logger = logger;
    this.cache = cacheManager;
    this.maxRetries = 3;
    this.retryDelay = [1000, 3000, 5000]; // ms
  }

  /**
   * Busca precio para un ingrediente
   * Retorna: {precio, fuente, fecha, confianza}
   */
  async findPrecio(ingredienteName) {
    this.logger.info('precio.search_started', { ingrediente: ingredienteName });

    // 1. Verificar cache (válido 24h)
    const cached = await this.cache.get(ingredienteName);
    if (cached && this._isCacheValid(cached)) {
      this.logger.info('precio.cache_hit', { ingrediente: ingredienteName, precio: cached.precio });
      return cached;
    }

    // 2. Intentar Mercadona API
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const precio = await this._searchMercadona(ingredienteName);
        if (precio) {
          await this.cache.set(ingredienteName, precio);
          return precio;
        }
      } catch (err) {
        this.logger.warn('precio.mercadona_failed', {
          ingrediente: ingredienteName,
          attempt: attempt + 1,
          error: err.message
        });
        if (attempt < this.maxRetries - 1) {
          await this._delay(this.retryDelay[attempt]);
        }
      }
    }

    // 3. Intentar Carrefour scraping
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const precio = await this._scrapeCarrefour(ingredienteName);
        if (precio) {
          await this.cache.set(ingredienteName, precio);
          return precio;
        }
      } catch (err) {
        this.logger.warn('precio.carrefour_failed', {
          ingrediente: ingredienteName,
          attempt: attempt + 1,
          error: err.message
        });
        if (attempt < this.maxRetries - 1) {
          await this._delay(this.retryDelay[attempt]);
        }
      }
    }

    // 4. Intentar Google Images + OCR
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const precio = await this._googleImagesOCR(ingredienteName);
        if (precio) {
          await this.cache.set(ingredienteName, precio);
          return precio;
        }
      } catch (err) {
        this.logger.warn('precio.google_ocr_failed', {
          ingrediente: ingredienteName,
          attempt: attempt + 1,
          error: err.message
        });
        if (attempt < 1) {
          await this._delay(5000);
        }
      }
    }

    // 5. Fallback: promedio histórico
    const promedio = await this.cache.getAverage(ingredienteName);
    if (promedio) {
      this.logger.info('precio.using_average', { ingrediente: ingredienteName, precio: promedio });
      return {
        precio: promedio,
        fuente: 'historico_promedio',
        fecha: Date.now(),
        confianza: 'baja'
      };
    }

    // 6. No encontrado
    this.logger.error('precio.not_found', { ingrediente: ingredienteName });
    return null;
  }

  // ==========================================
  // FUENTE 1: Mercadona API
  // ==========================================

  async _searchMercadona(ingredienteName) {
    // Buscar producto por nombre en Mercadona API
    // Endpoint: GET https://tienda.mercadona.es/api/categories/
    // Luego: GET https://tienda.mercadona.es/api/products/{id}/

    try {
      const searchUrl = `https://tienda.mercadona.es/api/search/?q=${encodeURIComponent(ingredienteName)}`;
      const response = await this._fetchJSON(searchUrl);

      if (!response || !response.results || response.results.length === 0) {
        return null;
      }

      // Tomar primer resultado
      const producto = response.results[0];

      if (!producto.price) {
        return null;
      }

      return {
        precio: parseFloat(producto.price),
        fuente: 'mercadona_api',
        fecha: Date.now(),
        confianza: 'alta',
        producto: producto.name,
        unidad: producto.size || 'unidad'
      };
    } catch (err) {
      throw err;
    }
  }

  // ==========================================
  // FUENTE 2: Carrefour Scraping
  // ==========================================

  async _scrapeCarrefour(ingredienteName) {
    // Scrape Carrefour: https://www.carrefour.es/
    // Buscar por ingrediente, extraer precio del HTML

    try {
      const searchUrl = `https://www.carrefour.es/search?q=${encodeURIComponent(ingredienteName)}`;
      const html = await this._fetchHTML(searchUrl);

      // Parse HTML (simplificado)
      const $ = cheerio.load(html);

      // Buscar elemento con precio (selector puede cambiar)
      const precio = $('[data-price], .price, .product-price').first().text();

      if (!precio) {
        return null;
      }

      // Extraer número de formato "2,64 €" o "2.64€"
      const match = precio.match(/[\d,\.]+/);
      if (!match) {
        return null;
      }

      const precioNum = parseFloat(match[0].replace(',', '.'));

      return {
        precio: precioNum,
        fuente: 'carrefour_scraping',
        fecha: Date.now(),
        confianza: 'media',
        producto: ingredienteName
      };
    } catch (err) {
      throw err;
    }
  }

  // ==========================================
  // FUENTE 3: Google Images + OCR
  // ==========================================

  async _googleImagesOCR(ingredienteName) {
    // Buscar en Google Images, descargar foto, OCR con Google Vision
    // Requiere: GOOGLE_CLOUD_VISION_API_KEY

    try {
      const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
      if (!apiKey) {
        throw new Error('GOOGLE_CLOUD_VISION_API_KEY not configured');
      }

      // 1. Buscar imagen en Google Custom Search
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(ingredienteName)} precio españa supermercado&tbm=isch`;
      const html = await this._fetchHTML(searchUrl);

      // 2. Extraer URL de imagen (simplificado: tomar primera)
      const match = html.match(/src="([^"]*\.(?:jpg|png|jpeg))"/i);
      if (!match) {
        return null;
      }

      const imageUrl = match[1];

      // 3. Enviar a Google Vision OCR
      const ocrResult = await this._googleVisionOCR(imageUrl, apiKey);

      if (!ocrResult) {
        return null;
      }

      // 4. Parsear precio del texto OCR
      const precioMatch = ocrResult.text.match(/[\d,\.]+\s*€/);
      if (!precioMatch) {
        return null;
      }

      const precioStr = precioMatch[0].replace('€', '').trim();
      const precioNum = parseFloat(precioStr.replace(',', '.'));

      return {
        precio: precioNum,
        fuente: 'google_images_ocr',
        fecha: Date.now(),
        confianza: ocrResult.confidence > 0.8 ? 'media' : 'baja',
        ocr_confidence: ocrResult.confidence
      };
    } catch (err) {
      throw err;
    }
  }

  async _googleVisionOCR(imageUrl, apiKey) {
    // Llamar a Google Cloud Vision API
    // POST https://vision.googleapis.com/v1/images:annotate?key=API_KEY

    try {
      const request = {
        requests: [
          {
            image: { source: { imageUri: imageUrl } },
            features: [{ type: 'TEXT_DETECTION' }]
          }
        ]
      };

      const response = await this._fetchJSON(
        `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
        {
          method: 'POST',
          body: JSON.stringify(request)
        }
      );

      if (!response.responses || !response.responses[0].textAnnotations) {
        return null;
      }

      const fullText = response.responses[0].textAnnotations[0].description;
      const confidence = response.responses[0].textAnnotations[0].confidence || 0.8;

      return {
        text: fullText,
        confidence: confidence
      };
    } catch (err) {
      throw err;
    }
  }

  // ==========================================
  // HELPERS
  // ==========================================

  _isCacheValid(cached) {
    if (!cached.fecha) return false;
    const age = Date.now() - cached.fecha;
    const maxAge = 24 * 60 * 60 * 1000; // 24h
    return age < maxAge;
  }

  async _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async _fetchJSON(url, options = {}) {
    const text = await this._fetchHTML(url, options);
    return JSON.parse(text);
  }

  async _fetchHTML(url, options = {}) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const req = protocol.request(url, {
        method: options.method || 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PrecioFinder/1.0)',
          ...options.headers
        },
        timeout: 10000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }
}

module.exports = PrecioFinder;
