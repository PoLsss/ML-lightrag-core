import { useState, useCallback, useEffect, useRef } from 'react'
import TabVisibilityProvider from '@/contexts/TabVisibilityProvider'
import StatusIndicator from '@/components/status/StatusIndicator'
import { useBackendState } from '@/stores/state'
import { useSettingsStore, Tab } from '@/stores/settings'
import Sidebar from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'
import { Tabs } from '@/components/ui/Tabs' // Chỉ import Tabs, không dùng TabsContent mặc định nếu muốn giữ state

import GraphViewer from '@/features/GraphViewer'
import DocumentManager from '@/features/DocumentManager'
import ChatView from '@/features/ChatView'
import HistoriesView from '@/features/HistoriesView'
import { cn } from '@/lib/utils' // Giả sử bạn có hàm cn để merge class (thường có trong shadcn)

// Component wrapper để giữ trạng thái (không unmount khi đổi tab)
const KeepAliveTabContent = ({ 
  value, 
  currentTab, 
  children, 
  className 
}: { 
  value: string; 
  currentTab: string; 
  children: React.ReactNode; 
  className?: string 
}) => {
  // Nếu tab này đang active thì hiện, không thì ẩn (nhưng vẫn nằm trong DOM)
  const isActive = value === currentTab;
  
  return (
    <div 
      role="tabpanel"
      className={cn(
        "absolute inset-0 overflow-hidden bg-background", // Base styles
        isActive ? "z-10 opacity-100 visible" : "-z-10 opacity-0 invisible pointer-events-none", // Ẩn hiện bằng CSS
        className
      )}
    >
      {children}
    </div>
  )
}

function App() {
  const enableHealthCheck = useSettingsStore.use.enableHealthCheck()
  const currentTab = useSettingsStore.use.currentTab() // Lấy tab hiện tại từ store
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const isMountedRef = useRef(true)

  // --- Logic Health Check (Đã tối ưu nhẹ) ---
  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  useEffect(() => {
    const performHealthCheck = async () => {
      if (!isMountedRef.current) return
      try {
        await useBackendState.getState().check()
      } catch (error) {
        console.error('Health check error:', error)
      }
    }

    // Set function vào store
    useBackendState.getState().setHealthCheckFunction(performHealthCheck)

    if (enableHealthCheck) {
      useBackendState.getState().resetHealthCheckTimer()
    } else {
      useBackendState.getState().clearHealthCheckTimer()
    }

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
    // Đã bỏ ThemeProvider thừa
    <TabVisibilityProvider>
      <Tabs
        value={currentTab} // SỬA LỖI 2: Dùng value thay vì defaultValue
        onValueChange={handleTabChange}
        className="flex h-screen w-screen overflow-hidden"
      >
        <Sidebar collapsed={sidebarCollapsed} />

        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar 
            sidebarCollapsed={sidebarCollapsed} 
            onToggleSidebar={toggleSidebar} 
          />

          <main className="flex-1 relative overflow-hidden bg-muted/30">
            {/* SỬA LỖI 1: Thay TabsContent bằng cơ chế ẩn/hiện thủ công */}
            
            {/* Document Manager: Có thể unmount cũng được, nhưng giữ lại thì tốt hơn */}
            <KeepAliveTabContent value="documents" currentTab={currentTab} className="p-4 overflow-auto">
              <DocumentManager />
            </KeepAliveTabContent>

            {/* Knowledge Graph: CẦN GIỮ STATE */}
            <KeepAliveTabContent value="knowledge-graph" currentTab={currentTab}>
              <GraphViewer />
            </KeepAliveTabContent>

            {/* Chat: CẦN GIỮ STATE (để không mất lịch sử chat đang gõ) */}
            <KeepAliveTabContent value="chat" currentTab={currentTab}>
              <ChatView />
            </KeepAliveTabContent>

            {/* Histories: Có thể unmount nếu muốn tiết kiệm mem */}
            <KeepAliveTabContent value="histories" currentTab={currentTab}>
              <HistoriesView />
            </KeepAliveTabContent>

          </main>
        </div>

        {enableHealthCheck && <StatusIndicator />}
      </Tabs>
    </TabVisibilityProvider>
  )
}

export default App