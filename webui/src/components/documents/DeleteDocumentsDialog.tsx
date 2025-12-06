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
import { deleteDocuments } from '@/api/lightrag'

import { TrashIcon, AlertTriangleIcon, Loader2Icon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface DeleteDocumentsDialogProps {
  docIds: string[]
  onSuccess?: () => void
}

export default function DeleteDocumentsDialog({ docIds, onSuccess }: DeleteDocumentsDialogProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleteFile, setDeleteFile] = useState(false)
  const [deleteLLMCache, setDeleteLLMCache] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const isConfirmEnabled = confirmText.toLowerCase() === 'yes' && !isDeleting

  const handleDelete = useCallback(async () => {
    if (!isConfirmEnabled || docIds.length === 0) return

    setIsDeleting(true)

    try {
      const result = await deleteDocuments(docIds, deleteFile, deleteLLMCache)

      if (result.status === 'deletion_started') {
        toast.success(t('documentPanel.delete.success', { count: docIds.length }))
        setOpen(false)
        onSuccess?.()
      } else if (result.status === 'busy') {
        toast.error(t('documentPanel.delete.busy'))
      } else if (result.status === 'not_allowed') {
        toast.error(t('documentPanel.delete.notAllowed'))
      } else {
        toast.error(t('documentPanel.delete.failed', { message: result.message }))
      }
    } catch (err) {
      toast.error(t('documentPanel.delete.error', { error: errorMessage(err) }))
    } finally {
      setIsDeleting(false)
      setConfirmText('')
    }
  }, [isConfirmEnabled, docIds, deleteFile, deleteLLMCache, t, onSuccess])

  const handleOpenChange = (isOpen: boolean) => {
    if (!isDeleting) {
      setOpen(isOpen)
      if (!isOpen) {
        setConfirmText('')
        setDeleteFile(false)
        setDeleteLLMCache(false)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <TrashIcon className="size-4 mr-1" />
          {t('documentPanel.delete.button')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-500">
            <AlertTriangleIcon className="size-5" />
            {t('documentPanel.delete.title')}
          </DialogTitle>
          <DialogDescription>
            {t('documentPanel.delete.description', { count: docIds.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-red-500 font-semibold">{t('documentPanel.delete.warning')}</div>

          <div className="space-y-2">
            <Label htmlFor="confirm-delete">{t('documentPanel.delete.confirmPrompt')}</Label>
            <Input
              id="confirm-delete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={t('documentPanel.delete.confirmPlaceholder')}
              disabled={isDeleting}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="delete-file"
                checked={deleteFile}
                onCheckedChange={(checked) => setDeleteFile(checked === true)}
                disabled={isDeleting}
              />
              <Label htmlFor="delete-file" className="text-sm">
                {t('documentPanel.delete.deleteFile')}
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="delete-cache"
                checked={deleteLLMCache}
                onCheckedChange={(checked) => setDeleteLLMCache(checked === true)}
                disabled={isDeleting}
              />
              <Label htmlFor="delete-cache" className="text-sm">
                {t('documentPanel.delete.deleteCache')}
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isDeleting}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!isConfirmEnabled}
          >
            {isDeleting && <Loader2Icon className="size-4 mr-1 animate-spin" />}
            {t('documentPanel.delete.button')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
