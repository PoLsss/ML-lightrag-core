import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
    ShieldIcon,
    UsersIcon,
    FileTextIcon,
    RefreshCwIcon,
    PlusIcon,
    PencilIcon,
    TrashIcon,
    CheckCircleIcon,
    XCircleIcon
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/Select'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/Table'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/Dialog'
import { getUsers, createUser, updateUser, deleteUser, UserProfile, CreateUserRequest } from '@/api/users'
import { useAuthStore } from '@/stores/state'
import { cn } from '@/lib/utils'

type UserRole = 'admin' | 'teacher' | 'student'
type UserStatus = 'active' | 'inactive' | 'suspended'

export default function AccessControl() {
    const { isAuthenticated, userRole } = useAuthStore()
    const { t } = useTranslation()
    const [isLoading, setIsLoading] = useState(true)
    const [users, setUsers] = useState<UserProfile[]>([])
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
    const [editingUser, setEditingUser] = useState<UserProfile | null>(null)

    // Form states
    const [formEmail, setFormEmail] = useState('')
    const [formPassword, setFormPassword] = useState('')
    const [formDisplayName, setFormDisplayName] = useState('')
    const [formRole, setFormRole] = useState<UserRole>('student')
    const [formStatus, setFormStatus] = useState<UserStatus>('active')

    const fetchUsers = useCallback(async () => {
        // Don't fetch if not authenticated or not admin
        if (!isAuthenticated || userRole !== 'admin') {
            setIsLoading(false)
            return
        }

        setIsLoading(true)
        try {
            const data = await getUsers()
            setUsers(data.users)
        } catch (error) {
            console.error('Failed to fetch users:', error)
            toast.error(t('accessControl.failed'))
        } finally {
            setIsLoading(false)
        }
    }, [isAuthenticated, userRole])

    useEffect(() => {
        fetchUsers()
    }, [fetchUsers])

    const resetForm = () => {
        setFormEmail('')
        setFormPassword('')
        setFormDisplayName('')
        setFormRole('student')
        setFormStatus('active')
    }

    const handleCreateUser = async () => {
        if (!formEmail || !formPassword || !formDisplayName) {
            toast.error('Please fill in all required fields')
            return
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(formEmail)) {
            toast.error('Please enter a valid email address')
            return
        }

        if (formPassword.length < 6) {
            toast.error('Password must be at least 6 characters')
            return
        }

        if (formDisplayName.length < 2) {
            toast.error('Display name must be at least 2 characters')
            return
        }

        try {
            const userData: CreateUserRequest = {
                email: formEmail,
                password: formPassword,
                display_name: formDisplayName,
                role: formRole,
                metadata: {}
            }
            await createUser(userData)
            toast.success(t('accessControl.createSuccess'))
            setIsCreateDialogOpen(false)
            resetForm()
            fetchUsers()
        } catch (error: any) {
            console.error('Failed to create user:', error)
            const errorMsg = error.response?.data?.detail || error.response?.data?.message || 'Failed to create user'
            toast.error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg))
        }
    }

    const openEditDialog = (user: UserProfile) => {
        setEditingUser(user)
        setFormDisplayName(user.display_name)
        setFormRole(user.role)
        setFormStatus(user.status)
        setFormPassword('')
    }

    const handleUpdateUser = async () => {
        if (!editingUser) return

        try {
            await updateUser(editingUser.email, {
                display_name: formDisplayName,
                role: formRole,
                status: formStatus,
                ...(formPassword && { password: formPassword })
            })
            toast.success(t('accessControl.updateSuccess'))
            setEditingUser(null)
            resetForm()
            fetchUsers()
        } catch (error: any) {
            console.error('Failed to update user:', error)
            const errorMsg = error.response?.data?.detail || error.response?.data?.message || 'Failed to update user'
            toast.error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg))
        }
    }

    const handleDeleteUser = async (email: string) => {
        if (!confirm(t('accessControl.deleteConfirm', { email }))) return

        try {
            await deleteUser(email)
            toast.success(t('accessControl.deleteSuccess'))
            fetchUsers()
        } catch (error) {
            console.error('Failed to delete user:', error)
            toast.error('Failed to delete user')
        }
    }

    const getRoleBadgeClass = (role: string) => {
        switch (role) {
            case 'admin':
                return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
            case 'teacher':
                return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
            case 'student':
                return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
            default:
                return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
        }
    }

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'active':
                return <CheckCircleIcon className="size-4 text-green-600" />
            case 'inactive':
                return <XCircleIcon className="size-4 text-yellow-600" />
            case 'suspended':
                return <XCircleIcon className="size-4 text-red-600" />
            default:
                return null
        }
    }

    return (
        <div className="h-full overflow-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <ShieldIcon className="size-6" />
                        {t('accessControl.title')}
                    </h1>
                    <p className="text-muted-foreground">
                        {t('accessControl.subtitle')}
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={fetchUsers} disabled={isLoading}>
                        <RefreshCwIcon className={`mr-2 size-4 ${isLoading ? 'animate-spin' : ''}`} />
                        {t('accessControl.refresh')}
                    </Button>
                    <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
                        if (open) resetForm()
                        setIsCreateDialogOpen(open)
                    }}>
                        <DialogTrigger asChild>
                            <Button size="sm">
                                <PlusIcon className="mr-2 size-4" />
                                {t('accessControl.addUser')}
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{t('accessControl.createUser')}</DialogTitle>
                                <DialogDescription>
                                    {t('accessControl.createUserDesc')}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">{t('accessControl.email')}</label>
                                    <Input
                                        placeholder="user@example.com"
                                        value={formEmail}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormEmail(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">{t('accessControl.password')}</label>
                                    <Input
                                        type="password"
                                        placeholder="••••••••"
                                        value={formPassword}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormPassword(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">{t('accessControl.displayName')}</label>
                                    <Input
                                        placeholder="John Doe"
                                        value={formDisplayName}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormDisplayName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">{t('accessControl.role')}</label>
                                    <Select value={formRole} onValueChange={(v) => setFormRole(v as UserRole)}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="admin">{t('accessControl.admin')}</SelectItem>
                                            <SelectItem value="teacher">{t('accessControl.teacher')}</SelectItem>
                                            <SelectItem value="student">{t('accessControl.student')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                                    {t('accessControl.cancel')}
                                </Button>
                                <Button onClick={handleCreateUser}>{t('accessControl.createUserButton')}</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-card p-6">
                    <div className="flex items-center gap-4">
                        <div className="rounded-lg bg-primary/10 p-3">
                            <UsersIcon className="size-6 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">{t('accessControl.totalUsers')}</p>
                            <p className="text-2xl font-bold">{users.length}</p>
                        </div>
                    </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-6">
                    <div className="flex items-center gap-4">
                        <div className="rounded-lg bg-blue-500/10 p-3">
                            <ShieldIcon className="size-6 text-blue-500" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">{t('accessControl.admins')}</p>
                            <p className="text-2xl font-bold">{users.filter(u => u.role === 'admin').length}</p>
                        </div>
                    </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-6">
                    <div className="flex items-center gap-4">
                        <div className="rounded-lg bg-green-500/10 p-3">
                            <FileTextIcon className="size-6 text-green-500" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">{t('accessControl.activeUsers')}</p>
                            <p className="text-2xl font-bold">{users.filter(u => u.status === 'active').length}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Users Table */}
            <div className="rounded-xl border border-border bg-card">
                <div className="p-6 border-b border-border">
                    <h3 className="font-semibold">{t('accessControl.userManagement')}</h3>
                    <p className="text-sm text-muted-foreground">
                        {t('accessControl.userManagementDesc')}
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50">
                                <TableHead>{t('accessControl.user')}</TableHead>
                                <TableHead>{t('accessControl.role')}</TableHead>
                                <TableHead>{t('accessControl.status')}</TableHead>
                                <TableHead>{t('accessControl.lastLogin')}</TableHead>
                                <TableHead className="text-right">{t('accessControl.actions')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">
                                        <div className="flex items-center justify-center">
                                            <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                            <span className="ml-2">{t('accessControl.loading')}</span>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : users.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                        {t('accessControl.noUsersFound')}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                users.map((user) => (
                                    <TableRow key={user.email} className="hover:bg-muted/30">
                                        <TableCell>
                                            <div>
                                                <p className="font-medium">{user.display_name}</p>
                                                <p className="text-sm text-muted-foreground">{user.email}</p>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className={cn('px-2 py-1 rounded-full text-xs font-medium capitalize', getRoleBadgeClass(user.role))}>
                                                {user.role}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {getStatusIcon(user.status)}
                                                <span className="capitalize">{user.status}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {user.last_login ? new Date(user.last_login).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : t('accessControl.never')}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button variant="ghost" size="sm" onClick={() => openEditDialog(user)}>
                                                    <PencilIcon className="size-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-red-600 hover:text-red-700"
                                                    onClick={() => handleDeleteUser(user.email)}
                                                >
                                                    <TrashIcon className="size-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Edit User Dialog */}
            <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('accessControl.editUser')}</DialogTitle>
                        <DialogDescription>
                            {t('accessControl.editUserDesc', { email: editingUser?.email })}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('accessControl.displayName')}</label>
                            <Input
                                placeholder="John Doe"
                                value={formDisplayName}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormDisplayName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('accessControl.newPasswordDesc')}</label>
                            <Input
                                type="password"
                                placeholder="••••••••"
                                value={formPassword}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormPassword(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Role</label>
                            <Select value={formRole} onValueChange={(v) => setFormRole(v as UserRole)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="admin">{t('accessControl.admin')}</SelectItem>
                                    <SelectItem value="teacher">{t('accessControl.teacher')}</SelectItem>
                                    <SelectItem value="student">{t('accessControl.student')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('accessControl.status')}</label>
                            <Select value={formStatus} onValueChange={(v) => setFormStatus(v as UserStatus)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">{t('accessControl.active')}</SelectItem>
                                    <SelectItem value="inactive">{t('accessControl.inactive')}</SelectItem>
                                    <SelectItem value="suspended">{t('accessControl.suspended')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingUser(null)}>
                            {t('accessControl.cancel')}
                        </Button>
                        <Button onClick={handleUpdateUser}>{t('accessControl.saveChanges')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
