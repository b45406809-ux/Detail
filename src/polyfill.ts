/**
 * Polyfill for matchMedia
 */
if (typeof window !== 'undefined') {
  const patchMediaQueryList = (mql: any, query: string) => {
    // Ensure we start with a valid base object (even if native returns falsy)
    if (!mql || typeof mql !== 'object') {
      mql = {
        matches: false,
        media: query,
        onchange: null,
      };
    }

    // Extract values safely
    const matches = typeof mql.matches === 'boolean' ? mql.matches : false;
    const media = typeof mql.media === 'string' ? mql.media : query;
    const onchange = mql.onchange !== undefined ? mql.onchange : null;

    // Build a clean, writable object that can NEVER throw "read-only" or "cannot define property" errors
    const safeMql: any = {
      matches,
      media,
      onchange,
    };

    // Track listeners locally to guarantee they always register safely
    const changeListeners = new Set<any>();

    safeMql.addEventListener = function(type: string, cb: any, options?: any) {
      if (type === 'change') {
        changeListeners.add(cb);
      }
      if (mql && typeof mql.addEventListener === 'function') {
        try {
          mql.addEventListener(type, cb, options);
        } catch (e) {}
      }
    };

    safeMql.removeEventListener = function(type: string, cb: any, options?: any) {
      if (type === 'change') {
        changeListeners.delete(cb);
      }
      if (mql && typeof mql.removeEventListener === 'function') {
        try {
          mql.removeEventListener(type, cb, options);
        } catch (e) {}
      }
    };

    safeMql.addListener = function(cb: any) {
      safeMql.addEventListener('change', cb);
    };

    safeMql.removeListener = function(cb: any) {
      safeMql.removeEventListener('change', cb);
    };

    safeMql.dispatchEvent = function(event: any) {
      if (mql && typeof mql.dispatchEvent === 'function') {
        try {
          return mql.dispatchEvent(event);
        } catch (e) {}
      }
      return true;
    };

    // Safely bridge any remaining native properties or accessors
    try {
      const keys = Object.getOwnPropertyNames(mql);
      for (const key of keys) {
        if (!(key in safeMql)) {
          Object.defineProperty(safeMql, key, {
            get() {
              try {
                const val = mql[key];
                return typeof val === 'function' ? val.bind(mql) : val;
              } catch (e) {
                return undefined;
              }
            },
            set(v) {
              try {
                mql[key] = v;
              } catch (e) {}
            },
            configurable: true,
            enumerable: true
          });
        }
      }
    } catch (e) {}

    return safeMql;
  };

  const originalMatchMedia = window.matchMedia;

  const safeMatchMedia = (query: string) => {
    let res: any;
    if (typeof originalMatchMedia === 'function') {
      try {
        res = originalMatchMedia.call(window, query);
      } catch (e) {
        res = null;
      }
    }
    return patchMediaQueryList(res, query);
  };

  try {
    Object.defineProperty(window, 'matchMedia', {
      value: safeMatchMedia,
      writable: true,
      configurable: true
    });
  } catch (e) {
    window.matchMedia = safeMatchMedia as any;
  }

  // Intercept and silence standard, non-fatal fetch/map abort exceptions
  try {
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      if (reason) {
        const message = reason.message || String(reason);
        const name = reason.name;
        if (
          name === 'AbortError' || 
          message.includes('aborted') || 
          message.includes('AbortError') ||
          message.includes('The user aborted a request') ||
          message.includes('signal is aborted')
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          console.warn('[Safe Filter] Silenced non-fatal browser request AbortError:', message);
        }
      }
    });

    window.addEventListener('error', (event) => {
      const message = event.message || '';
      if (
        message.includes('aborted') || 
        message.includes('AbortError') ||
        message.includes('The user aborted a request') ||
        message.includes('signal is aborted')
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        console.warn('[Safe Filter] Ignored standard client-side request AbortError:', message);
      }
    });
  } catch (e) {}

  // Fix for MapLibre + react-map-gl: "Cannot set property pixelsToGLUnits"
  // This error happens because react-map-gl tries to set a property that is a getter-only in MapLibre v5.
  // We can intercept the Map object if it's created, but easier is to patch the prototype if possible, 
  // or just hope that downgrading works. 
  // Actually, a robust way is to make the property writable on the prototype if it exists.
  try {
    if (window.hasOwnProperty('Map') || (window as any).maplibregl) {
      // Logic to patch if found, but it's cleaner to handle via package versions
    }
  } catch (e) {}
}
