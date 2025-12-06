import { useBackendState } from '@/stores/state'
import { cn } from '@/lib/utils'
import { CheckCircleIcon, XCircleIcon } from 'lucide-react'

export default function StatusIndicator() {
  const health = useBackendState.use.health()
  const pipelineBusy = useBackendState.use.pipelineBusy()

  return (
    <div className="fixed bottom-4 right-4 flex items-center gap-2 bg-background/80 backdrop-blur px-3 py-2 rounded-full shadow-lg border">
      {health ? (
        <>
          <CheckCircleIcon className={cn('size-4', pipelineBusy ? 'text-yellow-500' : 'text-green-500')} />
          <span className="text-xs text-muted-foreground">
            {pipelineBusy ? 'Processing' : 'Connected'}
          </span>
        </>
      ) : (
        <>
          <XCircleIcon className="size-4 text-red-500" />
          <span className="text-xs text-muted-foreground">Disconnected</span>
        </>
      )}
    </div>
  )
}
