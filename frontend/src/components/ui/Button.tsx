import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "warning";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-cyan text-bg-deep hover:bg-cyan/90 shadow-[0_0_0_1px_rgb(34_211_238/0.4),0_8px_24px_-12px_rgb(34_211_238/0.6)]",
  secondary: "border border-line-strong bg-panel-2/70 text-text hover:border-cyan/50 hover:bg-panel-2",
  ghost: "text-muted hover:bg-white/5 hover:text-text",
  danger: "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20",
  warning: "border border-warn/40 bg-warn/10 text-warn hover:bg-warn/20",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `inline-flex shrink-0 select-none items-center justify-center rounded-(--radius-control) font-medium transition duration-(--duration-fast) disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, icon, className = "", children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

interface ButtonLinkProps extends LinkProps {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export function ButtonLink({ variant = "primary", size = "md", icon, className = "", children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
