import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useAuthStore } from '@/stores/state'
import { updateUser } from '@/api/users'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

interface UserProfileModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export default function UserProfileModal({ open, onOpenChange }: UserProfileModalProps) {
    const { t } = useTranslation()
    const { username, displayName, login } = useAuthStore()
    const [name, setName] = useState(displayName || '')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (open) {
            setName(displayName || '')
            setPassword('')
        }
    }, [open, displayName])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!username) return

        setLoading(true)
        try {
            const updateData: any = {}
            if (name !== displayName) updateData.display_name = name
            if (password) updateData.password = password

            if (Object.keys(updateData).length === 0) {
                onOpenChange(false)
                return
            }

            await updateUser(username, updateData)
            toast.success(t('common.saveSuccess', 'Profile updated successfully'))

            // Update local store (simulated login update)
            // Note: In a real app we might want to refresh the token if claims changed
            // For now we just update the display name locally
            // We need to access the store state to get current values
            const current = useAuthStore.getState()
            login(
                localStorage.getItem('LIGHTRAG-API-TOKEN') || '',
                current.isGuestMode,
                current.coreVersion,
                current.apiVersion,
                current.webuiTitle,
                current.webuiDescription,
                name
            )

            onOpenChange(false)
        } catch (error: any) {
            console.error('Failed to update profile', error)
            toast.error(error.message || t('common.saveFailed', 'Failed to update profile'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{t('profile.editProfile', 'Edit Profile')}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="email" className="text-right text-sm font-medium">
                            {t('login.username', 'Email')}
                        </label>
                        <Input
                            id="email"
                            value={username || ''}
                            disabled
                            className="col-span-3 bg-muted"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="name" className="text-right text-sm font-medium">
                            {t('profile.displayName', 'Name')}
                        </label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="col-span-3"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="password" className="text-right text-sm font-medium">
                            {t('login.password', 'Password')}
                        </label>
                        <Input
                            id="password"
                            type="password"
                            placeholder={t('profile.newPasswordPlaceholder', 'Leave empty to keep current')}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="col-span-3"
                        />
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading}>
                            {loading ? t('common.saving', 'Saving...') : t('common.save', 'Save changes')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
