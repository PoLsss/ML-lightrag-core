import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import { getDocumentFileBlob, DocStatusResponse } from '@/api/lightrag'
import {
  Loader2Icon,
  DownloadIcon,
  XIcon,
  FileTextIcon,
  MaximizeIcon,
  MinimizeIcon,
} from 'lucide-react'

interface DocumentViewerModalProps {
  doc: DocStatusResponse | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const getFileExtension = (filePath: string): string => {
  const parts = filePath.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}

const getFileName = (filePath: string): string => {
  const parts = filePath.split('/')
  return parts[parts.length - 1] || filePath
}

/**
 * Full-screen modal that renders documents in their original format.
 * - PDF: rendered via <iframe> with object URL
 * - Images: rendered via <img>
 * - Text/code/markdown: rendered as <pre> text
 * - Office docs (docx, xlsx, pptx): rendered via Microsoft Office Online viewer
 * - Other: download prompt
 */
export default function DocumentViewerModal({
  doc,
  open,
  onOpenChange,
}: DocumentViewerModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [contentType, setContentType] = useState<string>('')
  const [filename, setFilename] = useState<string>('')
  const [rawText, setRawText] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(true)

  const ext = useMemo(() => {
    if (doc?.file_path) return getFileExtension(doc.file_path)
    if (filename) return getFileExtension(filename)
    return ''
  }, [doc, filename])

  const renderType = useMemo((): 'pdf' | 'image' | 'text' | 'office' | 'unsupported' => {
    if (ext === 'pdf' || contentType === 'application/pdf') return 'pdf'
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image'
    if (contentType.startsWith('image/')) return 'image'
    if ([
      'txt', 'md', 'csv', 'json', 'xml', 'yaml', 'yml', 'log', 'conf', 'ini',
      'properties', 'sql', 'bat', 'sh', 'c', 'cpp', 'py', 'java', 'js', 'ts',
      'swift', 'go', 'rb', 'php', 'css', 'scss', 'less', 'html', 'htm',
      'tex', 'rtf',
    ].includes(ext)) return 'text'
    if (contentType.startsWith('text/')) return 'text'
    if (['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt'].includes(ext)) return 'office'
    return 'unsupported'
  }, [ext, contentType])

  const fetchFile = useCallback(async () => {
    if (!doc) return
    setLoading(true)
    setError(null)
    setRawText(null)

    // Release previous blob URL
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl)
      setBlobUrl(null)
    }

    try {
      const result = await getDocumentFileBlob(doc.id)
      setContentType(result.contentType)
      setFilename(result.filename)

      const determinedExt = getFileExtension(doc.file_path || result.filename)

      // For text files, read as text
      const isText = result.contentType.startsWith('text/') || [
        'txt', 'md', 'csv', 'json', 'xml', 'yaml', 'yml', 'log', 'conf', 'ini',
        'properties', 'sql', 'bat', 'sh', 'c', 'cpp', 'py', 'java', 'js', 'ts',
        'swift', 'go', 'rb', 'php', 'css', 'scss', 'less', 'html', 'htm',
        'tex', 'rtf',
      ].includes(determinedExt)

      if (isText) {
        const text = await result.blob.text()
        setRawText(text)
      }

      // Always create blob URL for download / PDF / image / office
      const url = URL.createObjectURL(result.blob)
      setBlobUrl(url)
    } catch (err: any) {
      const msg = err?.message || String(err)
      if (msg.includes('404')) {
        setError('File not found in storage. It may have been uploaded before MinIO integration was enabled.')
      } else {
        setError(`Failed to load document: ${msg}`)
      }
    } finally {
      setLoading(false)
    }
  }, [doc])

  useEffect(() => {
    if (open && doc) {
      fetchFile()
    }
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
        setBlobUrl(null)
      }
    }
  }, [open, doc?.id])

  const handleDownload = useCallback(() => {
    if (!blobUrl) return
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename || getFileName(doc?.file_path || 'document')
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [blobUrl, filename, doc])

  const handleClose = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  const dialogSizeClass = isFullscreen
    ? 'max-w-[98vw] w-[98vw] max-h-[96vh] h-[96vh]'
    : 'max-w-4xl w-full max-h-[85vh] h-[85vh]'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${dialogSizeClass} overflow-hidden flex flex-col border-border/60 shadow-2xl p-0 gap-0`}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30 shrink-0">
          <DialogHeader className="flex-1 min-w-0">
            <DialogTitle className="flex items-center gap-2 text-base truncate">
              <div className="flex items-center justify-center size-7 rounded-md bg-primary/10 shrink-0">
                <FileTextIcon className="size-3.5 text-primary" />
              </div>
              <span className="truncate">
                {doc ? getFileName(doc.file_path) : 'Document Viewer'}
              </span>
              {ext && (
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground border shrink-0">
                  {ext}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-1 ml-2 shrink-0">
            {blobUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownload}
                title="Download file"
                className="h-7 w-7 p-0"
              >
                <DownloadIcon className="size-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Minimize' : 'Maximize'}
              className="h-7 w-7 p-0"
            >
              {isFullscreen ? (
                <MinimizeIcon className="size-3.5" />
              ) : (
                <MaximizeIcon className="size-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              title="Close"
              className="h-7 w-7 p-0"
            >
              <XIcon className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden bg-muted/10">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2Icon className="size-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Loading document...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
              <div className="flex items-center justify-center size-16 rounded-full bg-red-50 dark:bg-red-900/20">
                <FileTextIcon className="size-8 text-red-400" />
              </div>
              <div className="text-center max-w-md">
                <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">
                  Unable to load document
                </p>
                <p className="text-xs text-muted-foreground">{error}</p>
              </div>
            </div>
          ) : renderType === 'pdf' && blobUrl ? (
            <iframe
              src={blobUrl}
              className="w-full h-full border-0"
              title={filename || 'PDF Document'}
            />
          ) : renderType === 'image' && blobUrl ? (
            <div className="flex items-center justify-center h-full p-4 overflow-auto">
              <img
                src={blobUrl}
                alt={filename || 'Document image'}
                className="max-w-full max-h-full object-contain rounded shadow-md"
              />
            </div>
          ) : renderType === 'text' && rawText !== null ? (
            <div className="h-full overflow-auto">
              <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed p-6 text-foreground/90">
                {rawText}
              </pre>
            </div>
          ) : renderType === 'office' && blobUrl ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
              <div className="flex items-center justify-center size-16 rounded-full bg-blue-50 dark:bg-blue-900/20">
                <FileTextIcon className="size-8 text-blue-500" />
              </div>
              <div className="text-center max-w-md">
                <p className="text-sm font-medium mb-2">
                  Office Document: {getFileName(doc?.file_path || filename)}
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  Office documents cannot be previewed inline. Click below to download and view in your preferred application.
                </p>
                <Button onClick={handleDownload} size="sm" className="gap-2">
                  <DownloadIcon className="size-4" />
                  Download {ext.toUpperCase()}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
              <div className="flex items-center justify-center size-16 rounded-full bg-muted">
                <FileTextIcon className="size-8 text-muted-foreground" />
              </div>
              <div className="text-center max-w-md">
                <p className="text-sm font-medium mb-2">
                  Preview not available
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  This file type ({ext || 'unknown'}) cannot be previewed in the browser.
                </p>
                {blobUrl && (
                  <Button onClick={handleDownload} size="sm" variant="outline" className="gap-2">
                    <DownloadIcon className="size-4" />
                    Download File
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
