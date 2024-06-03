import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../locales/en/translation.json'

i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  // load resources from ../locales
  resources: {
    en: {
      translation: en,
    },
  },
  debug: process.env.NODE_ENV === 'development',
  parseMissingKeyHandler: (key) => {
    return `__${key}__` // show missing keys so it's easier to spot
  },
})
