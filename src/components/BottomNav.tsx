'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/', label: 'Race', icon: '🏁' },
  { href: '/history', label: 'History', icon: '📈' },
  { href: '/group', label: 'Group', icon: '👥' },
]

export default function BottomNav() {
  const path = usePathname()
  return (
    <nav className="nav" aria-label="Main">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={path === t.href ? 'page' : undefined}>
          <span className="ico" aria-hidden>{t.icon}</span>
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
