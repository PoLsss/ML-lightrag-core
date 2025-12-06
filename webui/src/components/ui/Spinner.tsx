import * as React from 'react'
import { cn } from '@/lib/utils'

function Spinner({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex items-center justify-center', className)} {...props}>
      <div
        className="inline-block animate-spin rounded-full border-[3px] border-solid border-current border-t-transparent size-6 text-primary"
        role="status"
        aria-label="loading"
      >
        <span className="sr-only">Loading...</span>
      </div>
    </div>
  )
}

export { Spinner }
