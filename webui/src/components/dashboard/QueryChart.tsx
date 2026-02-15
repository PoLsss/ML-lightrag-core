import { useMemo } from 'react'
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

interface QueryChartProps {
    data: QueryTrendEntry[]
    isLoading?: boolean
}

export default function QueryChart({ data, isLoading }: QueryChartProps) {
    const chartData = useMemo(() => {
        return data.map(entry => ({
            date: new Date(entry.date).toLocaleDateString('vi-VN', {
                month: 'short',
                day: 'numeric'
            }),
            queries: entry.count,
            tokens: Math.round(entry.tokens / 1000), // Convert to thousands
            cost: entry.cost
        }))
    }, [data])

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
                No data available
            </div>
        )
    }

    return (
        <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                    />
                    <YAxis
                        yAxisId="left"
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                    />
                    <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                        labelStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Legend />
                    <Bar
                        yAxisId="left"
                        dataKey="queries"
                        name="Queries"
                        fill="hsl(var(--primary))"
                        radius={[4, 4, 0, 0]}
                    />
                    <Bar
                        yAxisId="right"
                        dataKey="tokens"
                        name="Tokens (K)"
                        fill="hsl(var(--chart-2))"
                        radius={[4, 4, 0, 0]}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}
