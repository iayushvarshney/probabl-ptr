"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { QueueIcon, SettingsIcon } from "@/components/icons";

const NAV_ITEMS = [
  { href: "/", label: "Morning Queue", icon: QueueIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function NavBar() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return (
    <nav className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
      <Link href="/" className="flex items-center gap-2">
        <Image src="/logo-mark.png" alt="" width={28} height={28} className="h-7 w-7" priority />
        <span className="text-sm font-semibold text-persian-blue">Probabl Ptr</span>
      </Link>
      <div className="flex items-center gap-1.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-persian-blue/10 font-medium text-persian-blue"
                  : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
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
