'use client'

import { ThemeProvider as NextThemeProvider } from 'next-themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider
      attribute="data-theme"
      storageKey="stackpulse-theme"
      defaultTheme="dark"
      enableSystem
      enableColorScheme
      disableTransitionOnChange
      scriptProps={{ type: typeof window === 'undefined' ? 'text/javascript' : 'text/plain' }}
    >
      {children}
    </NextThemeProvider>
  )
}
