'use client'

import { useState } from 'react'
import { MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Toggle } from '@/components/ui/toggle'

export default function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  // resolvedTheme is the real theme applied ("light" | "dark")

  // initialize mounted in a lazy way so we don't call setState inside an effect.
  // This is safe because this component is "use client" and the initializer runs on the client.
  const [mounted] = useState<boolean>(() => typeof window !== 'undefined')

  // treat resolvedTheme as source of truth once mounted
  const active = mounted ? resolvedTheme : theme || 'light'
  const isDark = active === 'dark'

  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark')

  return (
    <div aria-hidden={!mounted}>
      <Toggle
        variant="outline"
        pressed={isDark}
        onPressedChange={toggleTheme}
        aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-full border-none p-0 focus:outline-none"
      >
        {/* Sun (light) */}
        <SunIcon
          size={16}
          aria-hidden="true"
          className={`transition-transform transition-opacity duration-200 ease-out
            ${isDark ? 'opacity-0 scale-75' : 'opacity-100 scale-100'}
            `}
        />

        {/* Moon (dark) — positioned absolutely so they overlap nicely */}
        <MoonIcon
          size={16}
          aria-hidden="true"
          className={`absolute transition-transform transition-opacity duration-200 ease-out
            ${isDark ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}
            `}
        />
      </Toggle>
    </div>
  )
}
