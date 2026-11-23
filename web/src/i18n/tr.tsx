// tr(): a sentence with React parts inside it (a link, a bold number). The
// translation decides where each {part} sits, since Chinese word order differs.
import { Fragment, type ReactNode } from 'react';
import { getLang } from './lang';
import { ZH } from './zh';

export function tr(en: string, parts: Record<string, ReactNode>): ReactNode {
  const s = getLang() === 'zh' ? ZH[en] ?? en : en;
  const out: ReactNode[] = [];
  const re = /\{(\w+)\}/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(<Fragment key={m.index}>{m[1] in parts ? parts[m[1]] : m[0]}</Fragment>);
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return <>{out}</>;
}
