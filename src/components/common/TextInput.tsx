"use client";

import React from "react";

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leadingIcon?: React.ReactNode;
  trailingAction?: React.ReactNode;
  cipherFont?: boolean;
}

export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(
  (
    {
      label,
      leadingIcon,
      trailingAction,
      error,
      cipherFont = false,
      className = "",
      id,
      ...props
    },
    ref
  ) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={id}
            className="text-[12px] font-medium text-[#A8A1B0] tracking-wide"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leadingIcon && (
            <span className="absolute left-3.5 text-[#A8A1B0] pointer-events-none z-10 flex items-center">
              {leadingIcon}
            </span>
          )}
          <input
            ref={ref}
            id={id}
            className={`
              w-full h-[52px] bg-[#0D0912] border border-white/10
              text-[#F5F3F7] placeholder:text-[#A8A1B0]/50
              ${leadingIcon ? "pl-10" : "pl-4"}
              ${trailingAction ? "pr-12" : "pr-4"}
              rounded-xl text-[14px] outline-none
              ${cipherFont ? "font-mono tracking-[0.1em]" : ""}
              transition-all duration-200
              focus:border-[#00E5FF]/50 focus:bg-[#0f0c17]
              ${error ? "border-[#EF4444]/50" : ""}
              ${className}
            `}
            {...props}
          />
          {trailingAction && (
            <div className="absolute right-1.5 z-10">{trailingAction}</div>
          )}
        </div>
        {error && (
          <p className="text-[12px] text-[#f87171]">{error}</p>
        )}
      </div>
    );
  }
);

TextInput.displayName = "TextInput";
