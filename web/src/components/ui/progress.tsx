import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const progressBarVariants = cva("h-full rounded-full transition-all", {
  variants: {
    tone: {
      default: "bg-primary",
      success: "bg-success",
      warning: "bg-warning",
      danger: "bg-danger",
    },
  },
  defaultVariants: {
    tone: "default",
  },
})

interface ProgressProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof progressBarVariants> {
  value: number
}

function Progress({ className, value, tone, ...props }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <div className={cn(progressBarVariants({ tone }))} style={{ width: `${clamped}%` }} />
    </div>
  )
}

export { Progress }
