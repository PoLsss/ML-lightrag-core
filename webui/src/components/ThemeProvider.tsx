import { createContext, useEffect } from 'react'
import { Theme, useSettingsStore } from '@/stores/settings'

type ThemeProviderProps = {
  children: React.ReactNode
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: 'dark',
  setTheme: () => null
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

/**
 * Component that provides the theme state and setter function to its children.
 */
export default function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const theme = useSettingsStore.use.theme()
  const setTheme = useSettingsStore.use.setTheme()

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark', 'pink-neon')
    root.classList.add(theme)
  }, [theme])

  const value = {
    theme,
    setTheme
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export { ThemeProviderContext }
