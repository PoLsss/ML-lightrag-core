import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts'
import { QueryTrendEntry } from '@/api/dashboard'

type QueryTooltipProps = {
    active?: boolean
    label?: string
    payload?: Array<{
        color?: string
        dataKey?: string | number
        name?: string
        value?: number | string
        payload?: {
            cost?: number
        }
    }>
}

interface QueryChartProps {
    data: QueryTrendEntry[]
    isLoading?: boolean
}

function QueryChartTooltip({ active, label, payload }: QueryTooltipProps) {
    const { t } = useTranslation()

    if (!active || !payload || payload.length === 0) {
        return null
    }

    const cost = payload[0]?.payload?.cost ?? 0

    return (
        <div
            className="min-w-[220px] rounded-xl border-2 px-4 py-3 shadow-2xl backdrop-blur-md"
            style={{
                background: 'color-mix(in srgb, var(--popover) 92%, var(--foreground) 8%)',
                borderColor: 'color-mix(in srgb, var(--border) 50%, var(--primary) 50%)',
                color: 'var(--popover-foreground)',
                boxShadow: '0 8px 32px -4px color-mix(in srgb, var(--primary) 25%, transparent)'
            }}
        >
            <div className="mb-3 flex items-center justify-between gap-3 border-b pb-2" style={{ borderColor: 'color-mix(in srgb, var(--border) 80%, transparent)' }}>
                <span className="text-xs font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>
                    {t('dashboard.queryTrends')}
                </span>
                <span className="text-sm font-semibold">{label}</span>
            </div>

            <div className="space-y-2.5">
                {payload.map((entry) => (
                    <div key={String(entry.dataKey)} className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <span
                                className="size-2.5 rounded-full"
                                style={{ backgroundColor: entry.color ?? 'var(--chart-1)' }}
                            />
                            <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                                {entry.name}
                            </span>
                        </div>
                        <span className="text-sm font-semibold">
                            {typeof entry.value === 'number' ? entry.value.toLocaleString('en-US') : entry.value}
                        </span>
                    </div>
                ))}

                <div className="mt-3 flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'color-mix(in srgb, var(--muted) 72%, transparent)' }}>
                    <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                        {t('dashboard.costLabel')}
                    </span>
                    <span className="text-sm font-semibold">${cost.toFixed(2)}</span>
                </div>
            </div>
        </div>
    )
}

export default function QueryChart({ data, isLoading }: QueryChartProps) {
    const { t, i18n } = useTranslation()

    const chartData = useMemo(() => {
        const locale = i18n.language === 'zh' ? 'vi-VN' : 'en-US'

        return data.map(entry => ({
            date: new Date(entry.date).toLocaleDateString(locale, {
                month: 'short',
                day: 'numeric'
            }),
            queries: entry.count,
            tokens: Math.round(entry.tokens / 1000), // Convert to thousands
            cost: entry.cost
        }))
    }, [data, i18n.language])

    if (isLoading) {
        return (
            <div className="flex h-[300px] items-center justify-center">
                <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        )
    }

    if (data.length === 0) {
        return (
            <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                {t('dashboard.noData')}
            </div>
        )
    }

    return (
        <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <defs>
                        <linearGradient id="queriesGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.55} />
                        </linearGradient>
                        <linearGradient id="tokensGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.55} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
                    <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                        axisLine={{ stroke: 'var(--border)' }}
                        tickLine={false}
                    />
                    <YAxis
                        yAxisId="left"
                        tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip
                        content={<QueryChartTooltip />}
                        cursor={{ fill: 'var(--muted)', opacity: 0.22 }}
                    />
                    <Legend
                        wrapperStyle={{ color: 'var(--muted-foreground)', fontSize: 12, paddingTop: 8 }}
                        iconType="circle"
                    />
                    <Bar
                        yAxisId="left"
                        dataKey="queries"
                        name={t('dashboard.queriesLabel')}
                        fill="url(#queriesGradient)"
                        radius={[8, 8, 0, 0]}
                        maxBarSize={48}
                    />
                    <Bar
                        yAxisId="right"
                        dataKey="tokens"
                        name={t('dashboard.tokensLabel')}
                        fill="url(#tokensGradient)"
                        radius={[8, 8, 0, 0]}
                        maxBarSize={48}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}
