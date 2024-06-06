import { createTheme } from '@mui/material'

declare module '@mui/material/styles' {
  interface Palette {
    bgsoft: Palette['primary']
    bgColor: Palette['primary']
  }
  interface PaletteOptions {
    bgsoft: PaletteOptions['primary']
    bgColor: PaletteOptions['primary']
  }
}

const theme = createTheme({
  typography: {
    h1: {
      fontSize: '2rem',
      fontWeight: 'bold',
    },
    h3: {
      fontSize: '1.2rem',
      fontWeight: 'bold',
    },
  },
  palette: {
    bgsoft: {
      main: '#f0f4f8',
      dark: '#171A1C',
    },
    bgColor: {
      main: '#12467B',
      dark: '#C7DFF7',
    },
  },
})

export default theme
