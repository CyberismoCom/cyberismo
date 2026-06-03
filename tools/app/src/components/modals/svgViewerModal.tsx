import DOMPurify from 'dompurify';
import React, {
  useState,
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
} from 'react';
import { Modal, Box, Stack, IconButton, Typography } from '@mui/joy';
import { Add, Remove, Autorenew, Close } from '@mui/icons-material';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

export interface SvgViewerModalProps {
  open: boolean;
  svgMarkup: string;
  onClose: () => void;
  padding?: number;
}

interface Size {
  width: number;
  height: number;
}

// Pixel height of the persistent top control bar
const CONTROL_BAR_HEIGHT = 44;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25;

/**
 * Returns true when the SVG string has a valid viewBox with positive dimensions.
 */
function hasUsableViewBox(markup: string): boolean {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg?.nodeName.toLowerCase() !== 'svg') {
    return false;
  }

  const viewBox = svg.getAttribute('viewBox');
  if (!viewBox) {
    return false;
  }

  const parts = viewBox
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number(part));

  return (
    parts.length === 4 &&
    Number.isFinite(parts[2]) &&
    Number.isFinite(parts[3]) &&
    parts[2] > 0 &&
    parts[3] > 0
  );
}

/**
 * Parse an absolute SVG length value (px, pt, pc, in, cm, mm) into pixels.
 * Returns null for relative/unit-less/invalid values.
 */
function parseAbsoluteSvgLength(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const match = value.trim().match(/^([+-]?\d*\.?\d+)(px|pt|pc|in|cm|mm)?$/i);
  if (!match) {
    return null;
  }

  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const unit = (match[2] || 'px').toLowerCase();
  switch (unit) {
    case 'px':
      return amount;
    case 'pt':
      return amount * (96 / 72);
    case 'pc':
      return amount * 16;
    case 'in':
      return amount * 96;
    case 'cm':
      return amount * (96 / 2.54);
    case 'mm':
      return amount * (96 / 25.4);
    default:
      return null;
  }
}

/**
 * Measure the natural size of an SVG by temporarily inserting it into the DOM.
 * Used as a fallback when viewBox and explicit width/height are not parseable.
 */
function measureNaturalSize(markup: string): Size | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const wrapper = document.createElement('div');
  wrapper.style.position = 'absolute';
  wrapper.style.left = '-10000px';
  wrapper.style.top = '-10000px';
  wrapper.style.visibility = 'hidden';
  wrapper.style.pointerEvents = 'none';
  wrapper.style.width = 'auto';
  wrapper.style.height = 'auto';

  wrapper.innerHTML = DOMPurify.sanitize(markup, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: [
      'foreignObject',
      'div',
      'span',
      'p',
      'br',
      'i',
      'b',
      'em',
      'strong',
      'pre',
      'code',
    ],
    ADD_ATTR: ['class', 'style', 'xmlns', 'requiredExtensions'],
    HTML_INTEGRATION_POINTS: { foreignobject: true },
  });

  const svg = wrapper.querySelector('svg') as SVGSVGElement | null;
  if (!svg) {
    return null;
  }

  document.body.appendChild(wrapper);
  try {
    const bbox = typeof svg.getBBox === 'function' ? svg.getBBox() : null;
    if (bbox && bbox.width > 0 && bbox.height > 0) {
      return { width: bbox.width, height: bbox.height };
    }

    const rect = svg.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return { width: rect.width, height: rect.height };
    }
  } catch {
    // Ignore measurement failures and fall back to null.
  } finally {
    wrapper.remove();
  }

  return null;
}

/**
 * Parse intrinsic dimensions from an SVG string.
 * Tries viewBox first, then explicit width/height attributes, then a
 * temporary DOM measurement fallback for valid SVGs without parseable lengths.
 */
function parseNaturalSize(markup: string): Size | null {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg?.nodeName.toLowerCase() !== 'svg') {
    return null;
  }

  const viewBox = svg.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox
      .trim()
      .split(/[\s,]+/)
      .map((part) => Number(part));
    if (
      parts.length === 4 &&
      Number.isFinite(parts[2]) &&
      Number.isFinite(parts[3]) &&
      parts[2] > 0 &&
      parts[3] > 0
    ) {
      return { width: parts[2], height: parts[3] };
    }
  }

  const width = parseAbsoluteSvgLength(svg.getAttribute('width'));
  const height = parseAbsoluteSvgLength(svg.getAttribute('height'));
  if (width && height) {
    return { width, height };
  }

  return measureNaturalSize(markup);
}

/**
 * Strip constraining dimension attributes / styles from the root <svg> so it
 * fills its container when intrinsic sizing is reliable. Preserves viewBox for
 * correct aspect-ratio scaling.
 */
function normalizeSvgMarkup(markup: string): string {
  const canFillContainer =
    hasUsableViewBox(markup) || parseNaturalSize(markup) !== null;

  return markup.replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
    let cleaned = attrs
      .replace(/\s+width\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
      .replace(/\s+height\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');
    cleaned = cleaned.replace(
      /style\s*=\s*(?:"([^"]*)"|'([^']*)')/i,
      (_: string, doubleQuotedStyle?: string, singleQuotedStyle?: string) => {
        const style = doubleQuotedStyle ?? singleQuotedStyle ?? '';
        const newStyle = style.replace(/max-width:\s*[^;]+;?\s*/gi, '').trim();
        return newStyle ? `style="${newStyle}"` : '';
      },
    );

    if (!canFillContainer) {
      return `<svg${cleaned}>`;
    }

    return `<svg width="100%" height="100%"${cleaned}>`;
  });
}

// To allow backbutton to close the modal, not to change the page
function useBackButtonModal(open: boolean, onClose: () => void) {
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!open || pushedRef.current) return;

    window.history.pushState(null, '');
    pushedRef.current = true;

    const handlePop = () => {
      if (pushedRef.current) {
        pushedRef.current = false;
        onClose();
      }
      window.removeEventListener('popstate', handlePop);
      window.history.replaceState(null, '');
    };

    window.addEventListener('popstate', handlePop);
  }, [open, onClose]);
}

const SvgViewerModal: React.FC<SvgViewerModalProps> = ({
  open,
  svgMarkup,
  onClose,
  padding = 32,
}) => {
  useBackButtonModal(open, onClose);
  const { t } = useTranslation();

  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTargetRef = useRef<{ left: number; top: number } | null>(null);

  // Derive intrinsic size and normalized SVG from the markup string
  const naturalSize = useMemo(() => parseNaturalSize(svgMarkup), [svgMarkup]);
  const normalizedSvg = useMemo(
    () => normalizeSvgMarkup(svgMarkup),
    [svgMarkup],
  );

  // Apply queued scroll position synchronously after React commits the DOM
  useLayoutEffect(() => {
    const target = scrollTargetRef.current;
    const scroll = scrollRef.current;
    if (target && scroll) {
      scroll.scrollLeft = target.left;
      scroll.scrollTop = target.top;
      scrollTargetRef.current = null;
    }
  }, [zoom]);

  // Apply fit-to-window zoom synchronously before paint so the user never
  // sees an unsized intermediate frame. naturalSize is derived from the
  // markup string, so it's already available on the first commit.
  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    if (!open || !naturalSize) return;

    const viewW = window.innerWidth - padding * 2;
    const viewH = window.innerHeight - CONTROL_BAR_HEIGHT - padding * 2;
    const fit = Math.min(
      viewW / naturalSize.width,
      viewH / naturalSize.height,
      1,
    );
    zoomRef.current = fit;
    setZoom(fit);

    const scroll = scrollRef.current;
    if (scroll) {
      // Queue the centered scroll position; the [zoom] useLayoutEffect
      // above applies it after the re-render, still before paint.
      scrollTargetRef.current = {
        left: Math.max(0, (naturalSize.width * fit - scroll.clientWidth) / 2),
        top: Math.max(0, (naturalSize.height * fit - scroll.clientHeight) / 2),
      };
    }
  }, [open, padding, naturalSize]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* ---------- zoom helpers ---------- */
  const applyZoom = (factor: number, localX?: number, localY?: number) => {
    if (!naturalSize) return;
    const scroll = scrollRef.current;
    if (!scroll) return;

    const oldZoom = zoomRef.current;
    const newZoom = Math.min(Math.max(oldZoom * factor, MIN_ZOOM), MAX_ZOOM);
    if (newZoom === oldZoom) return;

    const cx = localX ?? scroll.clientWidth / 2;
    const cy = localY ?? scroll.clientHeight / 2;

    const contentX = (scroll.scrollLeft + cx) / oldZoom;
    const contentY = (scroll.scrollTop + cy) / oldZoom;

    // Queue scroll position for useLayoutEffect (fires after DOM commit)
    scrollTargetRef.current = {
      left: contentX * newZoom - cx,
      top: contentY * newZoom - cy,
    };

    zoomRef.current = newZoom;
    setZoom(newZoom);
  };

  const applyZoomRef = useRef(applyZoom);
  useEffect(() => {
    applyZoomRef.current = applyZoom;
  });

  const zoomIn = () => applyZoom(ZOOM_STEP);
  const zoomOut = () => applyZoom(1 / ZOOM_STEP);
  const resetZoom = () => {
    zoomRef.current = 1;
    setZoom(1);
  };

  /* ---------- wheel zoom (always) ---------- */
  /* ---------- wheel / pinch zoom ---------- */
  /* ---------- wheel / pinch / shift zoom ---------- */
  const handleWheel = (e: React.WheelEvent) => {
    // Track‑pad pinch in Chrome/Safari sets ctrlKey=true.
    // For mouse users we use **Shift+Wheel** so we don’t clash with browser‑level Ctrl+Wheel zoom.
    const wantZoom = e.ctrlKey || e.metaKey || e.shiftKey;
    if (!wantZoom) return; // plain scroll → pan

    e.preventDefault();
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    const rect = scrollRef.current!.getBoundingClientRect();
    applyZoom(factor, e.clientX - rect.left, e.clientY - rect.top);
  };

  /* ---------- drag to pan (1 pointer) + pinch to zoom (2 pointers) ---------- */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const pointers = new Map<number, { x: number; y: number }>();

    let startX = 0,
      startY = 0,
      sl = 0,
      st = 0;
    let dragging = false;
    let moved = false;
    let pinchDistance = 0;

    const clickBlocker = (e: MouseEvent) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Distance between the two active pointers and their midpoint, expressed
    // in coordinates local to the scroll element.
    const pinchInfo = () => {
      const [a, b] = [...pointers.values()];
      const rect = el.getBoundingClientRect();
      return {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        midX: (a.x + b.x) / 2 - rect.left,
        midY: (a.y + b.y) / 2 - rect.top,
      };
    };

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 2) {
        // Entering pinch mode: stop panning, seed the reference distance.
        dragging = false;
        pinchDistance = pinchInfo().distance;
        return;
      }

      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      sl = el.scrollLeft;
      st = el.scrollTop;
      (el.style as CSSStyleDeclaration).cursor = 'grabbing';
      el.addEventListener('click', clickBlocker);
    };

    const move = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (pointers.size >= 2) {
        const { distance, midX, midY } = pinchInfo();
        if (pinchDistance > 0 && distance > 0) {
          applyZoomRef.current(distance / pinchDistance, midX, midY);
        }
        pinchDistance = distance;
        moved = true;
        return;
      }

      if (!dragging) return;
      el.setPointerCapture(e.pointerId);
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) moved = true;
      el.scrollLeft = sl - dx;
      el.scrollTop = st - dy;
    };

    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDistance = 0;
      if (dragging) {
        dragging = false;
        if (el.hasPointerCapture(e.pointerId)) {
          el.releasePointerCapture(e.pointerId);
        }
        (el.style as CSSStyleDeclaration).cursor = 'grab';
      }
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);

    (el.style as CSSStyleDeclaration).cursor = 'grab';
    (el.style as CSSStyleDeclaration).userSelect = 'none';
    (el.style as CSSStyleDeclaration).touchAction = 'none';

    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerleave', up);
      el.removeEventListener('click', clickBlocker);
      (el.style as CSSStyleDeclaration).cursor = 'auto';
    };
  }, [open]);

  /* ---------- scaled dimensions ---------- */
  const sizeStyle = naturalSize
    ? { width: naturalSize.width * zoom, height: naturalSize.height * zoom }
    : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      keepMounted
      slotProps={{
        backdrop: {
          sx: {
            pointerEvents: 'auto',
            zIndex: 1300,
          },
        },
      }}
    >
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.surface',
          zIndex: 1301,
          pointerEvents: 'auto',
        }}
      >
        {/* help text */}
        <Typography
          level="body-xs"
          sx={{
            position: 'absolute',
            bottom: 4,
            right: 8,
            zIndex: 20,
            bgcolor: 'rgba(0,0,0,0.6)',
            color: 'white',
            px: 1,
            py: 0.5,
            borderRadius: 1,
            userSelect: 'none',
          }}
        >
          {t('svgViewerHelpWindow')}
        </Typography>

        {/* control bar */}
        <Stack
          direction="row"
          alignItems="center"
          sx={{
            bgcolor: 'black',
            height: '44px',
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1400,
          }}
        >
          <Box sx={{ marginLeft: 2, height: '19px' }}>
            <Link to="/cards">
              <img
                src="/images/cyberismo.png"
                alt="Cyberismo"
                width="102"
                height="19"
              />
            </Link>
          </Box>
          {open && (
            <Box
              sx={{
                // Centered on desktop; right-aligned in-flow on small screens
                // so the button group never overlaps the logo.
                position: { xs: 'static', sm: 'absolute' },
                left: { sm: '50%' },
                transform: { sm: 'translateX(-50%)' },
                marginLeft: { xs: 'auto', sm: 0 },
                display: 'flex',
                alignItems: 'center',
                gap: 1, // nice even spacing
              }}
            >
              <IconButton sx={{ color: 'white' }} onClick={zoomOut}>
                <Remove />
              </IconButton>
              <IconButton sx={{ color: 'white' }} onClick={resetZoom}>
                <Autorenew />
              </IconButton>
              <IconButton sx={{ color: 'white' }} onClick={zoomIn}>
                <Add />
              </IconButton>
              <IconButton sx={{ color: 'white' }} onClick={onClose}>
                <Close />
              </IconButton>
            </Box>
          )}
        </Stack>
        <Box
          ref={scrollRef}
          sx={{
            marginTop: '44px',
            flex: 1,
            overflow: 'auto',
          }}
          onWheel={handleWheel}
        >
          <Box
            style={sizeStyle}
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(normalizedSvg, {
                USE_PROFILES: { svg: true },
                // Mermaid renders text inside <foreignObject> with HTML elements.
                // Allow only the specific tags/attributes Mermaid uses.
                ADD_TAGS: [
                  'foreignObject',
                  'div',
                  'span',
                  'p',
                  'br',
                  'i',
                  'b',
                  'em',
                  'strong',
                  'pre',
                  'code',
                ],
                ADD_ATTR: ['class', 'style', 'xmlns', 'requiredExtensions'],
                HTML_INTEGRATION_POINTS: { foreignobject: true },
              }),
            }}
          />
        </Box>
      </Box>
    </Modal>
  );
};

export default SvgViewerModal;
