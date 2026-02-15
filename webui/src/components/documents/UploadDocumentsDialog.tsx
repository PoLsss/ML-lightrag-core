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
import { useAuthStore } from '@/stores/state'

import { UploadIcon, XIcon, FileIcon, Globe, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface UploadDocumentsDialogProps {
  onSuccess?: () => void
  onFileUploaded?: (fileInfo: { name: string; scope?: string }) => void
}

type DocumentScope = 'public' | 'internal'

export default function UploadDocumentsDialog({ onSuccess, onFileUploaded }: UploadDocumentsDialogProps) {
  const { t } = useTranslation()
  const { userRole } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [progresses, setProgresses] = useState<Record<string, number>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [selectedScope, setSelectedScope] = useState<DocumentScope>('internal')

  // Only Admin and Teacher can select scope
  const canSelectScope = userRole === 'admin' || userRole === 'teacher'

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
    const uploadScope = canSelectScope ? selectedScope : undefined

    // Close dialog immediately and notify parent to show optimistic entries
    setOpen(false)
    
    // Notify parent immediately for each file so they appear in table right away
    files.forEach(file => {
      onFileUploaded?.({ name: file.name, scope: uploadScope })
    })
    
    let successCount = 0

    // Upload files in background
    for (const file of files) {
      try {
        setProgresses(prev => ({ ...prev, [file.name]: 0 }))

        const result = await uploadDocument(file, (percent) => {
          setProgresses(prev => ({ ...prev, [file.name]: percent }))
        }, uploadScope)

        if (result.status === 'duplicated') {
          setErrors(prev => ({ ...prev, [file.name]: t('documentPanel.upload.duplicate') }))
          toast.error(`${file.name}: ${t('documentPanel.upload.duplicate')}`)
        } else if (result.status !== 'success') {
          setErrors(prev => ({ ...prev, [file.name]: result.message }))
          toast.error(`${file.name}: ${result.message}`)
        } else {
          successCount++
        }
      } catch (err) {
        const errMsg = errorMessage(err)
        setErrors(prev => ({ ...prev, [file.name]: errMsg }))
        setProgresses(prev => ({ ...prev, [file.name]: 100 }))
        toast.error(`${file.name}: ${errMsg}`)
      }
    }

    setIsUploading(false)

    if (successCount > 0) {
      toast.success(t('documentPanel.upload.success', { count: successCount }))
      onSuccess?.()
      window.dispatchEvent(new CustomEvent('metrics:document-uploaded'))
    }

    // Reset state
    setFiles([])
    setProgresses({})
    setSelectedScope('internal')
  }, [files, t, onSuccess, onFileUploaded, canSelectScope, selectedScope])

  const handleClose = (isOpen: boolean) => {
    if (!isUploading) {
      setOpen(isOpen)
      if (!isOpen) {
        setFiles([])
        setProgresses({})
        setErrors({})
        setSelectedScope('internal')
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

          {/* Scope Selection - Only visible for Admin and Teacher */}
          {canSelectScope && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {t('documentPanel.upload.scopeLabel', 'Access Scope')}
              </label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={selectedScope === 'internal' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedScope('internal')}
                  disabled={isUploading}
                  className="flex items-center gap-2"
                >
                  <Lock className="size-4" />
                  {t('documentPanel.upload.scopeInternal', 'Internal')}
                </Button>
                <Button
                  type="button"
                  variant={selectedScope === 'public' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedScope('public')}
                  disabled={isUploading}
                  className="flex items-center gap-2"
                >
                  <Globe className="size-4" />
                  {t('documentPanel.upload.scopePublic', 'Public')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedScope === 'public'
                  ? t('documentPanel.upload.scopePublicHint', 'Document will be visible to all users including students.')
                  : t('documentPanel.upload.scopeInternalHint', 'Document will only be visible to teachers and admins.')
                }
              </p>
            </div>
          )}

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
