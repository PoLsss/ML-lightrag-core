import Button from '@/components/ui/Button'
import { SiteInfo } from '@/lib/constants'
import AppSettings from '@/components/AppSettings'
import { useAuthStore } from '@/stores/state'
import { useTranslation } from 'react-i18next'
import { GithubIcon, LogOutIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip'
import { navigationService } from '@/services/navigation'

interface TopBarProps {
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}

export default function TopBar({ sidebarCollapsed, onToggleSidebar }: TopBarProps) {
  const { t } = useTranslation()
  const { isGuestMode, webuiTitle, webuiDescription } = useAuthStore()

  const handleLogout = () => {
    navigationService.navigateToLogin()
  }

  return (
    <header className="h-14 flex items-center justify-between px-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Left side */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="hover:bg-muted"
        >
          {sidebarCollapsed ? (
            <PanelLeftOpenIcon className="size-5" />
          ) : (
            <PanelLeftCloseIcon className="size-5" />
          )}
        </Button>

        {webuiTitle && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-lg">{webuiTitle}</span>
                </div>
              </TooltipTrigger>
              {webuiDescription && (
                <TooltipContent side="bottom">{webuiDescription}</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        )}

        {isGuestMode && (
          <div className="px-2 py-1 text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 rounded-md">
            {t('login.guestMode', 'Guest Mode')}
          </div>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <a href={SiteInfo.github} target="_blank" rel="noopener noreferrer">
            <GithubIcon className="size-4" />
          </a>
        </Button>

        <AppSettings />

        {!isGuestMode && (
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOutIcon className="size-4" />
          </Button>
        )}
      </div>
    </header>
  )
}
