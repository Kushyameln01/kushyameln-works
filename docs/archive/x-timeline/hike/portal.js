(() => {
  class PortalRuntime extends HikeRuntime {
    text(pointer, length) {
      return new TextDecoder().decode(new Uint8Array(this.memory.buffer, Number(pointer), Number(length)));
    }

    imports() {
      const imports = super.imports();
      const element = (p, n) => document.getElementById(this.text(p, n));
      Object.assign(imports.env, {
        js_log: (p, n) => console.info('[Hike]', this.text(p, n)),
        js_set_text: (p, n, t, l) => {
          const el = element(p, n);
          if (el) el.textContent = this.text(t, l);
        },
        js_append_text: (p, n, t, l) => {
          const el = element(p, n);
          if (el) el.textContent += this.text(t, l);
        },
        js_set_badge_color: (p, n, c, l) => {
          const el = element(p, n);
          if (el) el.style.backgroundColor = this.text(c, l);
        }
      });
      return imports;
    }

    malloc(size) {
      // No __heap_base export: allocate beyond the module's original memory
      // so the host heap cannot overlap its static data or stack.
      if (this.heap === undefined) this.heap = this.memory.buffer.byteLength;
      return super.malloc(size);
    }
  }

  const runtime = new PortalRuntime({ wasmUrl: '/hike/portal.wasm' });
  window.portalHikeReady = runtime.load();
})();
