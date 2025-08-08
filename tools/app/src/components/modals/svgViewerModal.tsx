import React, { useState, useEffect, useRef } from 'react';
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
  const [naturalSize, setNaturalSize] = useState<Size | null>(null);

  const svgHolderRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* ---------- fit & center on open ---------- */
  useEffect(() => {
    if (!open) return;

    const id = requestAnimationFrame(() => {
      const svg = svgHolderRef.current?.querySelector('svg');
      if (!svg) return;

      let width =
        (svg as SVGSVGElement).width?.baseVal?.value || svg.getBBox().width;
      let height =
        (svg as SVGSVGElement).height?.baseVal?.value || svg.getBBox().height;
      if (!width || !height) {
        const rect = svg.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
      }
      const intrinsic = { width, height };
      setNaturalSize(intrinsic);

      const viewW = window.innerWidth - padding * 2;
      const viewH = window.innerHeight - CONTROL_BAR_HEIGHT - padding * 2;
      const fit = Math.min(viewW / width, viewH / height, 1);
      setZoom(fit);

      requestAnimationFrame(() => {
        const scroll = scrollRef.current;
        if (!scroll) return;
        scroll.scrollLeft = Math.max(0, (width * fit - scroll.clientWidth) / 2);
        scroll.scrollTop = Math.max(
          0,
          (height * fit - scroll.clientHeight) / 2,
        );
      });
    });

    return () => cancelAnimationFrame(id);
  }, [open, padding]);

  /* ---------- zoom helpers ---------- */
  const applyZoom = (factor: number, localX?: number, localY?: number) => {
    if (!naturalSize) return;
    const scroll = scrollRef.current;
    if (!scroll) return;

    const oldZoom = zoom;
    const newZoom = Math.min(Math.max(oldZoom * factor, MIN_ZOOM), MAX_ZOOM);
    if (newZoom === oldZoom) return;

    const cx = localX ?? scroll.clientWidth / 2;
    const cy = localY ?? scroll.clientHeight / 2;

    const contentX = (scroll.scrollLeft + cx) / oldZoom;
    const contentY = (scroll.scrollTop + cy) / oldZoom;

    setZoom(newZoom);

    requestAnimationFrame(() => {
      scroll.scrollLeft = contentX * newZoom - cx;
      scroll.scrollTop = contentY * newZoom - cy;
    });
  };

  const zoomIn = () => applyZoom(ZOOM_STEP);
  const zoomOut = () => applyZoom(1 / ZOOM_STEP);
  const resetZoom = () => setZoom(1);

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
            ref={svgHolderRef}
            style={sizeStyle}
            dangerouslySetInnerHTML={{ __html: svgMarkup }}
          />
        </Box>
      </Box>
    </Modal>
  );
};

export default SvgViewerModal;
