import { useState, useEffect, useCallback } from 'react'
import Button from '@/components/ui/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/Dialog'
import { ScrollArea } from '@/components/ui/ScrollArea'
import Badge from '@/components/ui/Badge'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/utils'
import { getPipelineStatus, cancelPipeline, PipelineStatusResponse } from '@/api/lightrag'

import { Loader2Icon, XIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface PipelineStatusDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function PipelineStatusDialog({ open, onOpenChange }: PipelineStatusDialogProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<PipelineStatusResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await getPipelineStatus()
      setStatus(response)
    } catch (err) {
      console.error('Failed to fetch pipeline status:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      fetchStatus()
      const interval = setInterval(fetchStatus, 3000)
      return () => clearInterval(interval)
    }
  }, [open, fetchStatus])

  const handleCancel = useCallback(async () => {
    try {
      setIsCancelling(true)
      const result = await cancelPipeline()
      if (result.status === 'cancellation_requested') {
        toast.success(t('documentPanel.pipeline.cancelRequested'))
      } else {
        toast.info(result.message)
      }
      fetchStatus()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsCancelling(false)
    }
  }, [t, fetchStatus])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t('documentPanel.pipeline.title')}
            {status?.busy && (
              <Badge variant="destructive" className="animate-pulse">
                {t('documentPanel.pipeline.busy')}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>{t('documentPanel.pipeline.description')}</DialogDescription>
        </DialogHeader>

        {isLoading && !status ? (
          <div className="flex items-center justify-center py-8">
            <Loader2Icon className="size-6 animate-spin" />
          </div>
        ) : status ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-muted-foreground">{t('documentPanel.pipeline.jobName')}:</div>
              <div>{status.job_name || '-'}</div>

              <div className="text-muted-foreground">{t('documentPanel.pipeline.documents')}:</div>
              <div>{status.docs}</div>

              <div className="text-muted-foreground">{t('documentPanel.pipeline.batches')}:</div>
              <div>
                {status.cur_batch} / {status.batchs}
              </div>

              <div className="text-muted-foreground">{t('documentPanel.pipeline.autoscanned')}:</div>
              <div>{status.autoscanned ? t('common.yes') : t('common.no')}</div>
            </div>

            {status.latest_message && (
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">
                  {t('documentPanel.pipeline.latestMessage')}:
                </div>
                <div className="text-sm bg-muted p-2 rounded-md">{status.latest_message}</div>
              </div>
            )}

            {status.history_messages && status.history_messages.length > 0 && (
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">
                  {t('documentPanel.pipeline.history')}:
                </div>
                <ScrollArea className="h-32 bg-muted rounded-md p-2">
                  {status.history_messages.map((msg, i) => (
                    <div key={i} className="text-xs py-0.5">
                      {msg}
                    </div>
                  ))}
                </ScrollArea>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            {t('documentPanel.pipeline.noData')}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
          {status?.busy && !status.cancellation_requested && (
            <Button variant="destructive" onClick={handleCancel} disabled={isCancelling}>
              {isCancelling && <Loader2Icon className="size-4 mr-1 animate-spin" />}
              <XIcon className="size-4 mr-1" />
              {t('documentPanel.pipeline.cancel')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
