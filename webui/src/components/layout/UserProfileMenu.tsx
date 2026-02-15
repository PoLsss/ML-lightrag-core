import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/state'
import {
    UserIcon,
    LogOutIcon,
    ChevronDownIcon,
    ShieldIcon,
    GraduationCapIcon,
    BookOpenIcon
} from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import UserProfileModal from '@/features/UserProfileModal'

interface UserProfileMenuProps {
    className?: string
}

export default function UserProfileMenu({ className }: UserProfileMenuProps) {
    const { t } = useTranslation()
    const { username, displayName, userRole, isGuestMode, logout } = useAuthStore()
    const [isOpen, setIsOpen] = useState(false)

    const handleLogout = () => {
        console.log('Logging out...')
        // Clear auth token explicitly
        localStorage.removeItem('LIGHTRAG-API-TOKEN')
        // Call store logout
        logout()
        // Navigate to login and reload to ensure clean state
        window.location.href = window.location.origin + window.location.pathname + '#/login'
    }

    const getRoleIcon = (role: string | null) => {
        switch (role) {
            case 'admin':
                return <ShieldIcon className="size-4 text-red-500" />
            case 'teacher':
                return <BookOpenIcon className="size-4 text-blue-500" />
            case 'student':
                return <GraduationCapIcon className="size-4 text-green-500" />
            default:
                return <UserIcon className="size-4 text-gray-500" />
        }
    }

    const getRoleBadgeClass = (role: string | null) => {
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

    const displayUserName = displayName || username || (isGuestMode ? t('header.guest', 'Guest') : 'User')
    const [isProfileOpen, setIsProfileOpen] = useState(false)

    return (
        <>
            <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        className={cn(
                            'flex items-center gap-2 px-3 py-2 h-auto hover:bg-muted/50',
                            className
                        )}
                    >
                        <div className="flex items-center justify-center size-8 rounded-full bg-primary/10 text-primary">
                            {getRoleIcon(userRole)}
                        </div>
                        <div className="flex flex-col items-start text-left">
                            <span className="text-sm font-medium leading-none">{displayUserName}</span>
                            {userRole && !isGuestMode && (
                                <span className={cn(
                                    'text-[10px] px-1.5 py-0.5 rounded-full mt-1 capitalize',
                                    getRoleBadgeClass(userRole)
                                )}>
                                    {userRole}
                                </span>
                            )}
                        </div>
                        <ChevronDownIcon className={cn(
                            'size-4 text-muted-foreground transition-transform',
                            isOpen && 'rotate-180'
                        )} />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                        <div className="flex flex-col space-y-1">
                            <p className="text-sm font-medium leading-none">{displayUserName}</p>
                            <p className="text-xs leading-none text-muted-foreground">{username}</p>
                        </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {!isGuestMode && (
                        <DropdownMenuItem onClick={() => setIsProfileOpen(true)}>
                            <UserIcon className="mr-2 size-4" />
                            {t('profile.editProfile', 'Edit Profile')}
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                        onClick={handleLogout}
                        className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/20"
                    >
                        <LogOutIcon className="mr-2 size-4" />
                        {t('header.logout', 'Logout')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <UserProfileModal open={isProfileOpen} onOpenChange={setIsProfileOpen} />
        </>
    )
}
