import React, { useCallback, useRef, useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface ResizablePanelProps {
  /** Direction of the split: horizontal = left|right, vertical = top|bottom */
  direction: 'horizontal' | 'vertical'
  /** Initial size of the first panel in percent (0-100) */
  defaultSize?: number
  /** Minimum size of the first panel in percent */
  minSize?: number
  /** Maximum size of the first panel in percent */
  maxSize?: number
  /** First panel content */
  first: React.ReactNode
  /** Second panel content */
  second: React.ReactNode
  /** Additional class for container */
  className?: string
}

export function ResizablePanel({
  direction,
  defaultSize = 50,
  minSize = 15,
  maxSize = 85,
  first,
  second,
  className,
}: ResizablePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(defaultSize)
  const isDragging = useRef(false)

  const isHorizontal = direction === 'horizontal'

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isDragging.current = true
      document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [isHorizontal]
  )

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      let newSize: number

      if (isHorizontal) {
        newSize = ((e.clientX - rect.left) / rect.width) * 100
      } else {
        newSize = ((e.clientY - rect.top) / rect.height) * 100
      }

      newSize = Math.max(minSize, Math.min(maxSize, newSize))
      setSize(newSize)
    }

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isHorizontal, minSize, maxSize])

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex overflow-hidden',
        isHorizontal ? 'flex-row' : 'flex-col',
        className
      )}
      style={{ height: '100%', width: '100%' }}
    >
      {/* First panel */}
      <div
        className="overflow-hidden"
        style={
          isHorizontal
            ? { width: `${size}%`, minWidth: 0 }
            : { height: `${size}%`, minHeight: 0 }
        }
      >
        {first}
      </div>

      {/* Divider */}
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          'shrink-0 bg-border hover:bg-primary/30 transition-colors relative z-10',
          isHorizontal
            ? 'w-1 cursor-col-resize hover:w-1.5'
            : 'h-1 cursor-row-resize hover:h-1.5'
        )}
      />

      {/* Second panel */}
      <div
        className="overflow-hidden flex-1"
        style={{ minWidth: 0, minHeight: 0 }}
      >
        {second}
      </div>
    </div>
  )
}
