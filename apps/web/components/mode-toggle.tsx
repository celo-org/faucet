import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useTheme } from 'next-themes'
import { useCallback } from 'react'

export function ModeToggle() {
  const { theme, setTheme } = useTheme()

  const onClick = useCallback(() => {
    let oldTheme = theme
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
      .matches
      ? 'dark'
      : 'light'

    if (theme === 'system' || theme === undefined) {
      oldTheme = systemTheme
    }

    const newTheme = oldTheme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
  }, [theme])

  return (
    <Button size="icon" onClick={onClick}>
      <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
