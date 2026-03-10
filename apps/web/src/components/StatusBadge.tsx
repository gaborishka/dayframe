const statusCopy: Record<string, string> = {
  queued: "Preparing your issue",
  retry_scheduled: "Retrying your issue",
  ingesting: "Collecting your day",
  generating_script: "Writing your comic",
  validating: "Checking privacy and format",
  rendering_panels: "Drawing the panels",
  composing: "Assembling the page",
  storing: "Saving your comic",
  ready: "Your comic is ready",
  failed: "We couldn't finish this issue"
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const label = status ? statusCopy[status] ?? status : "Waiting to begin";

  return (
    <div className="inline-flex items-center rounded-full border border-amber-900/15 bg-white/80 px-4 py-2 text-sm font-medium text-stone-700 shadow-sm">
      {label}
    </div>
  );
}
