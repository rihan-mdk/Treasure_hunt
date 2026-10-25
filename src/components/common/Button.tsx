"use client";

import React from "react";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "default" | "lg";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className = "",
      variant = "primary",
      size = "default",
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      ...props
    },
    ref
  ) => {
    const base =
      "inline-flex items-center justify-center font-semibold tracking-wide transition-all duration-150 select-none cursor-pointer disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] rounded-xl gap-2";

    const sizes = {
      sm: "h-10 px-4 text-[13px]",
      default: "h-[52px] px-5 text-[14px]",
      lg: "h-14 px-6 text-[15px]",
    };

    const variants = {
      primary:
        "bg-[#00E5FF] text-[#050505] shadow-[0_0_20px_rgba(0,229,255,0.25)] hover:bg-[#33ecff] hover:shadow-[0_0_28px_rgba(0,229,255,0.35)]",
      secondary:
        "bg-[#18111F] border border-white/10 text-[#F5F3F7] hover:bg-[#1f1628] hover:border-white/15",
      ghost:
        "bg-transparent text-[#A8A1B0] hover:text-[#F5F3F7] hover:bg-white/[0.06]",
      danger:
        "bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#f87171] hover:bg-[#EF4444]/20",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          leftIcon && <span className="shrink-0">{leftIcon}</span>
        )}
        <span>{children}</span>
        {!isLoading && rightIcon && (
          <span className="shrink-0">{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
