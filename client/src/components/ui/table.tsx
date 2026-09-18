import * as React from "react"

import { cn } from "@/lib/utils"

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => {
  const viewport = React.useRef<HTMLDivElement>(null);
  const id = React.useId();
  const [edges, setEdges] = React.useState({ left: false, right: false });
  const measure = React.useCallback(() => {
    const el = viewport.current;
    if (el) setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
  }, []);
  React.useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    measure();
    return () => observer.disconnect();
  }, [measure]);
  const move = (direction: number) => viewport.current?.scrollBy({ left: direction * Math.max(160, viewport.current.clientWidth * 0.7), behavior: "auto" });
  return <div className="min-w-0 w-full">
    {(edges.left || edges.right) && <div className="flex items-center justify-end gap-2 py-1 text-xs text-muted-foreground" data-testid="table-column-controls">
      <span>More columns</span>
      <button type="button" className="min-h-11 min-w-11 rounded border border-border disabled:opacity-30" aria-label="Previous table columns" aria-controls={id} disabled={!edges.left} onClick={() => move(-1)}>←</button>
      <button type="button" className="min-h-11 min-w-11 rounded border border-border disabled:opacity-30" aria-label="Next table columns" aria-controls={id} disabled={!edges.right} onClick={() => move(1)}>→</button>
    </div>}
  <div ref={viewport} id={id} onScroll={measure} tabIndex={edges.left || edges.right ? 0 : undefined} role={edges.left || edges.right ? "region" : undefined} aria-label={edges.left || edges.right ? "Scrollable table columns" : undefined} className="relative w-full overflow-auto scrollbar-hide focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm tabular-nums", className)}
      {...props}
    />
  </div>
  </div>
})
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn(
      "[&_tr:last-child]:border-0",
      "[&_tr:nth-child(odd)]:bg-white/[0.02]",
      className
    )}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b transition-colors",
      "hover:bg-primary/[0.06]",
      "data-[state=selected]:bg-muted",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-11 px-3 text-left align-middle text-xs font-semibold text-muted-foreground [&:has([role=checkbox])]:pr-0",
      "bg-secondary/40 border-b border-border",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("px-3 py-3 align-middle [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
