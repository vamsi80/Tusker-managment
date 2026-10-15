'use client'

import { useEffect, useState } from 'react'
import { MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export default function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Use a fixed value (false for light) until mounted to ensure hydration matches server
  const isDark = mounted ? (resolvedTheme === 'dark') : false

  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark')

  return (
    <>
      <div aria-hidden={!mounted}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              variant="outline"
              pressed={isDark}
              onPressedChange={toggleTheme}
              aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
              className="relative inline-flex items-center justify-center size-11 rounded-full border border-white/70 bg-card shadow-md dark:border-border p-0 hover:bg-card data-[state=on]:bg-card focus:outline-none"
            >
              {/* Shows the mode a click switches to: moon in light, sun in dark. */}
              <SunIcon
                size={18}
                aria-hidden="true"
                className={`transition-transform duration-200 ease-out
                ${isDark ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}
                `}
              />

              {/* Positioned absolutely so the two icons overlap. */}
              <MoonIcon
                size={18}
                aria-hidden="true"
                className={`absolute transition-transform duration-200 ease-out
                ${isDark ? 'opacity-0 scale-75' : 'opacity-100 scale-100'}
                `}
              />
            </Toggle>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[11px] font-medium">
            <p>Switch to {isDark ? 'Light' : 'Dark'} Mode</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </>
  )
}

