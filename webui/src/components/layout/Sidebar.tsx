import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settings'
import { TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { useTranslation } from 'react-i18next'
import { FileTextIcon, NetworkIcon, ZapIcon, MessageSquareIcon, HistoryIcon } from 'lucide-react'
import { SiteInfo } from '@/lib/constants'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip'

interface SidebarTabProps {
  value: string
  currentTab: string
  icon: React.ReactNode
  label: string
  collapsed?: boolean
}

function SidebarTab({ value, currentTab, icon, label, collapsed }: SidebarTabProps) {
  const isActive = currentTab === value

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <TabsTrigger
              value={value}
              className={cn(
                'group w-full h-12 flex items-center justify-center rounded-xl transition-all duration-300 cursor-pointer border-2',
                isActive
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/40 border-transparent scale-105'
                  : 'border-transparent hover:bg-emerald-100 dark:hover:bg-emerald-950/50 hover:text-emerald-600 dark:hover:text-emerald-400 text-muted-foreground'
              )}
            >
              <span className={cn('transition-transform duration-200', isActive && 'scale-110')}>
                {icon}
              </span>
            </TabsTrigger>
          </TooltipTrigger>
          <TooltipContent side="right" className="font-medium">
            {label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <TabsTrigger
      value={value}
      className={cn(
        'group w-full h-13 flex items-center gap-3 px-4 rounded-xl transition-all duration-300 cursor-pointer justify-start border-2',
        isActive
          ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/40 border-transparent'
          : 'border-transparent hover:bg-emerald-100 dark:hover:bg-emerald-950/50 hover:text-emerald-600 dark:hover:text-emerald-400 text-muted-foreground'
      )}
    >
      <span className={cn(
        'p-1.5 rounded-lg transition-all duration-200',
        isActive 
          ? 'bg-white/20' 
          : 'bg-muted/50 group-hover:bg-emerald-500/10'
      )}>
        {icon}
      </span>
      <span className="font-semibold">{label}</span>
      {isActive && (
        <span className="ml-auto w-2 h-2 rounded-full bg-white animate-pulse" />
      )}
    </TabsTrigger>
  )
}

interface SidebarProps {
  collapsed?: boolean
  onToggle?: () => void
}

export default function Sidebar({ collapsed = false }: SidebarProps) {
  const currentTab = useSettingsStore.use.currentTab()
  const { t } = useTranslation()

  return (
    <aside
      className={cn(
        'h-full flex flex-col border-r-2 border-emerald-200 dark:border-emerald-900/50 transition-all duration-300',
        'bg-gradient-to-b from-slate-50 via-emerald-50/30 to-slate-100 dark:from-slate-900 dark:via-emerald-950/20 dark:to-slate-900',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          'h-14 flex items-center border-b border-border',
          collapsed ? 'justify-center px-2' : 'px-4 gap-3'
        )}
      >
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/30">
          <ZapIcon className="size-5 text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="font-bold text-lg leading-tight bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">{SiteInfo.name}</span>
            <span className="text-xs text-muted-foreground">Knowledge Graph</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3">
        <TabsList className="flex flex-col gap-3 h-auto bg-transparent w-full">
          <SidebarTab
            value="documents"
            currentTab={currentTab}
            icon={<FileTextIcon className="size-5" />}
            label={t('header.documents')}
            collapsed={collapsed}
          />
          <SidebarTab
            value="knowledge-graph"
            currentTab={currentTab}
            icon={<NetworkIcon className="size-5" />}
            label={t('header.knowledgeGraph')}
            collapsed={collapsed}
          />
          <SidebarTab
            value="chat"
            currentTab={currentTab}
            icon={<MessageSquareIcon className="size-5" />}
            label={t('header.chat', 'Chat')}
            collapsed={collapsed}
          />
          <SidebarTab
            value="histories"
            currentTab={currentTab}
            icon={<HistoryIcon className="size-5" />}
            label={t('header.histories', 'Histories')}
            collapsed={collapsed}
          />
        </TabsList>
      </nav>

      {/* Footer */}
      <div
        className={cn(
          'p-3 border-t border-border',
          collapsed ? 'flex justify-center' : 'flex justify-center'
        )}
      >
        {collapsed ? (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
            <span className="text-[10px] font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">UIT</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <div className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-200 dark:border-emerald-800">
              <span className="text-xs font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                Master's Program UIT
              </span>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
