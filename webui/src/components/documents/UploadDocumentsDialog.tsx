import { useState, useCallback } from 'react'
import Button from '@/components/ui/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import Progress from '@/components/ui/Progress'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/utils'
import { uploadDocument } from '@/api/lightrag'
import { acceptedFileTypes } from '@/lib/constants'

import { UploadIcon, XIcon, FileIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface UploadDocumentsDialogProps {
  onSuccess?: () => void
}

export default function UploadDocumentsDialog({ onSuccess }: UploadDocumentsDialogProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [progresses, setProgresses] = useState<Record<string, number>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files)
      setFiles(prev => [...prev, ...newFiles])
    }
  }

  const removeFile = (fileName: string) => {
    setFiles(prev => prev.filter(f => f.name !== fileName))
    setProgresses(prev => {
      const newProgresses = { ...prev }
      delete newProgresses[fileName]
      return newProgresses
    })
    setErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors[fileName]
      return newErrors
    })
  }

  const handleUpload = useCallback(async () => {
    if (files.length === 0) return

    setIsUploading(true)
    setErrors({})
    let successCount = 0

    for (const file of files) {
      try {
        setProgresses(prev => ({ ...prev, [file.name]: 0 }))

        const result = await uploadDocument(file, (percent) => {
          setProgresses(prev => ({ ...prev, [file.name]: percent }))
        })

        if (result.status === 'duplicated') {
          setErrors(prev => ({ ...prev, [file.name]: t('documentPanel.upload.duplicate') }))
        } else if (result.status !== 'success') {
          setErrors(prev => ({ ...prev, [file.name]: result.message }))
        } else {
          successCount++
        }
      } catch (err) {
        setErrors(prev => ({ ...prev, [file.name]: errorMessage(err) }))
        setProgresses(prev => ({ ...prev, [file.name]: 100 }))
      }
    }

    setIsUploading(false)

    if (successCount > 0) {
      toast.success(t('documentPanel.upload.success', { count: successCount }))
      if (successCount === files.length) {
        setFiles([])
        setProgresses({})
        setOpen(false)
        onSuccess?.()
      }
    }
  }, [files, t, onSuccess])

  const handleClose = (isOpen: boolean) => {
    if (!isUploading) {
      setOpen(isOpen)
      if (!isOpen) {
        setFiles([])
        setProgresses({})
        setErrors({})
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UploadIcon className="size-4 mr-1" />
          {t('documentPanel.upload.button')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('documentPanel.upload.title')}</DialogTitle>
          <DialogDescription>{t('documentPanel.upload.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            type="file"
            multiple
            accept={acceptedFileTypes.join(',')}
            onChange={handleFileChange}
            disabled={isUploading}
          />

          {files.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-auto">
              {files.map(file => (
                <div
                  key={file.name}
                  className="flex items-center gap-2 p-2 bg-muted rounded-md"
                >
                  <FileIcon className="size-4 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{file.name}</div>
                    {progresses[file.name] !== undefined && (
                      <Progress value={progresses[file.name]} className="h-1 mt-1" />
                    )}
                    {errors[file.name] && (
                      <div className="text-xs text-red-500 mt-1">{errors[file.name]}</div>
                    )}
                  </div>
                  {!isUploading && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => removeFile(file.name)}
                    >
                      <XIcon className="size-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => handleClose(false)} disabled={isUploading}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleUpload} disabled={files.length === 0 || isUploading}>
              {isUploading ? t('documentPanel.upload.uploading') : t('documentPanel.upload.button')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
