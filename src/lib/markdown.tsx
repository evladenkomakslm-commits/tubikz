'use client';
import { useState } from 'react';

/**
 * Tiny markdown-ish renderer for chat messages. Avoids a full markdown
 * parser to keep the bundle small — we only support what Telegram-style
 * chats need:
 *
 *   **bold**         → <strong>
 *   __underline__    → <u>
 *   *italic*         → <em>            (single * around span without spaces)
 *   _italic_         → <em>            (alternative, single _)
 *   ~~strike~~       → <s>
 *   `code`           → <code>          (inline)
 *   ```block```      → <pre><code>     (multi-line)
 *   ||spoiler||      → covered span,   tap to reveal
 *
 * Token order is intentional: longer / more-specific markers are matched
 * first so they don't get gobbled by single-char markers (e.g. ** before *).
 */
type Token =
  | { kind: 'text'; value: string }
  | { kind: 'inline'; tag: 'strong' | 'em' | 'u' | 's' | 'code'; children: Token[] }
  | { kind: 'pre'; value: string }
  | { kind: 'spoiler'; children: Token[] };

const RULES: Array<{
  re: RegExp;
  build: (m: RegExpExecArray) => Token;
}> = [
  // Triple-backtick code block.
  {
    re: /```([\s\S]+?)```/,
    build: (m) => ({ kind: 'pre', value: m[1] }),
  },
  // Inline code.
  {
    re: /`([^`\n]+?)`/,
    build: (m) => ({ kind: 'inline', tag: 'code', children: [{ kind: 'text', value: m[1] }] }),
  },
  // Spoiler — must come before italic so `||` doesn't read as `_` etc.
  {
    re: /\|\|([\s\S]+?)\|\|/,
    build: (m) => ({ kind: 'spoiler', children: parse(m[1]) }),
  },
  // Bold: **text**
  {
    re: /\*\*([^\*\n]+?)\*\*/,
    build: (m) => ({ kind: 'inline', tag: 'strong', children: parse(m[1]) }),
  },
  // Underline: __text__
  {
    re: /__([^_\n]+?)__/,
    build: (m) => ({ kind: 'inline', tag: 'u', children: parse(m[1]) }),
  },
  // Strike: ~~text~~
  {
    re: /~~([^~\n]+?)~~/,
    build: (m) => ({ kind: 'inline', tag: 's', children: parse(m[1]) }),
  },
  // Italic: *text* — tightened so that lone asterisks don't trigger.
  {
    re: /\*([^\s*][^*\n]*?[^\s*]|[^\s*])\*/,
    build: (m) => ({ kind: 'inline', tag: 'em', children: parse(m[1]) }),
  },
  // Italic: _text_
  {
    re: /_([^\s_][^_\n]*?[^\s_]|[^\s_])_/,
    build: (m) => ({ kind: 'inline', tag: 'em', children: parse(m[1]) }),
  },
];

function parse(input: string): Token[] {
  if (!input) return [];

  // Find the earliest match across all rules.
  let earliestIdx = -1;
  let earliestRule: (typeof RULES)[number] | null = null;
  let earliestMatch: RegExpExecArray | null = null;
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    const m = rule.re.exec(input);
    if (m && (earliestIdx === -1 || m.index < earliestIdx)) {
      earliestIdx = m.index;
      earliestRule = rule;
      earliestMatch = m;
    }
  }
  if (!earliestRule || !earliestMatch || earliestIdx === -1) {
    return [{ kind: 'text', value: input }];
  }
  const before = input.slice(0, earliestIdx);
  const after = input.slice(earliestIdx + earliestMatch[0].length);
  const out: Token[] = [];
  if (before) out.push({ kind: 'text', value: before });
  out.push(earliestRule.build(earliestMatch));
  if (after) out.push(...parse(after));
  return out;
}

function Spoiler({ children }: { children: React.ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        setRevealed(true);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setRevealed(true);
        }
      }}
      className={
        revealed
          ? 'inline'
          : 'inline rounded-sm bg-text/30 text-transparent hover:bg-text/40 cursor-pointer select-none transition-colors'
      }
    >
      {children}
    </span>
  );
}

function renderTokens(tokens: Token[], keyPrefix = ''): React.ReactNode[] {
  return tokens.map((t, i) => {
    const k = `${keyPrefix}${i}`;
    if (t.kind === 'text') return <span key={k}>{t.value}</span>;
    if (t.kind === 'pre')
      return (
        <pre
          key={k}
          className="my-1 px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-[13px] font-mono whitespace-pre-wrap break-words"
        >
          <code>{t.value}</code>
        </pre>
      );
    if (t.kind === 'spoiler')
      return <Spoiler key={k}>{renderTokens(t.children, `${k}-`)}</Spoiler>;
    if (t.kind === 'inline') {
      const inner = renderTokens(t.children, `${k}-`);
      switch (t.tag) {
        case 'strong':
          return <strong key={k}>{inner}</strong>;
        case 'em':
          return <em key={k}>{inner}</em>;
        case 'u':
          return <u key={k}>{inner}</u>;
        case 's':
          return <s key={k}>{inner}</s>;
        case 'code':
          return (
            <code
              key={k}
              className="px-1 py-0.5 rounded bg-black/30 border border-white/10 text-[13px] font-mono"
            >
              {inner}
            </code>
          );
      }
    }
    return null;
  });
}

export function RichText({ text }: { text: string }) {
  return <>{renderTokens(parse(text))}</>;
}
