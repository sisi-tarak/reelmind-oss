import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium leading-4 whitespace-nowrap', {
  variants: {
    variant: {
      default: 'bg-muted text-foreground border border-border',
      new: 'bg-highlight text-highlight-foreground',
      done: 'bg-success/10 text-success',
      failed: 'bg-destructive/10 text-destructive',
      ink: 'bg-primary text-primary-foreground',
      outline: 'border border-border text-muted-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
