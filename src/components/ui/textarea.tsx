import * as React from "react"
import { cn } from "../../lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[100px] w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 ring-offset-white transition-colors placeholder:text-gray-500 hover:border-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0 focus-visible:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-[#292929] dark:text-gray-100 dark:ring-offset-gray-950 dark:placeholder:text-gray-400 dark:hover:border-gray-500 dark:focus-visible:ring-blue-400 dark:focus-visible:border-blue-400",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }

