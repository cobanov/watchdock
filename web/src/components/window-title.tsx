// Window-chrome card header: three gray dots and a mono label.
export function WindowTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex gap-1.5">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
      </span>
      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {children}
      </span>
    </div>
  )
}
