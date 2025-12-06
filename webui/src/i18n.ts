import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'

import en from './locales/en.json'
import zh from './locales/zh.json'

const getStoredLanguage = () => {
  try {
    const settingsString = localStorage.getItem('settings-storage')
    if (settingsString) {
      const settings = JSON.parse(settingsString)
      return settings.state?.language || 'en'
    }
  } catch (e) {
    console.error('Failed to get stored language:', e)
  }
  return 'en'
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh }
    },
    lng: getStoredLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    },
    returnEmptyString: false,
    returnNull: false
  })

useSettingsStore.subscribe((state) => {
  const currentLanguage = state.language
  if (i18n.language !== currentLanguage) {
    i18n.changeLanguage(currentLanguage)
  }
})

export default i18n
