import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog'
import { FileTextIcon, HashIcon } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export interface ChunkData {
  content: string
  file_path?: string
  file_name?: string
  chunk_id?: string | number
  chunk_order_index?: number
  tokens?: number
  metadata?: Record<string, any>
}

interface ChunkDetailModalProps {
  chunk: ChunkData | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChunkDetailModal({ chunk, open, onOpenChange }: ChunkDetailModalProps) {
  const { t } = useTranslation()

  if (!chunk) return null

  const fileName = chunk.file_name || chunk.file_path?.split('/').pop() || t('chat.retrieval.unknownFile', 'Unknown file')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[90vw] h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileTextIcon className="size-5 text-blue-500" />
            {fileName}
          </DialogTitle>
        </DialogHeader>

        {/* Metadata */}
        <div className="flex flex-wrap gap-2 px-6 py-3 text-xs text-muted-foreground border-b border-border shrink-0">
          {chunk.chunk_id != null && (
            <span className="flex items-center gap-1 bg-muted px-2 py-1 rounded">
              <HashIcon className="size-3" />
              Chunk #{String(chunk.chunk_id)}
            </span>
          )}
          {chunk.chunk_order_index != null && (
            <span className="bg-muted px-2 py-1 rounded">
              Order: {chunk.chunk_order_index}
            </span>
          )}
          {chunk.tokens != null && (
            <span className="bg-muted px-2 py-1 rounded">
              {chunk.tokens} tokens
            </span>
          )}
          {chunk.file_path && (
            <span className="bg-muted px-2 py-1 rounded truncate max-w-md" title={chunk.file_path}>
              {chunk.file_path}
            </span>
          )}
          {chunk.metadata && Object.entries(chunk.metadata).map(([key, value]) => (
            <span key={key} className="bg-muted px-2 py-1 rounded">
              {key}: {String(value)}
            </span>
          ))}
        </div>

        {/* Full text - scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed prose-table:border-collapse prose-table:w-full prose-th:border prose-th:border-border prose-th:bg-muted prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {chunk.content}
            </ReactMarkdown>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
