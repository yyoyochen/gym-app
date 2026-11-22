// A small (i) that opens a sheet explaining something on the page. The visual
// button is 20 px; its hit area is the 48 px touch minimum (like the toggle).
import { useState, type ReactNode } from 'react';
import { Sheet } from './Sheet';

export function InfoButton({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="info-btn" aria-label={label} aria-haspopup="dialog" onClick={() => setOpen(true)}>i</button>
      <Sheet open={open} title={title ?? label} onClose={() => setOpen(false)}>
        <div className="info-body quiet">{children}</div>
      </Sheet>
    </>
  );
}
