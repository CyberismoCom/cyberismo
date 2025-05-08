// sanitizeSvg.ts
import createDOMPurify, { WindowLike } from 'dompurify';
import { Buffer } from 'buffer';
import { JSDOM } from 'jsdom';

// Setup JSDOM window for DOMPurify (server-side)
const window = new JSDOM('').window as unknown as Window;
const DOMPurify = createDOMPurify(window as unknown as WindowLike);

/**
 * Sanitize an SVG Buffer and return a base64-encoded string
 * @param buffer - SVG content as a Buffer
 * @returns base64-encoded sanitized SVG string
 */
export function sanitizeSvgBase64(buffer: Buffer): string {
  const dirty = buffer.toString('utf-8');

  DOMPurify.setConfig({ USE_PROFILES: { svg: true } });

  // Remove SVG size to make it scale in the application properly
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName === 'svg') {
      node.removeAttribute('width');
      node.removeAttribute('height');
    }
  });

  // Sanitize directly — no parsing needed
  let cleaned = DOMPurify.sanitize(dirty);

  // Remove link titles
  cleaned = cleaned.replace(/\s*xlink:title=(["']).*?\1/g, '');

  return Buffer.from(cleaned, 'utf-8').toString('base64');
}
