import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { FileTextIcon, HashIcon } from 'lucide-react'

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
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileTextIcon className="size-5 text-blue-500" />
            {fileName}
          </DialogTitle>
        </DialogHeader>

        {/* Metadata */}
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground border-b border-border pb-3">
          {chunk.chunk_id != null && (
            <span className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded">
              <HashIcon className="size-3" />
              Chunk #{String(chunk.chunk_id)}
            </span>
          )}
          {chunk.chunk_order_index != null && (
            <span className="bg-muted px-2 py-0.5 rounded">
              Order: {chunk.chunk_order_index}
            </span>
          )}
          {chunk.tokens != null && (
            <span className="bg-muted px-2 py-0.5 rounded">
              {chunk.tokens} tokens
            </span>
          )}
          {chunk.file_path && (
            <span className="bg-muted px-2 py-0.5 rounded truncate max-w-xs" title={chunk.file_path}>
              {chunk.file_path}
            </span>
          )}
          {chunk.metadata && Object.entries(chunk.metadata).map(([key, value]) => (
            <span key={key} className="bg-muted px-2 py-0.5 rounded">
              {key}: {String(value)}
            </span>
          ))}
        </div>

        {/* Full text */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="prose prose-sm dark:prose-invert max-w-none p-1 whitespace-pre-wrap text-sm leading-relaxed">
            {chunk.content}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
