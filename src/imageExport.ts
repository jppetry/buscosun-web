/**
 * P0 — SVG-Diagramm als PNG exportieren (teilbar, backend-frei).
 *
 * Anders als ein naives serialize→raster werden hier die *berechneten* Styles
 * (getComputedStyle) auf jedes Element inline geschrieben. So überleben
 * CSS-Klassen UND CSS-Variablen die Rasterung — die History-Charts kommen mit
 * Inline-Attributen aus, die Event-/Route-Charts dagegen stylen über externe
 * Klassen (`.ev-course-grid` …) + `var(--terracotta-500)`, die sonst verloren
 * gingen. Reines DOM/Canvas, kein Server.
 */

/** SVG-relevante Eigenschaften, die wir inline einbacken (Reihenfolge egal). */
const SVG_STYLE_PROPS = [
  'fill', 'fill-opacity', 'fill-rule',
  'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset',
  'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'opacity', 'color', 'visibility', 'display',
  'font-family', 'font-size', 'font-weight', 'font-style',
  'text-anchor', 'dominant-baseline', 'alignment-baseline', 'letter-spacing',
];

/** Schreibt berechnete Styles rekursiv von Quelle auf Klon (parallele Bäume). */
function inlineComputedStyles(src: Element, dst: Element): void {
  const cs = window.getComputedStyle(src);
  let style = dst.getAttribute('style') ?? '';
  for (const prop of SVG_STYLE_PROPS) {
    const v = cs.getPropertyValue(prop);
    if (v && v !== 'normal' && v !== 'auto') style += `${prop}:${v};`;
  }
  dst.setAttribute('style', style);
  const sc = src.children, dc = dst.children;
  for (let i = 0; i < sc.length && i < dc.length; i++) inlineComputedStyles(sc[i], dc[i]);
}

export interface SvgPngOptions {
  filename: string;
  /** Pixel-Skalierung (Retina). Default 2. */
  scale?: number;
  /** Hintergrundfarbe. Default Sand. 'transparent' für keinen Hintergrund. */
  background?: string;
  /** Innenabstand um das Diagramm in px. Default 20. */
  padding?: number;
  /** Optionale Fußzeile (Titel/Untertitel/Quelle) unter dem Diagramm. */
  title?: string;
  subtitle?: string;
  source?: string;
}

/**
 * Rastert ein <svg> (mit übernommenen Styles) in ein PNG und löst den Download
 * aus. Promise resolved nach erfolgreichem Download bzw. rejected bei Fehler.
 */
export function exportSvgAsPng(svg: SVGSVGElement, opts: SvgPngOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const scale = opts.scale ?? 2;
    const pad = opts.padding ?? 20;
    const bg = opts.background ?? '#FBF7EE';

    const vb = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    const w = (vb && vb.width) || rect.width || 920;
    const h = (vb && vb.height) || rect.height || 320;

    // Fußzeilen-Höhe aus vorhandenen Feldern.
    const lines = [opts.title, opts.subtitle, opts.source].filter(Boolean) as string[];
    const footH = lines.length ? 14 + lines.length * 18 : 0;

    const clone = svg.cloneNode(true) as SVGSVGElement;
    inlineComputedStyles(svg, clone);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));

    const svgStr = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const totalW = w + pad * 2;
        const totalH = h + pad * 2 + footH;
        canvas.width = Math.round(totalW * scale);
        canvas.height = Math.round(totalH * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { URL.revokeObjectURL(url); reject(new Error('no 2d context')); return; }
        ctx.scale(scale, scale);
        if (bg !== 'transparent') { ctx.fillStyle = bg; ctx.fillRect(0, 0, totalW, totalH); }
        ctx.drawImage(img, pad, pad, w, h);

        // Fußzeile.
        let y = pad + h + 22;
        if (opts.title) { ctx.fillStyle = '#2C2A26'; ctx.font = '600 15px system-ui, sans-serif'; ctx.fillText(opts.title, pad, y); y += 18; }
        if (opts.subtitle) { ctx.fillStyle = '#6F5E45'; ctx.font = '12px system-ui, sans-serif'; ctx.fillText(opts.subtitle, pad, y); y += 18; }
        if (opts.source) { ctx.fillStyle = '#8B7355'; ctx.font = '11px system-ui, sans-serif'; ctx.fillText(opts.source, pad, y); }

        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error('toBlob failed')); return; }
          const dlUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = dlUrl; a.download = opts.filename;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(dlUrl), 1000);
          resolve();
        }, 'image/png');
      } catch (err) { URL.revokeObjectURL(url); reject(err instanceof Error ? err : new Error(String(err))); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('svg image load failed')); };
    img.src = url;
  });
}
