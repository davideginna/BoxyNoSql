import { Fragment, type ReactNode } from 'react';

/** Inline `**bold**` and `` `code` `` spans within one line of text. */
function renderInline(text: string): ReactNode[] {
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    parts.push(
      token.startsWith('**')
        ? <strong key={key++}>{token.slice(2, -2)}</strong>
        : <code key={key++}>{token.slice(1, -1)}</code>
    );
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/**
 * Renders the small markdown subset the project's own release notes use —
 * `### heading` lines, `- ` bullets, inline `**bold**`/`` `code` `` — as JSX.
 * Not a general markdown parser: CHANGELOG.md and GitHub release bodies are
 * the only input, and they never use anything beyond this.
 */
export function renderMarkdownLite(raw: string): ReactNode {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let key = 0;

  const flushList = () => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={key++}>
        {list.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
      </ul>
    );
    list = [];
  };

  for (const line of raw.split('\n')) {
    const heading = /^###\s+(.+)/.exec(line);
    const bullet = /^-\s+(.+)/.exec(line);
    if (heading) {
      flushList();
      blocks.push(<h4 key={key++}>{heading[1]}</h4>);
    } else if (bullet) {
      list.push(bullet[1]);
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      blocks.push(<p key={key++}>{renderInline(line)}</p>);
    }
  }
  flushList();
  return <Fragment>{blocks}</Fragment>;
}
