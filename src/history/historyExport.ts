/**
 * Feature „Wetterhistorie" — Export & Teilen (E10).
 *
 * CSV-Tabelle (US-10.2), Diagramm als PNG mit Titel/Ort/Quelle (US-10.1),
 * Download-Helfer. Reines DOM/Browser (kein Headless-Test).
 */

import type { Bucket } from './historyModel';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Aktuelle Reihe als CSV (US-10.2). */
// BH4-Nebenbefund: die Quelle kommt vom Aufrufer — Standardquelle ist seit dem Meteostat-Wechsel die
// Station, nicht ERA5; der feste Text hier nannte in jedem Export die falsche Quelle.
export function bucketsToCSV(buckets: Bucket[], meta: { label: string; unit: string }, loc: string, source = 'ERA5 / Open-Meteo Archive'): string {
  const head = `# ${meta.label} (${meta.unit}) · ${loc} · Quelle: ${source}\nPeriode;Jahr;Wert (${meta.unit});Tage`;
  const rows = buckets.map((b) => `${b.label};${b.year};${b.value == null ? '' : String(b.value).replace('.', ',')};${b.n}`);
  return [head, ...rows].join('\n');
}

/** Serialisiert ein <svg> + zeichnet Titel/Ort/Quelle darunter → PNG-Download (US-10.1). */
export function svgToPng(svg: SVGSVGElement, opts: { title: string; subtitle: string; source: string; filename: string; scale?: number }) {
  const scale = opts.scale ?? 2;
  const vb = svg.viewBox.baseVal;
  const w = (vb && vb.width) || svg.clientWidth || 920;
  const h = (vb && vb.height) || svg.clientHeight || 300;
  const footH = 70;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const svgStr = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = w * scale; canvas.height = (h + footH) * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.fillStyle = '#FBF7EE'; ctx.fillRect(0, 0, w, h + footH);
    ctx.drawImage(img, 0, 0, w, h);
    ctx.fillStyle = '#2C2A26'; ctx.font = 'bold 16px sans-serif'; ctx.fillText(opts.title, 12, h + 24);
    ctx.fillStyle = '#6F5E45'; ctx.font = '12px sans-serif'; ctx.fillText(opts.subtitle, 12, h + 42);
    ctx.fillStyle = '#8B7355'; ctx.font = '11px sans-serif'; ctx.fillText(opts.source, 12, h + 60);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => { if (blob) downloadBlob(blob, opts.filename); }, 'image/png');
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

/** Findet das erste <svg> in einem Container (für den Export des aktiven Charts). */
export function firstSvgIn(el: HTMLElement | null): SVGSVGElement | null {
  return el ? el.querySelector('svg') : null;
}

/** Einbett-Schnipsel (US-10.4): hängt embed=1 an, damit die schlanke Ansicht lädt. */
export function embedSnippet(shareUrl: string): string {
  const url = shareUrl.includes('embed=1') ? shareUrl : `${shareUrl}${shareUrl.includes('#') ? '&' : '#h=&'}embed=1`;
  return `<iframe src="${url}" width="640" height="480" style="border:1px solid #E0D6BE;border-radius:12px" title="Wetterhistorie" loading="lazy"></iframe>`;
}
