import { useCallback, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Label } from '@/components/ui/Label'
import { useSettingsStore } from '@/stores/settings'
import { useBackendState } from '@/stores/state'
import { useTranslation } from 'react-i18next'
import { KeyIcon } from 'lucide-react'

interface ApiKeyAlertProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ApiKeyAlert({ open, onOpenChange }: ApiKeyAlertProps) {
  const { t } = useTranslation()
  const apiKey = useSettingsStore.use.apiKey()
  const setApiKey = useSettingsStore.use.setApiKey()
  const [inputValue, setInputValue] = useState(apiKey || '')

  const handleSave = useCallback(() => {
    setApiKey(inputValue)
    useBackendState.getState().check()
    onOpenChange(false)
  }, [inputValue, setApiKey, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyIcon className="size-5" />
            {t('apiKey.title', 'API Key Required')}
          </DialogTitle>
          <DialogDescription>
            {t('apiKey.description', 'Please enter your API key to access the system.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-key">{t('apiKey.label', 'API Key')}</Label>
            <Input
              id="api-key"
              type="password"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={t('apiKey.placeholder', 'Enter your API key')}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
