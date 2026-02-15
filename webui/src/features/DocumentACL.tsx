/**
 * Document ACL Management Component
 * Allows admins to manage document access permissions
 */

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import {
    FileTextIcon,
    RefreshCwIcon,
    GlobeIcon,
    LockIcon,
    SearchIcon
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/Select'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/Table'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { getDocumentACLs, updateDocumentACL, DocumentACL } from '@/api/acl'
import { useAuthStore } from '@/stores/state'
import { cn } from '@/lib/utils'

export default function DocumentACLManager() {
    const { isAuthenticated, userRole } = useAuthStore()
    const [isLoading, setIsLoading] = useState(true)
    const [documents, setDocuments] = useState<DocumentACL[]>([])
    const [filteredDocuments, setFilteredDocuments] = useState<DocumentACL[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [filterScope, setFilterScope] = useState<'all' | 'internal' | 'public'>('all')

    const fetchDocuments = useCallback(async () => {
        if (!isAuthenticated || userRole !== 'admin') {
            setIsLoading(false)
            return
        }

        setIsLoading(true)
        try {
            const data = await getDocumentACLs()
            setDocuments(data.documents)
            setFilteredDocuments(data.documents)
        } catch (error) {
            console.error('Failed to fetch document ACLs:', error)
            toast.error('Không thể tải danh sách quyền truy cập tài liệu')
        } finally {
            setIsLoading(false)
        }
    }, [isAuthenticated, userRole])

    useEffect(() => {
        fetchDocuments()
    }, [fetchDocuments])

    // Filter documents based on search and scope
    useEffect(() => {
        let filtered = documents

        // Filter by search query
        if (searchQuery) {
            const query = searchQuery.toLowerCase()
            filtered = filtered.filter(doc =>
                doc.file_path.toLowerCase().includes(query) ||
                doc.doc_id.toLowerCase().includes(query)
            )
        }

        // Filter by access scope
        if (filterScope !== 'all') {
            filtered = filtered.filter(doc => doc.access_scope === filterScope)
        }

        setFilteredDocuments(filtered)
    }, [documents, searchQuery, filterScope])

    const handleUpdateACL = async (docId: string, newScope: 'internal' | 'public') => {
        try {
            await updateDocumentACL(docId, newScope)
            toast.success(`Đã cập nhật quyền truy cập thành ${newScope === 'public' ? 'Công khai' : 'Nội bộ'}`)

            // Refresh the list
            fetchDocuments()
        } catch (error) {
            console.error('Failed to update ACL:', error)
            toast.error('Không thể cập nhật quyền truy cập')
        }
    }

    const getAccessScopeLabel = (scope: string) => {
        return scope === 'public' ? 'Công khai' : 'Nội bộ'
    }

    const getAccessScopeIcon = (scope: string) => {
        return scope === 'public' ? (
            <GlobeIcon className="size-4 text-green-500" />
        ) : (
            <LockIcon className="size-4 text-orange-500" />
        )
    }

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-'
        const date = new Date(dateStr)
        return date.toLocaleDateString('vi-VN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    if (!isAuthenticated || userRole !== 'admin') {
        return (
            <Card>
                <CardContent className="py-8 text-center">
                    <LockIcon className="mx-auto size-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                        Bạn không có quyền truy cập tính năng này
                    </p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <FileTextIcon className="size-5" />
                            Quản lý Quyền Truy cập Tài liệu
                        </CardTitle>
                        <CardDescription>
                            Quản lý quyền truy cập các tài liệu trong hệ thống. Tài liệu "Nội bộ" chỉ Admin và Giáo viên được xem.
                        </CardDescription>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchDocuments}
                        disabled={isLoading}
                    >
                        <RefreshCwIcon className={cn("size-4 mr-2", isLoading && "animate-spin")} />
                        Làm mới
                    </Button>
                </div>
            </CardHeader>

            <CardContent>
                {/* Filters */}
                <div className="flex items-center gap-4 mb-6">
                    <div className="relative flex-1 max-w-sm">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                            placeholder="Tìm kiếm tài liệu..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    <Select
                        value={filterScope}
                        onValueChange={(value) => setFilterScope(value as 'all' | 'internal' | 'public')}
                    >
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Lọc theo quyền" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Tất cả</SelectItem>
                            <SelectItem value="public">Công khai</SelectItem>
                            <SelectItem value="internal">Nội bộ</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="p-4 rounded-lg bg-muted/50">
                        <div className="text-2xl font-bold">{documents.length}</div>
                        <div className="text-sm text-muted-foreground">Tổng số tài liệu</div>
                    </div>
                    <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20">
                        <div className="text-2xl font-bold text-green-600">
                            {documents.filter(d => d.access_scope === 'public').length}
                        </div>
                        <div className="text-sm text-muted-foreground">Công khai</div>
                    </div>
                    <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-900/20">
                        <div className="text-2xl font-bold text-orange-600">
                            {documents.filter(d => d.access_scope === 'internal').length}
                        </div>
                        <div className="text-sm text-muted-foreground">Nội bộ</div>
                    </div>
                </div>

                {/* Table */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <RefreshCwIcon className="size-6 animate-spin text-muted-foreground" />
                    </div>
                ) : filteredDocuments.length === 0 ? (
                    <div className="text-center py-12">
                        <FileTextIcon className="mx-auto size-12 text-muted-foreground mb-4" />
                        <p className="text-muted-foreground">
                            {documents.length === 0
                                ? 'Chưa có tài liệu nào được thiết lập quyền truy cập'
                                : 'Không tìm thấy tài liệu phù hợp'}
                        </p>
                    </div>
                ) : (
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[300px]">Tên tài liệu</TableHead>
                                    <TableHead className="w-[150px]">Quyền truy cập</TableHead>
                                    <TableHead>Người tạo</TableHead>
                                    <TableHead>Cập nhật lần cuối</TableHead>
                                    <TableHead className="text-right">Thao tác</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredDocuments.map((doc) => (
                                    <TableRow key={doc.doc_id}>
                                        <TableCell>
                                            <div className="font-medium truncate max-w-[280px]" title={doc.file_path}>
                                                {doc.file_path || doc.doc_id}
                                            </div>
                                            <div className="text-xs text-muted-foreground truncate max-w-[280px]">
                                                ID: {doc.doc_id}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {getAccessScopeIcon(doc.access_scope)}
                                                <span className={cn(
                                                    "px-2 py-1 rounded-full text-xs font-medium",
                                                    doc.access_scope === 'public'
                                                        ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                                                        : "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                                                )}>
                                                    {getAccessScopeLabel(doc.access_scope)}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm">{doc.created_by}</span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm text-muted-foreground">
                                                {formatDate(doc.updated_at)}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Select
                                                value={doc.access_scope}
                                                onValueChange={(value) =>
                                                    handleUpdateACL(doc.doc_id, value as 'internal' | 'public')
                                                }
                                            >
                                                <SelectTrigger className="w-[130px]">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="public">
                                                        <div className="flex items-center gap-2">
                                                            <GlobeIcon className="size-4 text-green-500" />
                                                            Công khai
                                                        </div>
                                                    </SelectItem>
                                                    <SelectItem value="internal">
                                                        <div className="flex items-center gap-2">
                                                            <LockIcon className="size-4 text-orange-500" />
                                                            Nội bộ
                                                        </div>
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
