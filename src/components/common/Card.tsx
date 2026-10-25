import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "base" | "elevated" | "active" | "locked";
  children: React.ReactNode;
  padding?: string;
}

export function Card({
  variant = "base",
  className = "",
  padding = "p-4",
  children,
  ...props
}: CardProps) {
  const variants = {
    base: "bg-[#110B18] border border-white/[0.07]",
    elevated: "bg-[#18111F] border border-white/[0.09]",
    active: "bg-[#18111F] border border-[#00E5FF]/25 shadow-[0_0_20px_rgba(0,229,255,0.08)]",
    locked: "bg-[#0D0912] border border-white/[0.04] opacity-70",
  };

  return (
    <div
      className={`rounded-2xl ${padding} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
