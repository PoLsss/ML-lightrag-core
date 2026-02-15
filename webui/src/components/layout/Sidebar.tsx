import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/state'
import { TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { useTranslation } from 'react-i18next'
import { FileTextIcon, NetworkIcon, ZapIcon, MessageSquareIcon, HistoryIcon, LayoutDashboardIcon, ShieldIcon } from 'lucide-react'
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
                'group w-full h-10 flex items-center justify-center rounded-xl transition-all duration-300 cursor-pointer border-2',
                isActive
                  ? 'bg-[linear-gradient(to_right,var(--brand),var(--brand-secondary))] text-[var(--brand-foreground)] shadow-lg border-transparent scale-105'
                  : 'border-transparent hover:bg-[var(--brand-hover)] hover:text-foreground text-foreground/70'
              )}
              style={isActive ? { boxShadow: '0 10px 15px -3px color-mix(in srgb, var(--brand) 40%, transparent)' } : undefined}
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
        'group w-full h-11 flex items-center gap-2.5 px-3 rounded-xl transition-all duration-300 cursor-pointer justify-start border-2',
        isActive
          ? 'bg-[linear-gradient(to_right,var(--brand),var(--brand-secondary))] text-[var(--brand-foreground)] shadow-lg border-transparent'
          : 'border-transparent hover:bg-[var(--brand-hover)] hover:text-foreground text-foreground/70'
      )}
      style={isActive ? { boxShadow: '0 10px 15px -3px color-mix(in srgb, var(--brand) 40%, transparent)' } : undefined}
    >
      <span className={cn(
        'p-1.5 rounded-lg transition-all duration-200',
        isActive
          ? 'bg-white/20'
          : 'bg-muted/50 group-hover:bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]'
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
  const { userRole } = useAuthStore()
  const { t } = useTranslation()

  return (
    <aside
      className={cn(
        'h-full flex flex-col border-r-2 border-[var(--brand-border)] dark:border-[var(--brand-border-dark)] transition-all duration-300',
        'bg-gradient-to-b from-slate-50 via-[var(--brand-muted)] to-slate-100 dark:from-slate-900 dark:via-[var(--brand-muted)] dark:to-slate-900',
        collapsed ? 'w-16' : 'w-52'
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          'h-14 flex items-center border-b border-border',
          collapsed ? 'justify-center px-2' : 'px-4 gap-3'
        )}
      >
        <div
          className="flex items-center justify-center w-9 h-9 rounded-xl bg-[linear-gradient(to_bottom_right,var(--brand),var(--brand-secondary))] shadow-lg"
          style={{ boxShadow: '0 10px 15px -3px color-mix(in srgb, var(--brand) 30%, transparent)' }}
        >
          <ZapIcon className="size-5 text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="font-bold text-lg leading-tight bg-[linear-gradient(to_right,var(--brand),var(--brand-secondary))] bg-clip-text text-transparent">{SiteInfo.name}</span>
            <span className="text-xs text-muted-foreground">Knowledge Graph</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2.5">
        <TabsList className="flex flex-col gap-1.5 h-auto bg-transparent w-full">
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
          <SidebarTab
            value="dashboard"
            currentTab={currentTab}
            icon={<LayoutDashboardIcon className="size-5" />}
            label={t('header.dashboard', 'Dashboard')}
            collapsed={collapsed}
          />
          {userRole === 'admin' && (
            <SidebarTab
              value="access-control"
              currentTab={currentTab}
              icon={<ShieldIcon className="size-5" />}
              label={t('header.accessControl', 'Access Control')}
              collapsed={collapsed}
            />
          )}
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
          <div className="w-8 h-8 rounded-full bg-[linear-gradient(to_bottom_right,color-mix(in_srgb,var(--brand)_20%,transparent),color-mix(in_srgb,var(--brand-secondary)_20%,transparent))] flex items-center justify-center">
            <span className="text-[10px] font-bold bg-[linear-gradient(to_right,var(--brand),var(--brand-secondary))] bg-clip-text text-transparent">UIT</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <div className="px-3 py-1.5 rounded-lg bg-[linear-gradient(to_right,color-mix(in_srgb,var(--brand)_10%,transparent),color-mix(in_srgb,var(--brand-secondary)_10%,transparent))] border border-[var(--brand-border)] dark:border-[var(--brand-border-dark)]">
              <span className="text-xs font-semibold bg-[linear-gradient(to_right,var(--brand),var(--brand-secondary))] bg-clip-text text-transparent">
                Master's Program UIT
              </span>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
