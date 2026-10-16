'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserCircleIcon, Logout01Icon, Delete02Icon, Alert02Icon } from 'hugeicons-react'
import { deleteAccountAction, signOutAction } from '@/lib/actions'
import { PulseLoader } from '@/components/ui/pulse-loader'

export function UserMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleSignOut = () => {
    startTransition(async () => {
      await signOutAction()
    })
  }

  const handleDelete = () => {
    setError(null)
    startTransition(async () => {
      const result = await deleteAccountAction()
      if (!result.ok) {
        setError(result.error)
        return
      }
      await signOutAction()
      router.push('/')
    })
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 font-mono text-[11px] text-fade hover:text-ink transition-colors px-2 py-1 rounded-sm hover:bg-shade"
        aria-label={`Account menu for ${email}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <UserCircleIcon className="w-3.5 h-3.5" />
        <span className="hidden truncate max-w-[180px] sm:inline">{email}</span>
        <span className="text-mute">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <>
          <button
            className="fixed inset-0 z-30 cursor-default"
            aria-hidden
            onClick={() => {
              setOpen(false)
              setConfirmDelete(false)
              setError(null)
            }}
          />
          <div
            role="menu"
            className="absolute right-0 mt-2 w-72 frame z-40 overflow-hidden animate-fade-up"
          >
            <div className="px-4 py-3 border-b border-line">
              <div className="font-mono text-[10px] text-fade tracking-[0.2em] uppercase">
                signed in as
              </div>
              <div className="mt-0.5 font-mono text-[12px] text-ink truncate">{email}</div>
            </div>

            <div className="p-1.5">
              <button
                role="menuitem"
                onClick={handleSignOut}
                disabled={isPending}
                className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-sm font-mono text-[12.5px] text-dust hover:text-ink hover:bg-lift disabled:opacity-60 transition-colors"
              >
                <Logout01Icon className="w-3.5 h-3.5" />
                <span>sign out</span>
              </button>
            </div>

            <div className="border-t border-line p-1.5">
              {!confirmDelete ? (
                <button
                  role="menuitem"
                  onClick={() => setConfirmDelete(true)}
                  className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-sm font-mono text-[12.5px] text-rose/80 hover:text-rose hover:bg-rose/5 transition-colors"
                >
                  <Delete02Icon className="w-3.5 h-3.5" />
                  <span>delete account</span>
                </button>
              ) : (
                <div className="px-3 py-2.5 space-y-2.5">
                  <div className="flex items-start gap-2 font-mono text-[12px]">
                    <Alert02Icon className="w-3.5 h-3.5 text-rose shrink-0 mt-0.5" />
                    <p className="text-dust leading-snug">
                      this deletes your account, stack, and read history. cannot be undone.
                    </p>
                  </div>
                  {error && (
                    <p className="font-mono text-[11px] text-rose">
                      <span className="text-fade">→ </span>
                      {error}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setConfirmDelete(false)
                        setError(null)
                      }}
                      disabled={isPending}
                      className="flex-1 rounded-sm border border-ruling bg-shade px-2.5 py-1.5 font-mono text-[11.5px] text-dust hover:bg-lift transition-colors"
                    >
                      cancel
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={isPending}
                      className="flex-1 inline-flex items-center justify-center rounded-sm bg-rose px-2.5 py-1.5 font-mono text-[11.5px] font-semibold text-void hover:bg-rose/85 disabled:opacity-80 transition-colors"
                    >
                      {isPending ? (
                        <PulseLoader size="inline" tone="dark" label="deleting…" />
                      ) : (
                        'yes, delete'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
