// A small (i) that opens a sheet explaining something on the page: a pixel
// lowercase i in a ring. The visual button is 22 px; its hit area is the 48 px touch minimum (like the toggle).
import { useState, type ReactNode } from 'react';
import { Sheet } from './Sheet';
import { PixelIcon } from './PixelIcon';

export function InfoButton({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="info-btn" aria-label={label} aria-haspopup="dialog" onClick={() => setOpen(true)}><PixelIcon name="info" /></button>
      <Sheet open={open} title={title ?? label} onClose={() => setOpen(false)}>
        <div className="info-body quiet">{children}</div>
      </Sheet>
    </>
  );
}
