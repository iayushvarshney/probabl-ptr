"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"

import { CheckIcon } from "@/components/icons"
import { cn } from "@/lib/utils"

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[calc(var(--radius-sm)-2px)] border border-border bg-background outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[checked]:border-persian-blue data-[checked]:bg-persian-blue",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex text-white">
        <CheckIcon className="size-3" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
