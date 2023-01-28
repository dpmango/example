import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import Backend from 'i18next-http-backend'
import { initReactI18next } from 'react-i18next'

import en from '@/assets/locales/en/common.json'
import ru from '@/assets/locales/ru/common.json'

const resources = {
  ru,
  en,
}

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    defaultNS: '',
    supportedLngs: ['en', 'ru'],
    fallbackLng: 'en',
    load: 'currentOnly',
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lng',
    },
    react: {
      bindI18n: 'languageChanged',
      bindI18nStore: '',
      transEmptyNodeValue: '',
      transSupportBasicHtmlNodes: true,
      transKeepBasicHtmlNodesFor: ['br', 'strong', 'i', 'a'],
      useSuspense: false,
    },
    interpolation: {
      escapeValue: false,
    },
    resources,
  })

export default i18n
