"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { QueueIcon, SettingsIcon } from "@/components/icons";

const NAV_ITEMS = [
  { href: "/", label: "Morning Queue", icon: QueueIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-2.5">
      <Link href="/" className="text-sm font-semibold text-persian-blue">
        Probabl Ptr
      </Link>
      <div className="flex items-center gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                isActive ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
