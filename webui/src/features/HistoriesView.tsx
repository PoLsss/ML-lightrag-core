import { useState } from 'react'
import { useChatStore, Conversation, ChatMessage } from '@/stores/chat'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { 
  MessageSquareIcon, 
  TrashIcon, 
  PencilIcon, 
  SearchIcon,
  ClockIcon,
  MessageCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  UserIcon,
  BotIcon,
  XIcon
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { cn } from '@/lib/utils'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog'

// Message preview component (read-only)
function MessagePreview({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  return (
    <div
      className={cn(
        'flex gap-3',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'shrink-0 size-7 rounded-full flex items-center justify-center',
          isUser ? 'bg-emerald-500' : 'bg-purple-500'
        )}
      >
        {isUser ? (
          <UserIcon className="size-3.5 text-white" />
        ) : (
          <BotIcon className="size-3.5 text-white" />
        )}
      </div>

      {/* Content */}
      <div
        className={cn(
          'max-w-[85%] rounded-xl px-3 py-2 text-sm',
          isUser
            ? 'bg-emerald-500 text-white rounded-tr-sm'
            : 'bg-muted border border-border rounded-tl-sm'
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
        
        {/* Timestamp */}
        <div className={cn(
          'text-[10px] mt-1',
          isUser ? 'text-white/60 text-right' : 'text-muted-foreground'
        )}>
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </div>
      </div>
    </div>
  )
}

export default function HistoriesView() {
  const { t } = useTranslation()
  const conversations = useChatStore.use.conversations()
  const deleteConversation = useChatStore.use.deleteConversation()
  const renameConversation = useChatStore.use.renameConversation()

  const [searchQuery, setSearchQuery] = useState('')
  const [expandedConversationId, setExpandedConversationId] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [newTitle, setNewTitle] = useState('')

  // Filter conversations by search query
  const filteredConversations = conversations.filter(conv => 
    conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.messages.some(msg => 
      msg.content?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  )

  const handleToggleExpand = (convId: string) => {
    setExpandedConversationId(prev => prev === convId ? null : convId)
  }

  const handleDeleteClick = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedConversation(conv)
    setDeleteDialogOpen(true)
  }

  const handleRenameClick = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedConversation(conv)
    setNewTitle(conv.title)
    setRenameDialogOpen(true)
  }

  const confirmDelete = () => {
    if (selectedConversation) {
      deleteConversation(selectedConversation.id)
      if (expandedConversationId === selectedConversation.id) {
        setExpandedConversationId(null)
      }
    }
    setDeleteDialogOpen(false)
    setSelectedConversation(null)
  }

  const confirmRename = () => {
    if (selectedConversation && newTitle.trim()) {
      renameConversation(selectedConversation.id, newTitle.trim())
    }
    setRenameDialogOpen(false)
    setSelectedConversation(null)
    setNewTitle('')
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 1) {
      return 'Yesterday'
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'long' })
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    }
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/30">
            <ClockIcon className="size-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
              {t('header.histories', 'Chat Histories')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {conversations.length} {conversations.length === 1 ? 'conversation' : 'conversations'}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-auto p-4">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageCircleIcon className="size-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">
              {searchQuery ? 'No conversations found' : 'No chat history yet'}
            </p>
            <p className="text-sm">
              {searchQuery ? 'Try a different search term' : 'Start chatting to create history'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredConversations.map((conv) => {
              const isExpanded = expandedConversationId === conv.id
              
              return (
                <div key={conv.id} className="space-y-0">
                  {/* Conversation Card */}
                  <div
                    onClick={() => handleToggleExpand(conv.id)}
                    className={cn(
                      'group relative p-4 border-2 transition-all duration-200 cursor-pointer',
                      isExpanded 
                        ? 'rounded-t-xl border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 border-b-0'
                        : 'rounded-xl border-border bg-card hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-lg hover:shadow-emerald-500/10 hover:bg-muted/50'
                    )}
                  >
                    {/* Title and Actions */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <MessageSquareIcon className="size-4 text-emerald-500 flex-shrink-0" />
                        <h3 className="font-semibold truncate">{conv.title}</h3>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <div className={cn(
                          "flex items-center gap-1 transition-opacity",
                          isExpanded ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        )}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
                            onClick={(e) => handleRenameClick(conv, e)}
                          >
                            <PencilIcon className="size-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 hover:bg-red-100 dark:hover:bg-red-900/50 hover:text-red-500"
                            onClick={(e) => handleDeleteClick(conv, e)}
                          >
                            <TrashIcon className="size-3" />
                          </Button>
                        </div>
                        
                        {/* Expand/Collapse Icon */}
                        <div className={cn(
                          "size-7 flex items-center justify-center rounded-md transition-colors",
                          isExpanded ? "bg-emerald-500 text-white" : "text-muted-foreground"
                        )}>
                          {isExpanded ? (
                            <ChevronUpIcon className="size-4" />
                          ) : (
                            <ChevronDownIcon className="size-4" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Preview (only when collapsed) */}
                    {!isExpanded && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {conv.messages.find(m => m.role === 'user')?.content || 'No preview available'}
                      </p>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1">
                          <MessageCircleIcon className="size-3" />
                          {conv.messages.length} messages
                        </span>
                        <span className="flex items-center gap-1">
                          <ClockIcon className="size-3" />
                          {formatDate(conv.updatedAt)}
                        </span>
                      </div>
                      
                      {!isExpanded && (
                        <span className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs">
                          Click to view
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded Messages Panel */}
                  {isExpanded && (
                    <div className="border-2 border-t-0 border-emerald-500 rounded-b-xl bg-card overflow-hidden">
                      {/* Panel Header */}
                      <div className="flex items-center justify-between px-4 py-2 bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-200 dark:border-emerald-800">
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          Conversation History (Read-only)
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedConversationId(null)
                          }}
                        >
                          <XIcon className="size-3.5" />
                        </Button>
                      </div>
                      
                      {/* Messages */}
                      <ScrollArea className="h-80">
                        <div className="p-4 space-y-3">
                          {conv.messages.map((msg) => (
                            <MessagePreview key={msg.id} message={msg} />
                          ))}
                        </div>
                      </ScrollArea>

                      {/* Panel Footer */}
                      <div className="px-4 py-3 bg-muted/30 border-t border-border">
                        <p className="text-xs text-muted-foreground text-center italic">
                          This is a read-only view of the conversation history
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conversation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedConversation?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Conversation</DialogTitle>
          </DialogHeader>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Enter new title..."
            onKeyDown={(e) => e.key === 'Enter' && confirmRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmRename} disabled={!newTitle.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
