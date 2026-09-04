/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { extendTheme } from '@mui/joy/styles';

/**
 * Cyberismo Console — the app's design system.
 *
 * Brand values (accent, ink, cream, gold, typefaces, spacing, radius) come from
 * the Cyberismo design system. Everything density- or state-related is decided
 * here, because those need real screens and real data to get right.
 *
 * Two rules hold the system together:
 *   1. One corner. `radius` is 2px everywhere; 0 for full-bleed bars and status
 *      rails, 999px for avatars only.
 *   2. No blue. Primary action is ink (inverting on dark), amber carries
 *      "in progress", and the brand orange is reserved for the focus ring and
 *      the logo. Semantic colour is the only colour that means anything.
 */

// ---------------------------------------------------------------------------
// Brand constants (mirror of the design system's --cy-* tokens)
// ---------------------------------------------------------------------------
export const BRAND = {
  orange: '#FF530F', // accent — focus ring and logo only
  orangeDark: '#FF6A2C', // lifted for dark grounds
  gold: '#FFB022', // "active" workflow state, progress, primary control
  goldDark: '#FFB93D',
  ink: '#2A2A2A', // official brand grey, "Tummanharmaa"
  cream: '#F2EDE4',
} as const;

/** Workflow state colours, per colour scheme. Consumed via `getStateColor`. */
export const STATE_COLORS = {
  light: {
    initial: '#8A8F98',
    active: BRAND.gold,
    closed: '#2E8B4E',
    error: '#D5331E',
  },
  dark: {
    initial: '#7A7F89',
    active: BRAND.goldDark,
    closed: '#3CBF75',
    error: '#E4614A',
  },
} as const;

/** Density constants, referenced by layout components. */
export const DENSITY = {
  appBarHeight: 48,
  rowHeight: 32,
  railWidth: 280,
  /** Reserved, non-shrinking column for a progress figure. Fits "100%". */
  figureColumn: 38,
  /** Minimum useful width for the navigation rail, in px. */
  railMinWidth: 220,
  /** Measure for long-form document content. */
  documentMeasure: '72ch',
} as const;

const fontFamily = {
  body: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  display:
    "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  code: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fallback: 'system-ui, sans-serif',
};

const theme = extendTheme({
  cssVarPrefix: 'joy',
  fontFamily,

  radius: {
    xs: '0px',
    sm: '2px',
    md: '2px',
    lg: '2px',
    xl: '2px',
  },

  focus: {
    default: {
      outlineOffset: '2px',
      outlineWidth: '2px',
      outlineColor: BRAND.orange,
    },
  },

  fontWeight: {
    sm: 500,
    md: 500,
    lg: 700,
    xl: 800,
  },

  // Structure is drawn with hairlines; elevation is reserved for overlays.
  shadow: {
    xs: 'none',
    sm: 'none',
    md: '0 10px 30px rgba(42,42,42,0.10), 0 1px 2px rgba(42,42,42,0.06)',
    lg: '0 10px 30px rgba(42,42,42,0.10), 0 1px 2px rgba(42,42,42,0.06)',
    xl: '0 10px 30px rgba(42,42,42,0.10), 0 1px 2px rgba(42,42,42,0.06)',
  },

  typography: {
    h1: {
      fontFamily: fontFamily.display,
      fontSize: '2rem',
      fontWeight: 800,
      lineHeight: 1.15,
      letterSpacing: '-0.03em',
    },
    h2: {
      fontFamily: fontFamily.display,
      fontSize: '1.75rem',
      fontWeight: 800,
      lineHeight: 1.2,
      letterSpacing: '-0.03em',
    },
    h3: {
      fontSize: '1.25rem',
      fontWeight: 700,
      lineHeight: 1.3,
      letterSpacing: '-0.02em',
    },
    h4: { fontSize: '1rem', fontWeight: 700, lineHeight: 1.4 },
    'title-lg': { fontSize: '1rem', fontWeight: 700, lineHeight: 1.4 },
    'title-md': { fontSize: '0.9375rem', fontWeight: 700, lineHeight: 1.4 },
    'title-sm': { fontSize: '0.875rem', fontWeight: 700, lineHeight: 1.4 },
    'body-lg': { fontSize: '1rem', fontWeight: 500, lineHeight: 1.65 },
    'body-md': { fontSize: '0.9375rem', fontWeight: 500, lineHeight: 1.6 },
    'body-sm': { fontSize: '0.8125rem', fontWeight: 500, lineHeight: 1.45 },
    'body-xs': { fontSize: '0.6875rem', fontWeight: 500, lineHeight: 1.4 },
    // Uppercase tracked label, from the brand's eyebrow treatment. Applied
    // deliberately to things that are labels — never to a shared body level.
    label: {
      fontSize: '0.6875rem',
      fontWeight: 800,
      lineHeight: 1.2,
      letterSpacing: '0.09em',
      textTransform: 'uppercase',
      color: 'var(--joy-palette-text-tertiary)',
    },
  },

  colorSchemes: {
    light: {
      palette: {
        // Ink is the primary action colour — there is no blue in this system.
        primary: {
          50: '#F5F5F4',
          100: '#E7E6E3',
          200: '#D2D0CB',
          300: '#B0ADA6',
          400: '#6B7280',
          500: '#3D4149',
          600: '#2A2A2A',
          700: '#1F1F1F',
          800: '#171717',
          900: '#0F0F0F',
          plainColor: '#2A2A2A',
          plainHoverBg: '#F4F2EE',
          plainActiveBg: '#E4E1DA',
          softBg: '#F4F2EE',
          softColor: '#2A2A2A',
          softHoverBg: '#EDEAE3',
          softActiveBg: '#E4E1DA',
          outlinedColor: '#2A2A2A',
          outlinedBorder: '#CFCBC2',
          outlinedHoverBg: '#F4F2EE',
          solidBg: '#2A2A2A',
          solidHoverBg: '#1F1F1F',
          solidActiveBg: '#171717',
          solidColor: '#FBFAF8',
        },
        neutral: {
          50: '#FBFAF8',
          100: '#F4F2EE',
          200: '#E4E1DA',
          300: '#CFCBC2',
          400: '#A9A59B',
          500: '#6B7280',
          600: '#4B5058',
          700: '#3D4149',
          800: '#2A2A2A',
          900: '#17181A',
          plainColor: '#3D4149',
          plainHoverBg: '#F4F2EE',
          softBg: '#F4F2EE',
          softColor: '#2A2A2A',
          softHoverBg: '#E4E1DA',
          outlinedColor: '#2A2A2A',
          outlinedBorder: '#E4E1DA',
          solidBg: '#3D4149',
          solidColor: '#FBFAF8',
        },
        success: {
          400: STATE_COLORS.light.closed,
          500: STATE_COLORS.light.closed,
          solidBg: STATE_COLORS.light.closed,
          softBg: '#E7F4EC',
          softColor: '#1B5E36',
          plainColor: '#1B5E36',
          outlinedColor: '#1B5E36',
        },
        warning: {
          300: BRAND.gold,
          400: BRAND.gold,
          500: '#E89A17',
          solidBg: BRAND.gold,
          solidColor: BRAND.ink,
          softBg: '#FFF3DE',
          softColor: '#7A4E00',
          plainColor: '#7A4E00',
          outlinedColor: '#7A4E00',
        },
        danger: {
          400: STATE_COLORS.light.error,
          500: STATE_COLORS.light.error,
          solidBg: STATE_COLORS.light.error,
          softBg: '#FBEAE7',
          softColor: '#8F2415',
          plainColor: STATE_COLORS.light.error,
          outlinedColor: STATE_COLORS.light.error,
          outlinedBorder: STATE_COLORS.light.error,
        },
        background: {
          body: '#FBFAF8',
          surface: '#FFFFFF',
          level1: '#F4F2EE',
          level2: '#EDEAE3',
          popup: '#FFFFFF',
        },
        text: {
          primary: '#2A2A2A',
          secondary: '#3D4149',
          // Clears AA on every ground it is used on, including the sunken
          // rail (#F4F2EE) and a selected row — 4.32:1 was not enough.
          tertiary: '#555C67',
        },
        divider: '#E4E1DA',
        focusVisible: BRAND.orange,
      },
    },

    dark: {
      palette: {
        // Solid primary inverts on dark — ink on ink would disappear.
        // The numeric scale keeps its conventional direction (50 lightest →
        // 900 darkest) in both schemes, because Joy *derives* variant roles
        // from it — inverting the scale silently makes soft text the same
        // colour as its own background. Every role this app relies on is also
        // set explicitly below, so nothing depends on derivation.
        primary: {
          50: '#FBFAF8',
          100: '#F4F2EE',
          200: '#E7E6E3',
          300: '#DCDAD5',
          400: '#C6C7CC',
          500: '#9A9CA5',
          600: '#6B7280',
          700: '#3D4149',
          800: '#22252C',
          900: '#14151A',
          plainColor: '#ECEAE5',
          plainHoverBg: '#22252C',
          plainActiveBg: '#2B2E36',
          softBg: '#22252C',
          softColor: '#ECEAE5',
          softHoverBg: '#2B2E36',
          softActiveBg: '#3A3E48',
          outlinedColor: '#ECEAE5',
          outlinedBorder: '#3A3E48',
          outlinedHoverBg: '#22252C',
          solidBg: '#ECEAE5',
          solidHoverBg: '#FFFFFF',
          solidActiveBg: '#D8D6D1',
          solidColor: '#14151A',
        },
        neutral: {
          50: '#F4F2EE',
          100: '#E4E1DA',
          200: '#D3D0CA',
          300: '#A9A59B',
          400: '#9A9CA5',
          500: '#6B7280',
          600: '#3A3E48',
          700: '#2B2E36',
          800: '#22252C',
          900: '#14151A',
          plainColor: '#C6C7CC',
          plainHoverBg: '#22252C',
          plainActiveBg: '#2B2E36',
          softBg: '#22252C',
          softColor: '#ECEAE5',
          softHoverBg: '#2B2E36',
          softActiveBg: '#3A3E48',
          outlinedColor: '#ECEAE5',
          outlinedBorder: '#2B2E36',
          // Selected rows sit on #3A3E48; tertiary text is too dim there.
          plainHoverColor: '#ECEAE5',
          outlinedHoverBg: '#22252C',
          solidBg: '#3A3E48',
          solidColor: '#ECEAE5',
        },
        success: {
          400: STATE_COLORS.dark.closed,
          500: STATE_COLORS.dark.closed,
          solidBg: STATE_COLORS.dark.closed,
          solidColor: '#0B1A11',
          softBg: '#12281C',
          softColor: '#7FDCA5',
          plainColor: '#7FDCA5',
          outlinedColor: '#7FDCA5',
        },
        warning: {
          300: BRAND.goldDark,
          400: BRAND.goldDark,
          500: BRAND.goldDark,
          solidBg: BRAND.goldDark,
          solidColor: '#14151A',
          softBg: '#2C2113',
          softColor: '#FFD285',
          plainColor: '#FFD285',
          outlinedColor: '#FFD285',
        },
        danger: {
          400: STATE_COLORS.dark.error,
          500: STATE_COLORS.dark.error,
          solidBg: STATE_COLORS.dark.error,
          softBg: '#2E1512',
          softColor: '#F2A093',
          plainColor: STATE_COLORS.dark.error,
          outlinedColor: STATE_COLORS.dark.error,
          outlinedBorder: STATE_COLORS.dark.error,
        },
        background: {
          body: '#14151A',
          surface: '#1B1D23',
          level1: '#101116',
          level2: '#22252C',
          popup: '#1B1D23',
        },
        text: {
          primary: '#ECEAE5',
          secondary: '#C6C7CC',
          tertiary: '#A5A7B0',
        },
        divider: '#2B2E36',
        focusVisible: BRAND.orangeDark,
      },
    },
  },

  components: {
    JoyButton: {
      styleOverrides: {
        root: {
          fontWeight: 700,
          letterSpacing: 0,
          borderRadius: '2px',
        },
      },
    },
    JoyIconButton: {
      styleOverrides: { root: { borderRadius: '2px' } },
    },
    JoyMenuButton: {
      styleOverrides: { root: { fontWeight: 700, borderRadius: '2px' } },
    },
    JoyInput: {
      styleOverrides: { root: { borderRadius: '2px' } },
    },
    JoyTextarea: {
      styleOverrides: { root: { borderRadius: '2px' } },
    },
    JoySelect: {
      styleOverrides: { root: { borderRadius: '2px' } },
    },
    JoyChip: {
      styleOverrides: {
        root: { borderRadius: '2px', fontWeight: 700 },
      },
    },
    JoySheet: {
      styleOverrides: { root: { borderRadius: '2px' } },
    },
    JoyCard: {
      styleOverrides: { root: { borderRadius: '2px' } },
    },
    JoyMenu: {
      styleOverrides: { root: { borderRadius: '2px' } },
    },
    JoyTooltip: {
      styleOverrides: { root: { borderRadius: '2px', fontWeight: 500 } },
    },
    JoyModalDialog: {
      styleOverrides: { root: { borderRadius: '2px' } },
    },
    JoyLinearProgress: {
      styleOverrides: { root: { borderRadius: 0 } },
    },
  },
});

export default theme;
