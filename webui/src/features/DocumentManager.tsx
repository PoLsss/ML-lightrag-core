import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/Table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/Select'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card'
import Checkbox from '@/components/ui/Checkbox'
import { ScrollArea } from '@/components/ui/ScrollArea'
import UploadDocumentsDialog from '@/components/documents/UploadDocumentsDialog'
import ClearDocumentsDialog from '@/components/documents/ClearDocumentsDialog'
import DeleteDocumentsDialog from '@/components/documents/DeleteDocumentsDialog'
import PipelineStatusDialog from '@/components/documents/PipelineStatusDialog'
import DocumentViewerModal from '@/components/documents/DocumentViewerModal'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog'

import {
  scanNewDocuments,
  getDocumentsPaginated,
  getDocumentContent,
  DocStatus,
  DocStatusResponse,
  DocumentsRequest,
  PaginationInfo
} from '@/api/lightrag'
import { updateDocumentScope } from '@/api/scope'
import { errorMessage } from '@/lib/utils'
import { toast } from 'sonner'
import { useBackendState, useAuthStore } from '@/stores/state'

import {
  RefreshCwIcon,
  ActivityIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  CheckSquareIcon,
  XIcon,
  AlertTriangle,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileTextIcon,
  Loader2Icon,
  SearchIcon,
  InfoIcon,
  GlobeIcon,
  LockIcon,
  CalendarIcon,
  HashIcon,
  ClockIcon,
  ShieldIcon,
  FileIcon,
  TagIcon
} from 'lucide-react'

type StatusFilter = DocStatus | 'all'
type ScopeFilter = 'all' | 'public' | 'internal'
type SortField = 'created_at' | 'updated_at' | 'id' | 'file_path'
type SortDirection = 'asc' | 'desc'

const getCountValue = (counts: Record<string, number>, ...keys: string[]): number => {
  for (const key of keys) {
    const value = counts[key]
    if (typeof value === 'number') {
      return value
    }
  }
  return 0
}

const getDisplayFileName = (doc: DocStatusResponse, maxLength: number = 20): string => {
  if (!doc.file_path || typeof doc.file_path !== 'string' || doc.file_path.trim() === '') {
    return doc.id
  }
  const parts = doc.file_path.split('/')
  const fileName = parts[parts.length - 1]
  if (!fileName || fileName.trim() === '') {
    return doc.id
  }
  return fileName.length > maxLength ? fileName.slice(0, maxLength) + '...' : fileName
}

const getFullFileName = (doc: DocStatusResponse): string => {
  if (!doc.file_path || typeof doc.file_path !== 'string' || doc.file_path.trim() === '') {
    return doc.id
  }
  const parts = doc.file_path.split('/')
  return parts[parts.length - 1] || doc.id
}

const getStatusBadge = (status: DocStatus) => {
  switch (status) {
    case 'processed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
          Processed
        </span>
      )
    case 'processing':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
          <Loader2Icon className="size-3 animate-spin" />
          Processing
        </span>
      )
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
          Pending
        </span>
      )
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800/50">
          <AlertTriangle className="size-3" />
          Failed
        </span>
      )
    case 'preprocessed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50">
          Preprocessed
        </span>
      )
    default:
      return <span className="text-xs text-muted-foreground">{status}</span>
  }
}

export default function DocumentManager() {
  const isMountedRef = useRef(true)
  const { t } = useTranslation()
  const health = useBackendState.use.health()
  const pipelineBusy = useBackendState.use.pipelineBusy()
  const userRole = useAuthStore((s) => s.userRole)
  const currentUsername = useAuthStore((s) => s.username)

  const currentTab = useSettingsStore.use.currentTab()
  const documentsPageSize = useSettingsStore.use.documentsPageSize()

  const [showPipelineStatus, setShowPipelineStatus] = useState(false)
  const [currentPageDocs, setCurrentPageDocs] = useState<DocStatusResponse[]>([])
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    page_size: documentsPageSize,
    total_count: 0,
    total_pages: 0,
    has_next: false,
    has_prev: false
  })
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({ all: 0 })
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [sortField, setSortField] = useState<SortField>('updated_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])

  // Optimistic documents: shown immediately when files are uploaded, before backend processing completes
  const [optimisticDocs, setOptimisticDocs] = useState<DocStatusResponse[]>([])

  // Document details modal state
  const [detailDoc, setDetailDoc] = useState<DocStatusResponse | null>(null)
  const [detailContent, setDetailContent] = useState<string>('')
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  // Track which doc IDs are currently updating scope
  const [scopeLoadingIds, setScopeLoadingIds] = useState<Set<string>>(new Set())

  // Document viewer modal state
  const [viewerDoc, setViewerDoc] = useState<DocStatusResponse | null>(null)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const fetchDocuments = useCallback(async (page?: number) => {
    try {
      setIsRefreshing(true)
      const request: DocumentsRequest = {
        status_filter: statusFilter === 'all' ? null : statusFilter,
        page: page || pagination.page,
        page_size: pagination.page_size,
        sort_field: sortField,
        sort_direction: sortDirection
      }

      const response = await getDocumentsPaginated(request)

      if (isMountedRef.current) {
        setPagination(response.pagination)
        setCurrentPageDocs(response.documents)
        setStatusCounts(response.status_counts)

        // Remove optimistic entries that now have matching real data
        setOptimisticDocs(prev => {
          if (prev.length === 0) return prev
          const realFileNames = new Set(
            response.documents.map((d: DocStatusResponse) => {
              const parts = d.file_path?.split('/') || []
              return parts[parts.length - 1] || d.id
            })
          )
          return prev.filter(d => {
            const optimisticFileName = d.file_path?.split('/').pop() || d.id
            return !realFileNames.has(optimisticFileName)
          })
        })
      }
    } catch (err) {
      if (isMountedRef.current) {
        toast.error(t('documentPanel.documentManager.errors.loadFailed', { error: errorMessage(err) }))
      }
    } finally {
      if (isMountedRef.current) {
        setIsRefreshing(false)
      }
    }
  }, [statusFilter, pagination.page, pagination.page_size, sortField, sortDirection, t])

  useEffect(() => {
    if (currentTab === 'documents' && health) {
      fetchDocuments()
    }
  }, [currentTab, health, statusFilter, sortField, sortDirection])

  // Check if there are any documents being processed (for adaptive polling)
  const hasActiveDocuments = useMemo(() => {
    return [...optimisticDocs, ...currentPageDocs].some(
      doc => doc.status === 'pending' || doc.status === 'processing' || doc.status === 'preprocessed'
    )
  }, [optimisticDocs, currentPageDocs])

  // Adaptive polling: fast (3s) when processing, slow (30s) otherwise
  useEffect(() => {
    if (currentTab !== 'documents' || !health) return

    const interval = setInterval(() => {
      fetchDocuments()
    }, hasActiveDocuments ? 3000 : 30000)

    return () => clearInterval(interval)
  }, [currentTab, health, fetchDocuments, hasActiveDocuments])

  // Real-time updates: listen for document upload events and auto-refresh
  useEffect(() => {
    const handleDocumentUploaded = () => {
      fetchDocuments()
    }

    window.addEventListener('metrics:document-uploaded', handleDocumentUploaded)

    return () => {
      window.removeEventListener('metrics:document-uploaded', handleDocumentUploaded)
    }
  }, [fetchDocuments])

  // Filtered documents based on search query and scope filter (client-side)
  const filteredDocs = useMemo(() => {
    // Merge optimistic docs (shown at top) with real docs
    let docs = [...optimisticDocs, ...currentPageDocs]

    // Filter by search query (file name or uploader name)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      docs = docs.filter(doc => {
        const fileName = getFullFileName(doc).toLowerCase()
        const uploadedBy = (doc.uploaded_by || 'system').toLowerCase()
        return fileName.includes(query) || uploadedBy.includes(query)
      })
    }

    // Filter by scope
    if (scopeFilter !== 'all') {
      docs = docs.filter(doc => (doc.scope || 'internal') === scopeFilter)
    }

    return docs
  }, [optimisticDocs, currentPageDocs, searchQuery, scopeFilter])

  const handleRefresh = useCallback(() => {
    fetchDocuments()
  }, [fetchDocuments])

  const handleScan = useCallback(async () => {
    try {
      const response = await scanNewDocuments()
      toast.success(response.message)
      fetchDocuments()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }, [fetchDocuments])

  const handleSort = (field: SortField) => {
    const newDirection = sortField === field && sortDirection === 'desc' ? 'asc' : 'desc'
    setSortField(field)
    setSortDirection(newDirection)
    setPagination((prev) => ({ ...prev, page: 1 }))
  }

  const handlePageChange = (newPage: number) => {
    if (newPage === pagination.page) return
    setPagination((prev) => ({ ...prev, page: newPage }))
    fetchDocuments(newPage)
  }

  const handleDocumentSelect = useCallback((docId: string, checked: boolean) => {
    setSelectedDocIds((prev) => {
      if (checked) {
        return [...prev, docId]
      } else {
        return prev.filter((id) => id !== docId)
      }
    })
  }, [])

  const handleDeselectAll = useCallback(() => {
    setSelectedDocIds([])
  }, [])

  const handleSelectCurrentPage = useCallback(() => {
    setSelectedDocIds(filteredDocs.map((doc) => doc.id))
  }, [filteredDocs])

  const handleOpenDetails = useCallback(async (doc: DocStatusResponse) => {
    setDetailDoc(doc)
    setDetailContent('')
    setIsLoadingDetail(true)

    try {
      const response = await getDocumentContent(doc.id)
      if (isMountedRef.current) {
        setDetailContent(response.content || '')
      }
    } catch (err) {
      if (isMountedRef.current) {
        const errMsg = errorMessage(err)
        if (errMsg.includes('404') || errMsg.includes('not found')) {
          toast.error(t('documentPanel.documentManager.errors.documentNotFound', { id: doc.id }))
          fetchDocuments()
        } else {
          toast.error(t('documentPanel.documentManager.errors.loadContentFailed', { error: errMsg }))
        }
        setDetailContent('')
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingDetail(false)
      }
    }
  }, [t, fetchDocuments])

  // Handler called immediately when a file is uploaded (before processing completes)
  const handleFileUploaded = useCallback((fileInfo: { name: string; scope?: string }) => {
    const optimisticDoc: DocStatusResponse = {
      id: `__optimistic_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      content_summary: '',
      content_length: 0,
      status: 'processing' as DocStatus,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      file_path: fileInfo.name,
      scope: (fileInfo.scope as 'public' | 'internal') || 'internal',
      uploaded_by: currentUsername || undefined,
      uploaded_by_role: userRole || undefined,
      chunks_count: 0,
    }
    setOptimisticDocs(prev => [optimisticDoc, ...prev])
    
    // Switch to page 1 to see the new document
    if (pagination.page !== 1) {
      setPagination(prev => ({ ...prev, page: 1 }))
      fetchDocuments(1)
    } else {
      fetchDocuments()
    }
  }, [currentUsername, userRole, pagination.page, fetchDocuments])

  const handleScopeChange = useCallback(async (docId: string, newScope: 'public' | 'internal') => {
    setScopeLoadingIds(prev => new Set(prev).add(docId))
    try {
      await updateDocumentScope(docId, newScope)
      toast.success(`Document scope updated to ${newScope}`)
      await fetchDocuments()
    } catch (error: any) {
      console.error('Failed to update scope:', error)
      toast.error(error.response?.data?.detail || 'Failed to update document scope')
    } finally {
      setScopeLoadingIds(prev => {
        const next = new Set(prev)
        next.delete(docId)
        return next
      })
    }
  }, [fetchDocuments])

  const handleDocumentsDeleted = useCallback(() => {
    setSelectedDocIds([])
    fetchDocuments()
  }, [fetchDocuments])

  const handleDocumentsCleared = useCallback(() => {
    setSelectedDocIds([])
    setStatusCounts({ all: 0 })
    fetchDocuments()
  }, [fetchDocuments])

  const hasDocuments = filteredDocs.length > 0

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-xl">{t('documentPanel.title')}</CardTitle>
          <CardDescription>{t('documentPanel.description')}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <UploadDocumentsDialog onSuccess={handleRefresh} onFileUploaded={handleFileUploaded} />
          <Button variant="outline" size="sm" onClick={handleScan}>
            {t('documentPanel.scanButton')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCwIcon className={cn('size-4', isRefreshing && 'animate-spin')} />
          </Button>
          <Button
            variant={pipelineBusy ? 'destructive' : 'outline'}
            size="sm"
            onClick={() => setShowPipelineStatus(true)}
          >
            <ActivityIcon className="size-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
        {/* Search bar and filter dropdowns */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search bar */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by file name or uploader..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          {/* Scope filter dropdown */}
          <Select value={scopeFilter} onValueChange={(v) => setScopeFilter(v as ScopeFilter)}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue placeholder="Visibility" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Visibility</SelectItem>
              <SelectItem value="public">
                <div className="flex items-center gap-2">
                  <GlobeIcon className="size-3 text-green-500" />
                  Public
                </div>
              </SelectItem>
              <SelectItem value="internal">
                <div className="flex items-center gap-2">
                  <LockIcon className="size-3 text-orange-500" />
                  Internal
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Status filter dropdown */}
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="processed">Processed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex-1" />

          {/* Selection actions */}
          {selectedDocIds.length > 0 ? (
            <>
              <span className="text-sm text-muted-foreground">
                {t('documentPanel.selected', { count: selectedDocIds.length })}
              </span>
              <DeleteDocumentsDialog
                docIds={selectedDocIds}
                onSuccess={handleDocumentsDeleted}
              />
              <Button variant="ghost" size="sm" onClick={handleDeselectAll}>
                <XIcon className="size-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={handleSelectCurrentPage}>
                <CheckSquareIcon className="size-4 mr-1" />
                {t('documentPanel.selectAll')}
              </Button>
              <ClearDocumentsDialog onSuccess={handleDocumentsCleared} />
            </>
          )}
        </div>

        {/* Documents table */}
        <div className="flex-1 border rounded-md overflow-auto">
          {!hasDocuments ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              {searchQuery || scopeFilter !== 'all'
                ? 'No documents match your search criteria.'
                : t('documentPanel.empty')}
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-10 text-center">
                    <Checkbox
                      checked={
                        filteredDocs.length > 0 &&
                        filteredDocs.every(doc => selectedDocIds.includes(doc.id))
                      }
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedDocIds(prev => {
                            const newIds = filteredDocs.map(d => d.id)
                            return [...new Set([...prev, ...newIds])]
                          })
                        } else {
                          const currentIds = new Set(filteredDocs.map(d => d.id))
                          setSelectedDocIds(prev => prev.filter(id => !currentIds.has(id)))
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted min-w-[180px]"
                    onClick={() => handleSort('file_path')}
                  >
                    <div className="flex items-center gap-1">
                      File Name
                      {sortField === 'file_path' && (
                        <span>{sortDirection === 'asc' ? <ArrowUpIcon size={14} /> : <ArrowDownIcon size={14} />}</span>
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="min-w-[130px]">Uploaded By</TableHead>
                  <TableHead className="w-16 text-center">Chunks</TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted min-w-[140px]"
                    onClick={() => handleSort('created_at')}
                  >
                    <div className="flex items-center gap-1">
                      Created
                      {sortField === 'created_at' && (
                        <span>{sortDirection === 'asc' ? <ArrowUpIcon size={14} /> : <ArrowDownIcon size={14} />}</span>
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[130px]">Scope</TableHead>
                  <TableHead className="w-[50px] text-center">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocs.map((doc) => {
                  const isCurrentUser = currentUsername && doc.uploaded_by && doc.uploaded_by === currentUsername
                  const displayName = isCurrentUser
                    ? 'Me'
                    : doc.uploaded_by_display_name || doc.uploaded_by || 'System'
                  const isScopeLoading = scopeLoadingIds.has(doc.id)

                  return (
                  <TableRow key={doc.id} className="hover:bg-muted/30 h-10">
                    {/* Checkbox */}
                    <TableCell className="text-center py-1.5">
                      <Checkbox
                        checked={selectedDocIds.includes(doc.id)}
                        onCheckedChange={(checked) =>
                          handleDocumentSelect(doc.id, checked === true)
                        }
                      />
                    </TableCell>

                    {/* File Name — clickable to open viewer */}
                    <TableCell className="py-1.5">
                      <div className="flex items-center gap-2">
                        <FileTextIcon className="size-3.5 text-muted-foreground shrink-0" />
                        <button
                          type="button"
                          className="text-sm font-medium truncate max-w-[220px] text-left hover:text-primary hover:underline underline-offset-2 cursor-pointer transition-colors"
                          title={`Click to view: ${doc.file_path}`}
                          onClick={() => setViewerDoc(doc)}
                        >
                          {getFullFileName(doc)}
                        </button>
                      </div>
                    </TableCell>

                    {/* Uploaded By - Role badge + Display Name on single line */}
                    <TableCell className="py-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {doc.uploaded_by_role && (
                          <span className={cn(
                            'inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold capitalize shrink-0',
                            doc.uploaded_by_role === 'admin'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                              : doc.uploaded_by_role === 'teacher'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                          )}>
                            {doc.uploaded_by_role}
                          </span>
                        )}
                        <span className={cn(
                          'text-sm truncate max-w-[100px]',
                          isCurrentUser ? 'font-semibold text-primary' : 'text-foreground'
                        )} title={doc.uploaded_by || 'System'}>
                          {displayName}
                        </span>
                      </div>
                    </TableCell>

                    {/* Chunks */}
                    <TableCell className="text-center text-sm py-1.5">
                      {doc.chunks_count ?? '-'}
                    </TableCell>

                    {/* Created - Full date & time with hours:minutes */}
                    <TableCell className="text-sm text-muted-foreground py-1.5">
                      {new Date(doc.created_at).toLocaleDateString('vi-VN', {
                        timeZone: 'Asia/Ho_Chi_Minh',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                      })}{' '}
                      <span className="text-muted-foreground/70">
                        {new Date(doc.created_at).toLocaleTimeString('vi-VN', {
                          timeZone: 'Asia/Ho_Chi_Minh',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </TableCell>

                    {/* Status */}
                    <TableCell className="py-1.5">
                      <div className="flex items-center gap-1">
                        {getStatusBadge(doc.status)}
                        {doc.error_msg && (
                          <AlertTriangle
                            className="size-3.5 text-yellow-500 cursor-help"
                            title={doc.error_msg}
                          />
                        )}
                      </div>
                    </TableCell>

                    {/* Scope dropdown with loading spinner */}
                    <TableCell className="py-1.5">
                      {isScopeLoading ? (
                        <div className="flex items-center gap-1.5 h-7 px-2">
                          <Loader2Icon className="size-3.5 animate-spin text-primary" />
                          <span className="text-xs text-muted-foreground">Updating...</span>
                        </div>
                      ) : userRole === 'admin' || userRole === 'teacher' ? (
                        <Select
                          value={doc.scope || 'internal'}
                          onValueChange={(value) =>
                            handleScopeChange(doc.id, value as 'internal' | 'public')
                          }
                        >
                          <SelectTrigger className="h-7 w-[110px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="public">
                              <div className="flex items-center gap-1.5">
                                <GlobeIcon className="size-3 text-green-500" />
                                Public
                              </div>
                            </SelectItem>
                            <SelectItem value="internal">
                              <div className="flex items-center gap-1.5">
                                <LockIcon className="size-3 text-orange-500" />
                                Internal
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="flex items-center gap-1.5 text-sm">
                          {(doc.scope || 'internal') === 'public' ? (
                            <>
                              <GlobeIcon className="size-3 text-green-500" />
                              <span>Public</span>
                            </>
                          ) : (
                            <>
                              <LockIcon className="size-3 text-orange-500" />
                              <span>Internal</span>
                            </>
                          )}
                        </div>
                      )}
                    </TableCell>

                    {/* Details icon */}
                    <TableCell className="text-center py-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDetails(doc)}
                        className="h-6 w-6 p-0"
                        title="View document details"
                      >
                        <InfoIcon className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination */}
        {pagination.total_pages > 1 && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {t('documentPanel.pagination.showing', {
                start: (pagination.page - 1) * pagination.page_size + 1,
                end: Math.min(pagination.page * pagination.page_size, pagination.total_count),
                total: pagination.total_count
              })}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={!pagination.has_prev}
              >
                <ChevronLeftIcon className="size-4" />
              </Button>
              <span className="text-sm">
                {pagination.page} / {pagination.total_pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={!pagination.has_next}
              >
                <ChevronRightIcon className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Pipeline Status Dialog */}
      <PipelineStatusDialog
        open={showPipelineStatus}
        onOpenChange={setShowPipelineStatus}
      />

      {/* Document Viewer Modal — full-screen file viewer */}
      <DocumentViewerModal
        doc={viewerDoc}
        open={!!viewerDoc}
        onOpenChange={(open) => { if (!open) setViewerDoc(null) }}
      />

      {/* Document Details Modal - Redesigned */}
      <Dialog open={!!detailDoc} onOpenChange={(open) => !open && setDetailDoc(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col border-border/60 shadow-2xl">
          <DialogHeader className="pb-3 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <div className="flex items-center justify-center size-8 rounded-lg bg-primary/10">
                <FileTextIcon className="size-4 text-primary" />
              </div>
              <div className="min-w-0">
                <span className="truncate block">{detailDoc ? getFullFileName(detailDoc) : ''}</span>
              </div>
            </DialogTitle>
          </DialogHeader>

          {detailDoc && (() => {
            const isCurrentUserDetail = currentUsername && detailDoc.uploaded_by && detailDoc.uploaded_by === currentUsername
            const detailDisplayName = isCurrentUserDetail
              ? 'Me'
              : detailDoc.uploaded_by_display_name || detailDoc.uploaded_by || 'System'

            return (
            <div className="flex-1 overflow-auto space-y-5 pr-1">
              {/* Key Info Cards Row */}
              <div className="grid grid-cols-3 gap-3">
                {/* Status Card */}
                <div className="rounded-lg border bg-card p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    <TagIcon className="size-3" />
                    Status
                  </div>
                  <div>{getStatusBadge(detailDoc.status)}</div>
                </div>

                {/* Scope Card */}
                <div className="rounded-lg border bg-card p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    <ShieldIcon className="size-3" />
                    Scope
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(detailDoc.scope || 'internal') === 'public' ? (
                      <>
                        <GlobeIcon className="size-3.5 text-green-500" />
                        <span className="text-sm font-semibold text-green-700 dark:text-green-300">Public</span>
                      </>
                    ) : (
                      <>
                        <LockIcon className="size-3.5 text-orange-500" />
                        <span className="text-sm font-semibold text-orange-700 dark:text-orange-300">Internal</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Chunks Card */}
                <div className="rounded-lg border bg-card p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    <HashIcon className="size-3" />
                    Chunks
                  </div>
                  <p className="text-lg font-bold">{detailDoc.chunks_count ?? '-'}</p>
                </div>
              </div>

              {/* Document Information Section */}
              <div className="rounded-lg border bg-card">
                <div className="px-4 py-2.5 border-b bg-muted/30">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <FileIcon className="size-3" />
                    Document Information
                  </h3>
                </div>
                <div className="p-4 space-y-3">
                  {/* File Path */}
                  {detailDoc.file_path && (
                    <div className="flex items-start gap-3">
                      <span className="text-xs font-medium text-muted-foreground w-24 shrink-0 pt-0.5">File Path</span>
                      <span className="text-sm break-all text-foreground">{detailDoc.file_path}</span>
                    </div>
                  )}
                  {/* Document ID */}
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-medium text-muted-foreground w-24 shrink-0 pt-0.5">Document ID</span>
                    <code className="text-xs font-mono text-muted-foreground break-all bg-muted/50 px-1.5 py-0.5 rounded">{detailDoc.id}</code>
                  </div>
                  {/* Content Length */}
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-medium text-muted-foreground w-24 shrink-0 pt-0.5">Content Size</span>
                    <span className="text-sm">{detailDoc.content_length?.toLocaleString() ?? '-'} characters</span>
                  </div>
                  {/* Content Summary */}
                  {detailDoc.content_summary && (
                    <div className="flex items-start gap-3">
                      <span className="text-xs font-medium text-muted-foreground w-24 shrink-0 pt-0.5">Summary</span>
                      <span className="text-sm text-muted-foreground leading-relaxed">{detailDoc.content_summary}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Uploader & Timestamps Section */}
              <div className="grid grid-cols-2 gap-3">
                {/* Uploader Info */}
                <div className="rounded-lg border bg-card">
                  <div className="px-4 py-2.5 border-b bg-muted/30">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Uploaded By</h3>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2">
                      {detailDoc.uploaded_by_role && (
                        <span className={cn(
                          'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize',
                          detailDoc.uploaded_by_role === 'admin'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                            : detailDoc.uploaded_by_role === 'teacher'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                              : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                        )}>
                          {detailDoc.uploaded_by_role}
                        </span>
                      )}
                      <span className={cn(
                        'text-sm font-medium',
                        isCurrentUserDetail ? 'text-primary font-semibold' : ''
                      )}>
                        {detailDisplayName}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Timestamps */}
                <div className="rounded-lg border bg-card">
                  <div className="px-4 py-2.5 border-b bg-muted/30">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <ClockIcon className="size-3" />
                      Timestamps
                    </h3>
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Created</span>
                      <span className="text-sm font-medium">
                        {new Date(detailDoc.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Updated</span>
                      <span className="text-sm font-medium">
                        {new Date(detailDoc.updated_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {detailDoc.error_msg && (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10">
                  <div className="px-4 py-2.5 border-b border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
                    <h3 className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="size-3" />
                      Error
                    </h3>
                  </div>
                  <div className="p-4">
                    <p className="text-sm text-red-700 dark:text-red-300">{detailDoc.error_msg}</p>
                  </div>
                </div>
              )}

              {/* Metadata */}
              {detailDoc.metadata && Object.keys(detailDoc.metadata).length > 0 && (
                <div className="rounded-lg border bg-card">
                  <div className="px-4 py-2.5 border-b bg-muted/30">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Metadata</h3>
                  </div>
                  <div className="p-4">
                    <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/30 p-3 rounded-md border">
                      {JSON.stringify(detailDoc.metadata, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Content Preview */}
              <div className="rounded-lg border bg-card">
                <div className="px-4 py-2.5 border-b bg-muted/30">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Content Preview</h3>
                </div>
                <ScrollArea className="h-48">
                  <div className="p-4">
                    {isLoadingDetail ? (
                      <div className="flex items-center justify-center h-24">
                        <Loader2Icon className="size-5 animate-spin text-primary" />
                        <span className="ml-2 text-sm text-muted-foreground">Loading content...</span>
                      </div>
                    ) : detailContent ? (
                      <pre className="whitespace-pre-wrap text-xs font-mono leading-relaxed text-foreground/80">
                        {detailContent}
                      </pre>
                    ) : (
                      <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                        No content available
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
