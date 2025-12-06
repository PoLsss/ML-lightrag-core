import { useState, useCallback, useEffect, useRef } from 'react'
import ThemeProvider from '@/components/ThemeProvider'
import TabVisibilityProvider from '@/contexts/TabVisibilityProvider'
import StatusIndicator from '@/components/status/StatusIndicator'
import { useBackendState } from '@/stores/state'
import { useSettingsStore, Tab } from '@/stores/settings'
import Sidebar from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'

import GraphViewer from '@/features/GraphViewer'
import DocumentManager from '@/features/DocumentManager'
import ChatView from '@/features/ChatView'
import HistoriesView from '@/features/HistoriesView'

import { Tabs, TabsContent } from '@/components/ui/Tabs'

function App() {
  const enableHealthCheck = useSettingsStore.use.enableHealthCheck()
  const currentTab = useSettingsStore.use.currentTab()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true

    const handleBeforeUnload = () => {
      isMountedRef.current = false
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      isMountedRef.current = false
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  useEffect(() => {
    const performHealthCheck = async () => {
      try {
        if (isMountedRef.current) {
          await useBackendState.getState().check()
        }
      } catch (error) {
        console.error('Health check error:', error)
      }
    }

    useBackendState.getState().setHealthCheckFunction(performHealthCheck)

    if (!enableHealthCheck) {
      useBackendState.getState().clearHealthCheckTimer()
      return
    }

    useBackendState.getState().resetHealthCheckTimer()

    return () => {
      useBackendState.getState().clearHealthCheckTimer()
    }
  }, [enableHealthCheck])

  const handleTabChange = useCallback(
    (tab: string) => useSettingsStore.getState().setCurrentTab(tab as Tab),
    []
  )

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => !prev)
  }, [])

  return (
    <ThemeProvider>
      <TabVisibilityProvider>
        <Tabs
          defaultValue={currentTab}
          className="flex h-screen w-screen overflow-hidden"
          onValueChange={handleTabChange}
        >
          {/* Sidebar */}
          <Sidebar collapsed={sidebarCollapsed} />

          {/* Main Area */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Top Bar */}
            <TopBar 
              sidebarCollapsed={sidebarCollapsed} 
              onToggleSidebar={toggleSidebar} 
            />

            {/* Content */}
            <main className="flex-1 relative overflow-hidden bg-muted/30">
              <TabsContent 
                value="documents" 
                className="absolute inset-0 overflow-auto p-4"
              >
                <DocumentManager />
              </TabsContent>
              <TabsContent 
                value="knowledge-graph" 
                className="absolute inset-0 overflow-hidden"
              >
                <GraphViewer />
              </TabsContent>
              <TabsContent 
                value="chat" 
                className="absolute inset-0 overflow-hidden"
              >
                <ChatView />
              </TabsContent>
              <TabsContent 
                value="histories" 
                className="absolute inset-0 overflow-hidden"
              >
                <HistoriesView />
              </TabsContent>
            </main>
          </div>

          {enableHealthCheck && <StatusIndicator />}
        </Tabs>
      </TabVisibilityProvider>
    </ThemeProvider>
  )
}

export default App
