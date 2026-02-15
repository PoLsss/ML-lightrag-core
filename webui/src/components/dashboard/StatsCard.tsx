import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface StatsCardProps {
    title: string
    value: string | number
    icon: LucideIcon
    description?: string
    trend?: {
        value: number
        isPositive: boolean
    }
    className?: string
}

export default function StatsCard({
    title,
    value,
    icon: Icon,
    description,
    trend,
    className
}: StatsCardProps) {
    return (
        <div
            className={cn(
                'relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md',
                className
            )}
        >
            <div className="flex items-start justify-between">
                <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">{title}</p>
                    <p className="text-3xl font-bold tracking-tight">{value}</p>
                    {description && (
                        <p className="text-xs text-muted-foreground">{description}</p>
                    )}
                    {trend && (
                        <div className="flex items-center gap-1 text-xs">
                            <span
                                className={cn(
                                    'font-medium',
                                    trend.isPositive ? 'text-green-600' : 'text-red-600'
                                )}
                            >
                                {trend.isPositive ? '+' : '-'}{Math.abs(trend.value)}%
                            </span>
                            <span className="text-muted-foreground">vs last period</span>
                        </div>
                    )}
                </div>
                <div className="rounded-lg bg-primary/10 p-3">
                    <Icon className="size-6 text-primary" />
                </div>
            </div>
            {/* Decorative gradient */}
            <div className="absolute -bottom-4 -right-4 size-24 rounded-full bg-gradient-to-br from-primary/5 to-primary/20 blur-2xl" />
        </div>
    )
}
