import { useState } from 'react'
import { DownloadIcon, SearchIcon } from 'lucide-react'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/Table'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { QueryLogEntry } from '@/api/dashboard'
import { cn } from '@/lib/utils'

interface QueryLogsTableProps {
    logs: QueryLogEntry[]
    total: number
    page: number
    pageSize: number
    totalPages: number
    isLoading?: boolean
    onPageChange: (page: number) => void
    onExport: () => void
}

export default function QueryLogsTable({
    logs,
    total,
    page,
    pageSize,
    totalPages,
    isLoading,
    onPageChange,
    onExport
}: QueryLogsTableProps) {
    const [searchTerm, setSearchTerm] = useState('')

    const filteredLogs = logs.filter(log =>
        log.query_text.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user_email.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const getQueryModeBadgeClass = (mode: string) => {
        switch (mode.toLowerCase()) {
            case 'local':
                return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
            case 'global':
                return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
            case 'hybrid':
                return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
            case 'naive':
                return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
            default:
                return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
        }
    }

    const formatTimestamp = (timestamp: string) => {
        return new Date(timestamp).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    }

    const formatDuration = (ms: number) => {
        if (ms < 1000) return `${ms}ms`
        return `${(ms / 1000).toFixed(2)}s`
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                    <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search queries..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <Button variant="outline" size="sm" onClick={onExport}>
                    <DownloadIcon className="mr-2 size-4" />
                    Export CSV
                </Button>
            </div>

            {/* Table */}
            <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead className="w-[180px]">User</TableHead>
                            <TableHead className="w-[100px]">Mode</TableHead>
                            <TableHead>Query</TableHead>
                            <TableHead className="w-[100px] text-right">Time</TableHead>
                            <TableHead className="w-[100px] text-right">Tokens</TableHead>
                            <TableHead className="w-[160px]">Timestamp</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    <div className="flex items-center justify-center">
                                        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                        <span className="ml-2">Loading...</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : filteredLogs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                    No query logs found
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredLogs.map((log, index) => (
                                <TableRow key={index} className="hover:bg-muted/30">
                                    <TableCell className="font-mono text-sm">
                                        <div className="truncate max-w-[180px]" title={log.user_email}>
                                            {log.user_email}
                                        </div>
                                        <div className="text-xs text-muted-foreground">{log.user_role}</div>
                                    </TableCell>
                                    <TableCell>
                                        <span className={cn('px-2 py-1 rounded-full text-xs font-medium', getQueryModeBadgeClass(log.query_mode))}>
                                            {log.query_mode}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <div className="max-w-[300px] truncate" title={log.query_text}>
                                            {log.query_text}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-sm">
                                        {formatDuration(log.execution_time_ms)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-sm">
                                        {log.tokens_used?.toLocaleString() || '-'}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {formatTimestamp(log.timestamp)}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, total)} of {total} entries
                </p>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onPageChange(page - 1)}
                        disabled={page <= 1}
                    >
                        Previous
                    </Button>
                    <span className="text-sm">
                        Page {page} of {totalPages}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onPageChange(page + 1)}
                        disabled={page >= totalPages}
                    >
                        Next
                    </Button>
                </div>
            </div>
        </div>
    )
}
