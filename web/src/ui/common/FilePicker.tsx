import { useRef, useState } from 'react';
import { PixelIcon } from '../kit/PixelIcon';

/** A button that opens the file chooser and hands back the file's text. */
export function FilePicker({ label, accept, onText, className = '' }: {
  label: string; accept?: string; onText: (text: string, file: File) => void | Promise<void>; className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  return (
    <div className="file-picker">
      <button type="button" className={`btn block split ${className}`} onClick={() => ref.current?.click()}>
        <span>{label}</span><PixelIcon name="import" />
      </button>
      {name && <span className="file-name">{name}</span>}
      <input ref={ref} type="file" accept={accept} hidden onChange={async e => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        setName(f.name);
        await onText(await f.text(), f);
      }} />
    </div>
  );
}
