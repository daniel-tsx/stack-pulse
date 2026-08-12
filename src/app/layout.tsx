import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Suspense } from 'react'
import { Providers } from './providers'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const title = 'StackPulse - GitHub release tracker for breaking changes and upgrade notes'
const description =
  'Track GitHub releases for React, Next.js, Tailwind, Drizzle, and any library you ship with. StackPulse turns changelogs into AI-distilled digests with breaking changes, deprecations, migration notes, and source links.'

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: title,
    template: '%s · StackPulse',
  },
  description,
  applicationName: 'StackPulse',
  generator: 'Next.js',
  category: 'developer tools',
  keywords: [
    'github releases',
    'github release tracker',
    'changelog summary',
    'ai changelog',
    'ai release notes',
    'release notes',
    'dependency updates',
    'library updates',
    'framework releases',
    'breaking changes',
    'deprecation tracker',
    'upgrade checklist',
    'migration guide',
    'developer tools',
    'open source release notes',
    'react release notes',
    'next.js release notes',
    'tailwind release notes',
    'package updates',
  ],
  authors: [{ name: 'Daniel', url: 'https://github.com/daniel-ctn' }],
  creator: 'Daniel',
  publisher: 'StackPulse',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title,
    description,
    url: appUrl,
    siteName: 'StackPulse',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    creator: '@daniel_ctn',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
      </body>
    </html>
  )
}
