'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ComputerIcon, Moon02Icon, Sun03Icon, Tick02Icon } from 'hugeicons-react'
import { useTheme } from 'next-themes'

const choices = [
  { value: 'dark', label: 'Dark', icon: Moon02Icon },
  { value: 'light', label: 'Light', icon: Sun03Icon },
  { value: 'system', label: 'System', icon: ComputerIcon },
] as const

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Choose theme"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-ruling bg-shade text-dust transition-colors hover:border-edge hover:bg-lift hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
        >
          <Moon02Icon className="hidden size-4 dark:block" aria-hidden="true" />
          <Sun03Icon className="size-4 dark:hidden" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 min-w-40 rounded-md border border-ruling bg-shade p-1 font-mono text-[12px] text-ink shadow-lg"
        >
          <DropdownMenu.Label className="px-2.5 py-2 text-[10px] tracking-widest text-fade uppercase">
            appearance
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={theme ?? 'dark'} onValueChange={setTheme}>
            {choices.map(({ value, label, icon: Icon }) => (
              <DropdownMenu.RadioItem
                key={value}
                value={value}
                className="relative flex cursor-pointer items-center gap-2.5 rounded-sm py-2 pr-8 pl-2.5 outline-none select-none data-[highlighted]:bg-lift data-[highlighted]:text-lime data-[state=checked]:text-lime"
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
                <DropdownMenu.ItemIndicator className="absolute right-2.5">
                  <Tick02Icon className="size-3.5" aria-hidden="true" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
