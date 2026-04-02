import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@/stores/chat'
import { ResizablePanel } from '@/components/ui/ResizablePanel'
import MiniGraphPanel from '@/components/chat/MiniGraphPanel'
import { ChunkDetailModal, ChunkData } from '@/components/chat/ChunkDetailModal'
import { useGraphStore } from '@/stores/graph'
import { ScrollArea } from '@/components/ui/ScrollArea'
import {
  NetworkIcon,
  FileTextIcon,
  LayersIcon,
  HashIcon,
  ChevronRightIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

function ChunkCard({ chunk, onClick }: { chunk: ChunkData; onClick: () => void }) {
  const fileName = chunk.file_name || chunk.file_path?.split('/').pop() || 'Unknown'
  const preview = chunk.content?.slice(0, 150) || ''

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-lg border border-border bg-card p-3 hover:bg-accent hover:border-accent-foreground/20',
        'transition-all cursor-pointer group hover:shadow-md'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* File name + metadata */}
          <div className="flex items-center gap-2 mb-1.5">
            <FileTextIcon className="size-3.5 text-blue-500 shrink-0" />
            <span className="text-xs font-semibold text-foreground truncate">
              {fileName}
            </span>
            {chunk.chunk_id != null && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                <HashIcon className="size-2.5" />
                {String(chunk.chunk_id)}
              </span>
            )}
            {chunk.tokens != null && (
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                {chunk.tokens} tokens
              </span>
            )}
          </div>

          {/* Content preview */}
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {preview}{preview.length < (chunk.content?.length || 0) ? '...' : ''}
          </p>
        </div>

        <ChevronRightIcon className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
      </div>
    </button>
  )
}

function ChunksPanel({ chunks }: { chunks: ChunkData[] }) {
  const { t } = useTranslation()
  const [selectedChunk, setSelectedChunk] = useState<ChunkData | null>(null)

  if (!chunks || chunks.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-5 text-center">
        <LayersIcon className="size-8 mb-3 opacity-40" />
        <p className="text-sm">{t('chat.retrieval.noChunks', 'No retrieved chunks available')}</p>
        <p className="text-xs mt-1 opacity-70">{t('chat.retrieval.noChunksHint', 'Send a RAG query to see retrieved chunks here')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background/80 shrink-0">
        <LayersIcon className="size-4 text-orange-500" />
        <h3 className="font-semibold text-sm">{t('chat.retrieval.chunks', 'Retrieved Chunks')}</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          {chunks.length} {chunks.length === 1 ? 'chunk' : 'chunks'}
        </span>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-2">
          {chunks.map((chunk, index) => (
            <ChunkCard
              key={chunk.chunk_id ?? index}
              chunk={chunk}
              onClick={() => setSelectedChunk(chunk)}
            />
          ))}
        </div>
      </ScrollArea>

      <ChunkDetailModal
        chunk={selectedChunk}
        open={!!selectedChunk}
        onOpenChange={(open) => { if (!open) setSelectedChunk(null) }}
      />
    </div>
  )
}

function GraphSection() {
  const { t } = useTranslation()
  const miniGraphData = useGraphStore.use.miniGraphData()

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background/80 shrink-0">
        <NetworkIcon className="size-4 text-emerald-500" />
        <h3 className="font-semibold text-sm">{t('chat.retrieval.graph', 'Retrieved Graph')}</h3>
        {miniGraphData?.entities && (
          <span className="text-xs text-muted-foreground ml-auto">
            {miniGraphData.entities.length} nodes
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0">
        <MiniGraphPanel />
      </div>
    </div>
  )
}

export default function RetrievalInfoPanel() {
  const messages = useChatStore.use.messages()

  // Get the latest assistant message's context_data
  const latestContextData = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as any
      if (msg.role === 'assistant' && msg.context_data) {
        return msg.context_data
      }
    }
    return null
  }, [messages])

  // Sync graph store whenever latest context data changes
  useEffect(() => {
    if (latestContextData) {
      useGraphStore.getState().setMiniGraphData(latestContextData)
    }
  }, [latestContextData])

  // Normalize chunks data
  const chunks: ChunkData[] = useMemo(() => {
    if (!latestContextData?.chunks) return []
    return latestContextData.chunks.map((c: any, idx: number) => ({
      content: c.content || c.text || '',
      file_path: c.file_path || c.source || '',
      file_name: c.file_name || c.file_path?.split('/').pop() || undefined,
      chunk_id: c.chunk_id ?? c.id ?? idx,
      chunk_order_index: c.chunk_order_index ?? c.order ?? undefined,
      tokens: c.tokens ?? c.token_count ?? undefined,
      metadata: c.metadata || undefined,
    }))
  }, [latestContextData])

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50/70 via-white to-white/90 dark:from-slate-950/70 dark:via-slate-900 dark:to-slate-900/90">
      <ResizablePanel
        direction="vertical"
        defaultSize={50}
        minSize={20}
        maxSize={80}
        first={<GraphSection />}
        second={<ChunksPanel chunks={chunks} />}
        className="h-full"
      />
    </div>
  )
}
