import DOMPurify from 'dompurify';
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Modal,
  Box,
  Stack,
  IconButton,
  Typography,
  Backdrop,
} from '@mui/material';
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
 * Parse intrinsic dimensions from an SVG string.
 * Tries viewBox first, then explicit width/height attributes.
 */
function parseNaturalSize(markup: string): Size | null {
  const vbMatch = markup.match(/viewBox\s*=\s*"([^"]+)"/i);
  if (vbMatch) {
    const parts = vbMatch[1].split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }
  const wMatch = markup.match(
    /<svg[^>]*\bwidth\s*=\s*"(\d+(?:\.\d+)?)(?:px)?"/i,
  );
  const hMatch = markup.match(
    /<svg[^>]*\bheight\s*=\s*"(\d+(?:\.\d+)?)(?:px)?"/i,
  );
  if (wMatch && hMatch) {
    return { width: parseFloat(wMatch[1]), height: parseFloat(hMatch[1]) };
  }
  return null;
}

/**
 * Strip constraining dimension attributes / styles from the root <svg> so it
 * fills its container.  Preserves viewBox for correct aspect-ratio scaling.
 */
function normalizeSvgMarkup(markup: string): string {
  return markup.replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
    let cleaned = attrs
      .replace(/\s+width\s*=\s*"[^"]*"/gi, '')
      .replace(/\s+height\s*=\s*"[^"]*"/gi, '');
    cleaned = cleaned.replace(
      /style\s*=\s*"([^"]*)"/i,
      (_: string, style: string) => {
        const newStyle = style
          .replace(/max-width:\s*[^;]+;?\s*/gi, '')
          .trim();
        return newStyle ? `style="${newStyle}"` : '';
      },
    );
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

  /* ---------- fit & center on open ---------- */
  useEffect(() => {
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

    // Center after initial layout
    requestAnimationFrame(() => {
      const scroll = scrollRef.current;
      if (!scroll) return;
      scroll.scrollLeft = Math.max(
        0,
        (naturalSize.width * fit - scroll.clientWidth) / 2,
      );
      scroll.scrollTop = Math.max(
        0,
        (naturalSize.height * fit - scroll.clientHeight) / 2,
      );
    });
  }, [open, padding, naturalSize]);

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

  /* ---------- drag to pan ---------- */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let startX = 0,
      startY = 0,
      sl = 0,
      st = 0;
    let dragging = false;
    let moved = false;

    const clickBlocker = (e: MouseEvent) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
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
      if (!dragging) return;
      el.setPointerCapture(e.pointerId);
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) moved = true;
      el.scrollLeft = sl - dx;
      el.scrollTop = st - dy;
    };

    const endDrag = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      el.releasePointerCapture(e.pointerId);
      (el.style as CSSStyleDeclaration).cursor = 'grab';
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointerleave', endDrag);

    (el.style as CSSStyleDeclaration).cursor = 'grab';
    (el.style as CSSStyleDeclaration).userSelect = 'none';
    (el.style as CSSStyleDeclaration).touchAction = 'none';

    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', endDrag);
      el.removeEventListener('pointerleave', endDrag);
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
      slots={{ backdrop: Backdrop }}
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
          bgcolor: 'background.paper',
          zIndex: 1301,
          pointerEvents: 'auto',
        }}
      >
        {/* help text */}
        <Typography
          variant="caption"
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
          bgcolor="black"
          height="44px"
          direction="row"
          alignItems="center"
          position="fixed"
          top={0}
          left={0}
          right={0}
          zIndex={1400}
        >
          <Box marginLeft={2} height="19px">
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
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
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
                ADD_TAGS: ['foreignObject', 'div', 'span', 'p', 'br', 'i', 'b', 'em', 'strong', 'pre', 'code'],
                ADD_ATTR: ['class', 'style', 'xmlns', 'requiredExtensions'],
              }),
            }}
          />
        </Box>
      </Box>
    </Modal>
  );
};

export default SvgViewerModal;
