import { Fragment } from 'react';

const NUM = /(\d+(?:\.\d+)?(?:\s?kg)?(?:\s?[×x]\s?\d+\+?)?)/g;

/** Words stay sans, values go mono (DESIGN §3): wraps numerals in a sentence. */
export function MonoNums({ text }: { text: string }) {
  const parts = text.split(NUM);
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <span key={i} className="num-inline">{p}</span> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

export const CHECK = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="check"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
