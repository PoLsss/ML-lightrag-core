import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'

interface TabVisibilityContextType {
  isVisible: boolean
  wasHidden: boolean
  markAsProcessed: () => void
}

const TabVisibilityContext = createContext<TabVisibilityContextType>({
  isVisible: true,
  wasHidden: false,
  markAsProcessed: () => {}
})

export function useTabVisibility() {
  return useContext(TabVisibilityContext)
}

interface TabVisibilityProviderProps {
  children: ReactNode
}

export default function TabVisibilityProvider({ children }: TabVisibilityProviderProps) {
  const [isVisible, setIsVisible] = useState(!document.hidden)
  const [wasHidden, setWasHidden] = useState(false)

  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = !document.hidden
      setIsVisible(visible)
      if (visible) {
        setWasHidden(true)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const markAsProcessed = useCallback(() => {
    setWasHidden(false)
  }, [])

  return (
    <TabVisibilityContext.Provider value={{ isVisible, wasHidden, markAsProcessed }}>
      {children}
    </TabVisibilityContext.Provider>
  )
}
