/**
 * DocumentScopeToggle Component
 * 
 * A toggle switch component for changing document access scope between
 * 'public' and 'internal'. Only visible to Admin and Teacher roles.
 */

import { useState, useCallback } from 'react'
import { Switch } from '@/components/ui/Switch'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/AlertDialog'
import { Loader2, Globe, Lock, RefreshCw } from 'lucide-react'
import { updateDocumentScope, syncDocumentScope } from '@/api/scope'
import { toast } from 'sonner'

interface DocumentScopeToggleProps {
    docId: string
    currentScope: 'public' | 'internal'
    userRole?: string
    onScopeChange?: (newScope: 'public' | 'internal') => void
    showLabel?: boolean
    size?: 'sm' | 'md' | 'lg'
}

/**
 * Scope Badge Component
 * Displays the current scope with appropriate styling
 */
export function ScopeBadge({
    scope,
    size = 'sm'
}: {
    scope: 'public' | 'internal'
    size?: 'sm' | 'md' | 'lg'
}) {
    const isPublic = scope === 'public'
    const sizeClasses = {
        sm: 'text-xs px-2 py-0.5',
        md: 'text-sm px-2.5 py-1',
        lg: 'text-base px-3 py-1.5'
    }

    return (
        <Badge
            variant={isPublic ? 'default' : 'secondary'}
            className={`${sizeClasses[size]} flex items-center gap-1 font-medium`}
        >
            {isPublic ? (
                <>
                    <Globe className="w-3 h-3" />
                    Public
                </>
            ) : (
                <>
                    <Lock className="w-3 h-3" />
                    Internal
                </>
            )}
        </Badge>
    )
}

/**
 * Main DocumentScopeToggle Component
 */
export function DocumentScopeToggle({
    docId,
    currentScope,
    userRole,
    onScopeChange,
    showLabel = true,
    size = 'md'
}: DocumentScopeToggleProps) {
    const [scope, setScope] = useState(currentScope)
    const [isLoading, setIsLoading] = useState(false)
    const [showConfirmDialog, setShowConfirmDialog] = useState(false)
    const [pendingScope, setPendingScope] = useState<'public' | 'internal' | null>(null)

    // Check if user has permission to toggle scope
    const canToggle = userRole === 'admin' || userRole === 'teacher'

    const handleToggleClick = useCallback(() => {
        if (!canToggle || isLoading) return

        const newScope = scope === 'public' ? 'internal' : 'public'
        setPendingScope(newScope)
        setShowConfirmDialog(true)
    }, [canToggle, isLoading, scope])

    const confirmScopeChange = useCallback(async () => {
        if (!pendingScope) return

        setIsLoading(true)
        setShowConfirmDialog(false)

        try {
            await updateDocumentScope(docId, pendingScope)
            setScope(pendingScope)
            onScopeChange?.(pendingScope)
            toast.success(`Document scope changed to ${pendingScope}`)
        } catch (error: any) {
            console.error('Failed to update scope:', error)
            toast.error(error.response?.data?.detail || 'Failed to update document scope')
        } finally {
            setIsLoading(false)
            setPendingScope(null)
        }
    }, [docId, pendingScope, onScopeChange])

    const handleSync = useCallback(async () => {
        if (userRole !== 'admin' || isLoading) return

        setIsLoading(true)
        try {
            await syncDocumentScope(docId)
            toast.success('Document scope synced to Neo4j')
        } catch (error: any) {
            console.error('Failed to sync scope:', error)
            toast.error(error.response?.data?.detail || 'Failed to sync document scope')
        } finally {
            setIsLoading(false)
        }
    }, [docId, userRole, isLoading])

    // If user doesn't have permission, just show the badge
    if (!canToggle) {
        return <ScopeBadge scope={scope} size={size === 'lg' ? 'md' : 'sm'} />
    }

    return (
        <>
            <div className="flex items-center gap-2">
                {showLabel && (
                    <span className="text-sm text-muted-foreground">
                        {scope === 'public' ? 'Public' : 'Internal'}
                    </span>
                )}

                <Switch
                    checked={scope === 'public'}
                    onCheckedChange={handleToggleClick}
                    disabled={isLoading}
                    className={isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                />

                {isLoading && (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                )}

                {/* Admin-only sync button */}
                {userRole === 'admin' && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={handleSync}
                        disabled={isLoading}
                        title="Sync scope to Neo4j"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </Button>
                )}
            </div>

            {/* Confirmation Dialog */}
            <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Change Document Scope</AlertDialogTitle>
                        <AlertDialogDescription>
                            {pendingScope === 'public' ? (
                                <>
                                    Are you sure you want to make this document <strong>public</strong>?
                                    <br />
                                    <span className="text-amber-600 dark:text-amber-400">
                                        This will allow all students to access this document.
                                    </span>
                                </>
                            ) : (
                                <>
                                    Are you sure you want to make this document <strong>internal</strong>?
                                    <br />
                                    <span className="text-blue-600 dark:text-blue-400">
                                        Only teachers and admins will be able to access this document.
                                    </span>
                                </>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setPendingScope(null)}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={confirmScopeChange}>
                            Confirm Change
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}

export default DocumentScopeToggle
