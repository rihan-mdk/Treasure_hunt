"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Radar, BookOpen, LayoutGrid } from "lucide-react";

const navItems = [
  { icon: Radar, label: "Radar", href: "/dashboard" },
  { icon: BookOpen, label: "Manual", href: "/field-guide" },
  { icon: LayoutGrid, label: "Status", href: "/" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-[#110B18]/95 backdrop-blur-xl border-t border-white/[0.06]">
      <div
        className="flex justify-around items-center h-[60px]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 min-w-[64px] min-h-[44px] px-3 transition-all duration-200 ${
                isActive ? "text-[#00E5FF]" : "text-[#A8A1B0] hover:text-[#F5F3F7]"
              }`}
            >
              <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
              <span className="text-[10px] tracking-wide uppercase font-medium">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
