import { useState, useCallback } from 'react'
import Button from '@/components/ui/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import Checkbox from '@/components/ui/Checkbox'
import { Label } from '@/components/ui/Label'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/utils'
import { clearDocuments, clearCache } from '@/api/lightrag'

import { EraserIcon, AlertTriangleIcon, Loader2Icon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface ClearDocumentsDialogProps {
  onSuccess?: () => void
}

export default function ClearDocumentsDialog({ onSuccess }: ClearDocumentsDialogProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [clearCacheOption, setClearCacheOption] = useState(false)
  const [isClearing, setIsClearing] = useState(false)

  const isConfirmEnabled = confirmText.toLowerCase() === 'yes'

  const handleClear = useCallback(async () => {
    if (!isConfirmEnabled || isClearing) return

    setIsClearing(true)

    try {
      const result = await clearDocuments()

      if (result.status !== 'success') {
        toast.error(t('documentPanel.clear.failed', { message: result.message }))
        return
      }

      if (clearCacheOption) {
        try {
          await clearCache()
        } catch (cacheErr) {
          console.error('Failed to clear cache:', cacheErr)
        }
      }

      toast.success(t('documentPanel.clear.success'))
      setOpen(false)
      onSuccess?.()
    } catch (err) {
      toast.error(t('documentPanel.clear.error', { error: errorMessage(err) }))
    } finally {
      setIsClearing(false)
      setConfirmText('')
      setClearCacheOption(false)
    }
  }, [isConfirmEnabled, isClearing, clearCacheOption, t, onSuccess])

  const handleOpenChange = (isOpen: boolean) => {
    if (!isClearing) {
      setOpen(isOpen)
      if (!isOpen) {
        setConfirmText('')
        setClearCacheOption(false)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <EraserIcon className="size-4 mr-1" />
          {t('documentPanel.clear.button')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-500">
            <AlertTriangleIcon className="size-5" />
            {t('documentPanel.clear.title')}
          </DialogTitle>
          <DialogDescription>{t('documentPanel.clear.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-red-500 font-semibold">{t('documentPanel.clear.warning')}</div>

          <div className="space-y-2">
            <Label htmlFor="confirm-clear">{t('documentPanel.clear.confirmPrompt')}</Label>
            <Input
              id="confirm-clear"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={t('documentPanel.clear.confirmPlaceholder')}
              disabled={isClearing}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="clear-cache"
              checked={clearCacheOption}
              onCheckedChange={(checked) => setClearCacheOption(checked === true)}
              disabled={isClearing}
            />
            <Label htmlFor="clear-cache" className="text-sm">
              {t('documentPanel.clear.clearCache')}
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isClearing}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleClear}
            disabled={!isConfirmEnabled || isClearing}
          >
            {isClearing && <Loader2Icon className="size-4 mr-1 animate-spin" />}
            {t('documentPanel.clear.button')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
