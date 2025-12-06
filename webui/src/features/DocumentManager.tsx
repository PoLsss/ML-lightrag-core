import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/Table'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card'
import Checkbox from '@/components/ui/Checkbox'
import { ScrollArea } from '@/components/ui/ScrollArea'
import UploadDocumentsDialog from '@/components/documents/UploadDocumentsDialog'
import ClearDocumentsDialog from '@/components/documents/ClearDocumentsDialog'
import DeleteDocumentsDialog from '@/components/documents/DeleteDocumentsDialog'
import PipelineStatusDialog from '@/components/documents/PipelineStatusDialog'

import {
  scanNewDocuments,
  getDocumentsPaginated,
  getDocumentContent,
  DocStatus,
  DocStatusResponse,
  DocumentsRequest,
  PaginationInfo
} from '@/api/lightrag'
import { errorMessage } from '@/lib/utils'
import { toast } from 'sonner'
import { useBackendState } from '@/stores/state'

import {
  RefreshCwIcon,
  ActivityIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  CheckSquareIcon,
  XIcon,
  AlertTriangle,
  Info,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileTextIcon,
  Loader2Icon
} from 'lucide-react'

type StatusFilter = DocStatus | 'all'
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

export default function DocumentManager() {
  const isMountedRef = useRef(true)
  const { t } = useTranslation()
  const health = useBackendState.use.health()
  const pipelineBusy = useBackendState.use.pipelineBusy()

  const currentTab = useSettingsStore.use.currentTab()
  const showFileName = useSettingsStore.use.showFileName()
  const setShowFileName = useSettingsStore.use.setShowFileName()
  const documentsPageSize = useSettingsStore.use.documentsPageSize()
  const setDocumentsPageSize = useSettingsStore.use.setDocumentsPageSize()

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
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])

  // Document content preview state
  const [viewingDoc, setViewingDoc] = useState<DocStatusResponse | null>(null)
  const [docContent, setDocContent] = useState<string>('')
  const [isLoadingContent, setIsLoadingContent] = useState(false)

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

  useEffect(() => {
    if (currentTab !== 'documents' || !health) return

    const interval = setInterval(() => {
      fetchDocuments()
    }, 30000)

    return () => clearInterval(interval)
  }, [currentTab, health, fetchDocuments])

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
    let actualField = field
    if (field === 'id') {
      actualField = showFileName ? 'file_path' : 'id'
    }
    const newDirection = sortField === actualField && sortDirection === 'desc' ? 'asc' : 'desc'
    setSortField(actualField)
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
    setSelectedDocIds(currentPageDocs.map((doc) => doc.id))
  }, [currentPageDocs])

  const handleViewDocument = useCallback(async (doc: DocStatusResponse) => {
    if (viewingDoc?.id === doc.id) {
      // Toggle off if clicking the same document
      setViewingDoc(null)
      setDocContent('')
      return
    }

    setViewingDoc(doc)
    setDocContent('')
    setIsLoadingContent(true)

    try {
      const response = await getDocumentContent(doc.id)
      if (isMountedRef.current) {
        setDocContent(response.content || '')
      }
    } catch (err) {
      if (isMountedRef.current) {
        const errMsg = errorMessage(err)
        // Check if it's a 404 error (document not found)
        if (errMsg.includes('404') || errMsg.includes('not found')) {
          toast.error(t('documentPanel.documentManager.errors.documentNotFound', { id: doc.id }))
          // Refresh the document list to sync with backend
          fetchDocuments()
        } else {
          toast.error(t('documentPanel.documentManager.errors.loadContentFailed', { error: errMsg }))
        }
        setDocContent('')
        setViewingDoc(null)
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingContent(false)
      }
    }
  }, [viewingDoc, t, fetchDocuments])

  const handleCloseContentPreview = useCallback(() => {
    setViewingDoc(null)
    setDocContent('')
  }, [])

  const handleDocumentsDeleted = useCallback(() => {
    setSelectedDocIds([])
    fetchDocuments()
  }, [fetchDocuments])

  const handleDocumentsCleared = useCallback(() => {
    setSelectedDocIds([])
    setStatusCounts({ all: 0 })
    fetchDocuments()
  }, [fetchDocuments])

  const processedCount = getCountValue(statusCounts, 'PROCESSED', 'processed')
  const processingCount = getCountValue(statusCounts, 'PROCESSING', 'processing')
  const pendingCount = getCountValue(statusCounts, 'PENDING', 'pending')
  const failedCount = getCountValue(statusCounts, 'FAILED', 'failed')

  const hasDocuments = currentPageDocs.length > 0

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-xl">{t('documentPanel.title')}</CardTitle>
          <CardDescription>{t('documentPanel.description')}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <UploadDocumentsDialog onSuccess={handleRefresh} />
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
        {/* Status filter buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={statusFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('all')}
          >
            {t('documentPanel.filters.all')} ({pagination.total_count})
          </Button>
          <Button
            variant={statusFilter === 'processed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('processed')}
          >
            {t('documentPanel.filters.processed')} ({processedCount})
          </Button>
          <Button
            variant={statusFilter === 'processing' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('processing')}
          >
            {t('documentPanel.filters.processing')} ({processingCount})
          </Button>
          <Button
            variant={statusFilter === 'pending' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('pending')}
          >
            {t('documentPanel.filters.pending')} ({pendingCount})
          </Button>
          <Button
            variant={statusFilter === 'failed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('failed')}
          >
            {t('documentPanel.filters.failed')} ({failedCount})
          </Button>

          <div className="flex-1" />

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

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFileName(!showFileName)}
          >
            {showFileName ? t('documentPanel.showId') : t('documentPanel.showFileName')}
          </Button>
        </div>

        {/* Documents table */}
        <div className="flex-1 border rounded-md overflow-auto">
          {!hasDocuments ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              {t('documentPanel.empty')}
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead
                    className="cursor-pointer hover:bg-muted"
                    onClick={() => handleSort('id')}
                  >
                    <div className="flex items-center">
                      {showFileName
                        ? t('documentPanel.columns.fileName')
                        : t('documentPanel.columns.id')}
                      {(sortField === 'id' || sortField === 'file_path') && (
                        <span className="ml-1">
                          {sortDirection === 'asc' ? (
                            <ArrowUpIcon size={14} />
                          ) : (
                            <ArrowDownIcon size={14} />
                          )}
                        </span>
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="w-16 text-center">
                    {t('documentPanel.columns.view')}
                  </TableHead>
                  <TableHead>{t('documentPanel.columns.status')}</TableHead>
                  <TableHead>{t('documentPanel.columns.length')}</TableHead>
                  <TableHead>{t('documentPanel.columns.chunks')}</TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted"
                    onClick={() => handleSort('created_at')}
                  >
                    <div className="flex items-center">
                      {t('documentPanel.columns.created')}
                      {sortField === 'created_at' && (
                        <span className="ml-1">
                          {sortDirection === 'asc' ? (
                            <ArrowUpIcon size={14} />
                          ) : (
                            <ArrowDownIcon size={14} />
                          )}
                        </span>
                      )}
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted"
                    onClick={() => handleSort('updated_at')}
                  >
                    <div className="flex items-center">
                      {t('documentPanel.columns.updated')}
                      {sortField === 'updated_at' && (
                        <span className="ml-1">
                          {sortDirection === 'asc' ? (
                            <ArrowUpIcon size={14} />
                          ) : (
                            <ArrowDownIcon size={14} />
                          )}
                        </span>
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="w-16 text-center">
                    {t('documentPanel.columns.select')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentPageDocs.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-mono max-w-[200px]">
                      <div className="truncate" title={doc.file_path}>
                        {showFileName ? getDisplayFileName(doc, 30) : doc.id}
                      </div>
                      {showFileName && (
                        <div className="text-xs text-muted-foreground truncate">
                          {doc.id}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant={viewingDoc?.id === doc.id ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => handleViewDocument(doc)}
                        className="h-7 w-7 p-0"
                      >
                        <FileTextIcon className="size-4" />
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {doc.status === 'processed' && (
                          <span className="text-green-600">
                            {t('documentPanel.status.completed')}
                          </span>
                        )}
                        {doc.status === 'preprocessed' && (
                          <span className="text-purple-600">
                            {t('documentPanel.status.preprocessed')}
                          </span>
                        )}
                        {doc.status === 'processing' && (
                          <span className="text-blue-600">
                            {t('documentPanel.status.processing')}
                          </span>
                        )}
                        {doc.status === 'pending' && (
                          <span className="text-yellow-600">
                            {t('documentPanel.status.pending')}
                          </span>
                        )}
                        {doc.status === 'failed' && (
                          <span className="text-red-600">
                            {t('documentPanel.status.failed')}
                          </span>
                        )}
                        {doc.error_msg && (
                          <AlertTriangle
                            className="size-4 text-yellow-500"
                            title={doc.error_msg}
                          />
                        )}
                        {doc.metadata && Object.keys(doc.metadata).length > 0 && (
                          <Info className="size-4 text-blue-500" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{doc.content_length ?? '-'}</TableCell>
                    <TableCell>{doc.chunks_count ?? '-'}</TableCell>
                    <TableCell className="text-sm">
                      {new Date(doc.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(doc.updated_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={selectedDocIds.includes(doc.id)}
                        onCheckedChange={(checked) =>
                          handleDocumentSelect(doc.id, checked === true)
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Document Content Preview */}
        {viewingDoc && (
          <div className="border rounded-md bg-muted/30">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50">
              <div className="flex items-center gap-2">
                <FileTextIcon className="size-4 text-emerald-600" />
                <span className="font-medium text-sm truncate max-w-[300px]">
                  {showFileName ? getDisplayFileName(viewingDoc, 50) : viewingDoc.id}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({viewingDoc.content_length?.toLocaleString() ?? 0} characters)
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCloseContentPreview}
                className="h-6 w-6 p-0"
              >
                <XIcon className="size-4" />
              </Button>
            </div>
            <ScrollArea className="h-64">
              <div className="p-4">
                {isLoadingContent ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2Icon className="size-6 animate-spin text-emerald-600" />
                    <span className="ml-2 text-muted-foreground">
                      {t('documentPanel.loadingContent')}
                    </span>
                  </div>
                ) : docContent ? (
                  <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed">
                    {docContent}
                  </pre>
                ) : (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">
                    {t('documentPanel.noContent')}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

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

      <PipelineStatusDialog
        open={showPipelineStatus}
        onOpenChange={setShowPipelineStatus}
      />
    </Card>
  )
}
