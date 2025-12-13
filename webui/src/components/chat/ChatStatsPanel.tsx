import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore, ChatStats } from '@/stores/chat'
import { cn } from '@/lib/utils'
import { 
  MessageSquareIcon, 
  ZapIcon, 
  ClockIcon, 
  TrendingUpIcon,
  ActivityIcon,
  BarChart3Icon,
  PieChartIcon,
  TimerIcon
} from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  trend?: 'up' | 'down' | 'neutral'
  color?: 'emerald' | 'blue' | 'purple' | 'orange' | 'pink'
  compact?: boolean
}

function StatCard({ title, value, subtitle, icon, color = 'emerald', compact = false }: StatCardProps) {
  const colorClasses = {
    emerald: 'bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    blue: 'bg-gradient-to-br from-blue-500/20 to-sky-500/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    purple: 'bg-gradient-to-br from-purple-500/20 to-violet-500/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800',
    orange: 'bg-gradient-to-br from-orange-500/20 to-amber-500/20 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800',
    pink: 'bg-gradient-to-br from-pink-500/20 to-rose-500/20 text-pink-600 dark:text-pink-400 border-pink-200 dark:border-pink-800'
  }

  const iconBgClasses = {
    emerald: 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30',
    blue: 'bg-gradient-to-br from-blue-500 to-sky-500 text-white shadow-lg shadow-blue-500/30',
    purple: 'bg-gradient-to-br from-purple-500 to-violet-500 text-white shadow-lg shadow-purple-500/30',
    orange: 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30',
    pink: 'bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow-lg shadow-pink-500/30'
  }

  const valueWrapperClasses = cn(
    compact ? 'text-xl font-semibold mt-1' : 'text-2xl font-bold mt-1',
    subtitle ? 'leading-tight' : ''
  )

  return (
    <div className={cn(
      'rounded-xl border-2 transition-all duration-200 hover:shadow-lg',
      compact ? 'p-3' : 'p-4',
      colorClasses[color]
    )}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className={cn(
            compact ? 'text-[10px]' : 'text-xs',
            'font-semibold text-muted-foreground uppercase tracking-wider'
          )}>
            {title}
          </p>
          <p className={valueWrapperClasses}>{value}</p>
          {subtitle && (
            <p className={cn('text-xs text-muted-foreground mt-1', compact ? 'text-[10px]' : '')}>{subtitle}</p>
          )}
        </div>
        <div className={cn(compact ? 'p-2' : 'p-2.5', 'rounded-xl', iconBgClasses[color])}>
          {icon}
        </div>
      </div>
    </div>
  )
}

interface ModeChartProps {
  queriesPerMode: ChatStats['queriesPerMode']
}

function ModeChart({ queriesPerMode }: ModeChartProps) {
  const { t } = useTranslation()
  
  const modes = [
    { key: 'naive', label: 'Naive', color: 'bg-gray-500' },
    { key: 'local', label: 'Local', color: 'bg-blue-500' },
    { key: 'global', label: 'Global', color: 'bg-emerald-500' },
    { key: 'hybrid', label: 'Hybrid', color: 'bg-purple-500' },
    { key: 'mix', label: 'Mix', color: 'bg-orange-500' },
    { key: 'bypass', label: 'Bypass', color: 'bg-pink-500' }
  ] as const

  const total = Object.values(queriesPerMode).reduce((a, b) => a + b, 0)

  return (
    <div className="bg-white/80 dark:bg-slate-900/65 rounded-2xl border border-emerald-200/60 p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <PieChartIcon className="size-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">{t('chat.stats.queryModes', 'Query Modes')}</h3>
      </div>
      <div className="space-y-2 text-[11px]">
        {modes.map(({ key, label, color }) => {
          const count = queriesPerMode[key] || 0
          const percentage = total > 0 ? (count / total) * 100 : 0
          
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium text-[11px]">{count} ({percentage.toFixed(0)}%)</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className={cn('h-full rounded-full transition-all', color)}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface ResponseTimeChartProps {
  responseTimes: number[]
}

function ResponseTimeChart({ responseTimes }: ResponseTimeChartProps) {
  const { t } = useTranslation()
  
  const maxTime = Math.max(...responseTimes, 1)
  const displayTimes = responseTimes.slice(-20) // Show last 20

  return (
    <div className="bg-card rounded-xl border border-border p-3">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3Icon className="size-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">{t('chat.stats.responseTimeTrend', 'Response Time Trend')}</h3>
      </div>
      <div className="h-28 flex items-end gap-0.5">
        {displayTimes.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
            {t('chat.stats.noData', 'No data yet')}
          </div>
        ) : (
          displayTimes.map((time, index) => {
            const height = (time / maxTime) * 100
            return (
              <div
                key={index}
                className="flex-1 bg-emerald-500/80 hover:bg-emerald-500 rounded-t transition-colors cursor-pointer group relative"
                style={{ height: `${Math.max(height, 5)}%` }}
              >
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                  {(time / 1000).toFixed(2)}s
                </div>
              </div>
            )
          })
        )}
      </div>
      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
        <span>{t('chat.stats.older', 'Older')}</span>
        <span>{t('chat.stats.newer', 'Newer')}</span>
      </div>
    </div>
  )
}

export default function ChatStatsPanel() {
  const { t } = useTranslation()
  const stats = useChatStore.use.stats()
  const messages = useChatStore.use.messages()
  const resetStats = useChatStore.use.resetStats()

  const formattedStats = useMemo(() => ({
    avgResponseTime: stats.averageResponseTime > 0 
      ? `${(stats.averageResponseTime / 1000).toFixed(2)}s` 
      : '-',
    fastestResponse: stats.fastestResponse !== Infinity 
      ? `${(stats.fastestResponse / 1000).toFixed(2)}s` 
      : '-',
    slowestResponse: stats.slowestResponse > 0 
      ? `${(stats.slowestResponse / 1000).toFixed(2)}s` 
      : '-',
    messageCount: messages.length
  }), [stats, messages.length])

  return (
    <div className="h-full flex flex-col border-l border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 via-white to-white/90 shadow-inner">
      {/* Header */}
      <div className="p-4 border-b border-emerald-200/70 bg-white/90 dark:bg-slate-950/70 backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ActivityIcon className="size-5 text-emerald-500" />
            <h2 className="font-semibold">{t('chat.stats.title', 'Chat Analytics')}</h2>
          </div>
          <button
            onClick={() => resetStats()}
            className="text-[11px] text-emerald-600 hover:text-emerald-700 transition-colors"
          >
            {t('chat.stats.reset', 'Reset')}
          </button>
        </div>
      </div>

      {/* Stats Content */}
      <div className="flex-1 overflow-auto px-4 py-5 space-y-4">
        <ResponseTimeChart responseTimes={stats.responseTimes} />

        <div className="grid grid-cols-2 gap-2">
          <StatCard
            title={t('chat.stats.avgResponse', 'Avg Response')}
            value={formattedStats.avgResponseTime}
            icon={<ClockIcon className="size-4" />}
            color="emerald"
            compact
          />
          <StatCard
            title={t('chat.stats.fastest', 'Fastest')}
            value={formattedStats.fastestResponse}
            icon={<TimerIcon className="size-4" />}
            color="blue"
            compact
          />
          <StatCard
            title={t('chat.stats.totalQueries', 'Total Queries')}
            value={stats.totalQueries}
            icon={<MessageSquareIcon className="size-4" />}
            color="emerald"
            compact
          />
          <StatCard
            title={t('chat.stats.messages', 'Messages')}
            value={formattedStats.messageCount}
            icon={<ZapIcon className="size-4" />}
            color="blue"
            compact
          />
        </div>

        <ModeChart queriesPerMode={stats.queriesPerMode} />

        <div className="bg-white/80 dark:bg-slate-900/70 rounded-2xl border border-emerald-200/70 p-3 space-y-2 shadow-sm text-[11px]">
          <div className="flex items-center gap-2">
            <TrendingUpIcon className="size-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">{t('chat.stats.performance', 'Performance')}</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-1 border-b border-border">
              <span className="text-muted-foreground">{t('chat.stats.slowest', 'Slowest Response')}</span>
              <span className="font-medium text-[11px]">{formattedStats.slowestResponse}</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-border">
              <span className="text-muted-foreground">{t('chat.stats.totalResponses', 'Total Responses')}</span>
              <span className="font-medium text-[11px]">{stats.totalResponses}</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-muted-foreground">{t('chat.stats.tokensUsed', 'Tokens Used')}</span>
              <span className="font-medium text-[11px]">{stats.totalTokensUsed.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
