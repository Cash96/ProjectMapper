"use client";

import { useState } from "react";

export function ResetIntelligenceButton({ action }: { action: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="control-button-secondary border-[rgba(187,77,63,0.22)] text-[#9f3d32] hover:bg-[rgba(187,77,63,0.08)]" onClick={() => setOpen(true)}>
        Reset Intelligence
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(21,34,48,0.42)] p-4" onClick={() => setOpen(false)}>
          <div className="surface-card-strong w-full max-w-xl rounded-[1.5rem] p-5 sm:p-6" onClick={(event) => event.stopPropagation()}>
            <p className="section-label text-[var(--signal-red)]">Danger zone</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--ink-950)]">Reset Project Intelligence</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--ink-700)]">
              This will delete ALL studies, features, mappings, doctrine versions, reports, and AI outputs for this project. This cannot be undone.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button type="button" className="control-button-secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <form action={action} method="post">
                <button type="submit" className="control-button-primary bg-[var(--signal-red)] hover:bg-[#8f342a]">
                  Confirm reset
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}