import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import {
    ActivityIcon,
    FileTextIcon,
    CoinsIcon,
    ClockIcon,
    TrendingUpIcon,
    RefreshCwIcon
} from 'lucide-react'
import StatsCard from '@/components/dashboard/StatsCard'
import QueryChart from '@/components/dashboard/QueryChart'
import QueryLogsTable from '@/components/dashboard/QueryLogsTable'
import Button from '@/components/ui/Button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/Select'
import { useAuthStore } from '@/stores/state'
import {
    getDashboardStats,
    getQueryLogs,
    getQueryTrends,
    exportQueryLogs,
    downloadExportedLogs,
    DashboardStats,
    QueryLogEntry,
    QueryTrendEntry
} from '@/api/dashboard'

type PeriodFilter = 'today' | 'week' | 'month' | 'all'

export default function Dashboard() {
    const { isAuthenticated } = useAuthStore()
    const [isLoading, setIsLoading] = useState(true)
    const [period, setPeriod] = useState<PeriodFilter>('week')


    // Data states
    const [stats, setStats] = useState<DashboardStats | null>(null)
    const [trends, setTrends] = useState<QueryTrendEntry[]>([])
    const [logs, setLogs] = useState<QueryLogEntry[]>([])
    const [logsTotal, setLogsTotal] = useState(0)
    const [logsPage, setLogsPage] = useState(1)
    const [logsTotalPages, setLogsTotalPages] = useState(1)
    const [logsPageSize] = useState(10)

    // Fetch dashboard data
    const fetchData = useCallback(async () => {
        // Don't fetch if not authenticated
        if (!isAuthenticated) {
            setIsLoading(false)
            return
        }

        setIsLoading(true)
        try {
            const [statsData, trendsData, logsData] = await Promise.all([
                getDashboardStats(),
                getQueryTrends(period === 'today' ? 1 : period === 'week' ? 7 : period === 'month' ? 30 : 7),
                getQueryLogs({ page: logsPage, page_size: logsPageSize, period })
            ])

            setStats(statsData)
            setTrends(trendsData.trends)
            setLogs(logsData.logs)
            setLogsTotal(logsData.total)
            setLogsTotalPages(logsData.total_pages)
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error)
            toast.error('Failed to load dashboard data')
        } finally {
            setIsLoading(false)
        }
    }, [isAuthenticated, period, logsPage, logsPageSize])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // Real-time updates: listen for query/document events and auto-refresh
    useEffect(() => {
        const handleMetricsUpdate = () => {
            fetchData()
        }

        window.addEventListener('metrics:query-completed', handleMetricsUpdate)
        window.addEventListener('metrics:document-uploaded', handleMetricsUpdate)

        return () => {
            window.removeEventListener('metrics:query-completed', handleMetricsUpdate)
            window.removeEventListener('metrics:document-uploaded', handleMetricsUpdate)
        }
    }, [fetchData])

    const handleExport = async () => {
        try {
            const blob = await exportQueryLogs(period)
            downloadExportedLogs(blob)
            toast.success('Query logs exported successfully')
        } catch (error) {
            console.error('Failed to export logs:', error)
            toast.error('Failed to export query logs')
        }
    }

    const handlePageChange = (newPage: number) => {
        setLogsPage(newPage)
    }

    const formatCost = (cost: number) => {
        return `$${cost.toFixed(4)}`
    }

    const formatTime = (ms: number) => {
        if (ms < 1000) return `${Math.round(ms)}ms`
        return `${(ms / 1000).toFixed(2)}s`
    }

    return (
        <div className="h-full overflow-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Dashboard</h1>
                    <p className="text-muted-foreground">
                        Monitor your usage and analytics
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <Select value={period} onValueChange={(v) => setPeriod(v as PeriodFilter)}>
                        <SelectTrigger className="w-[140px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="today">Today</SelectItem>
                            <SelectItem value="week">This Week</SelectItem>
                            <SelectItem value="month">This Month</SelectItem>
                            <SelectItem value="all">All Time</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
                        <RefreshCwIcon className={`mr-2 size-4 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatsCard
                    title="Queries Today"
                    value={stats?.queries_today ?? 0}
                    icon={ActivityIcon}
                    description="Total queries made today"
                />
                <StatsCard
                    title="Total Documents"
                    value={stats?.total_documents ?? 0}
                    icon={FileTextIcon}
                    description="Documents in the system"
                />
                <StatsCard
                    title="Tokens Used Today"
                    value={(stats?.tokens_used_today ?? 0).toLocaleString()}
                    icon={CoinsIcon}
                    description={`Cost: ${formatCost(stats?.cost_today ?? 0)}`}
                />
                <StatsCard
                    title="Avg Response Time"
                    value={formatTime(stats?.avg_response_time_ms ?? 0)}
                    icon={ClockIcon}
                    description="Average query response time"
                />
            </div>

            {/* Charts Section */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Query Trends Chart */}
                <div className="rounded-xl border border-border bg-card p-6">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <h3 className="font-semibold">Query Trends</h3>
                            <p className="text-sm text-muted-foreground">
                                Queries and tokens over time
                            </p>
                        </div>
                        <TrendingUpIcon className="size-5 text-muted-foreground" />
                    </div>
                    <QueryChart data={trends} isLoading={isLoading} />
                </div>

                {/* Summary Stats */}
                <div className="rounded-xl border border-border bg-card p-6">
                    <div className="mb-4">
                        <h3 className="font-semibold">Usage Summary</h3>
                        <p className="text-sm text-muted-foreground">
                            All-time statistics
                        </p>
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                            <span className="text-muted-foreground">Total Queries</span>
                            <span className="text-2xl font-bold">
                                {(stats?.total_queries ?? 0).toLocaleString()}
                            </span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                            <span className="text-muted-foreground">Total Tokens</span>
                            <span className="text-2xl font-bold">
                                {(stats?.total_tokens ?? 0).toLocaleString()}
                            </span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                            <span className="text-muted-foreground">Total Cost</span>
                            <span className="text-2xl font-bold">
                                {formatCost(stats?.total_cost ?? 0)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Query Logs Table */}
            <div className="rounded-xl border border-border bg-card p-6">
                <div className="mb-4">
                    <h3 className="font-semibold">Recent Query Logs</h3>
                    <p className="text-sm text-muted-foreground">
                        Detailed log of all queries
                    </p>
                </div>
                <QueryLogsTable
                    logs={logs}
                    total={logsTotal}
                    page={logsPage}
                    pageSize={logsPageSize}
                    totalPages={logsTotalPages}
                    isLoading={isLoading}
                    onPageChange={handlePageChange}
                    onExport={handleExport}
                />
            </div>
        </div>
    )
}
