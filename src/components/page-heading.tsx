import { cn } from "cn";
import type { ComponentProps } from "react";

export const PageHeading = ({
  className,
  children,
  ...props
}: ComponentProps<"h1">) => (
  <h1
    className={cn(
      "font-heading mb-6 text-[clamp(38px,4.5vw,62px)] leading-[1.12] font-normal tracking-[-0.035em] text-balance",
      className
    )}
    {...props}
  >
    {children}
  </h1>
);
