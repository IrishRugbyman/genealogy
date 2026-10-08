import { Fragment, type ReactNode } from 'react'

/* An act's transcription comes as the small Markdown the research fiches use:
   `## ` headings, `> ` quoted passages (the act's own words), **bold** and *italic*
   for names and Latin, `|` tables for the kinship trees, `[…]` for gaps. No library
   for that: a renderer of exactly this subset, which also means nothing in the text
   can inject markup. Links are reduced to their text (their targets are research
   files the site does not serve). */

type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'para'; lines: string[]; quoted: boolean }
  | { kind: 'table'; rows: string[][] }

function parse(md: string): Block[] {
  const blocks: Block[] = []
  let para: { lines: string[]; quoted: boolean } | null = null
  let table: string[][] | null = null
  const flush = () => {
    if (para?.lines.length) blocks.push({ kind: 'para', ...para })
    if (table?.length) blocks.push({ kind: 'table', rows: table })
    para = null
    table = null
  }
  for (const raw of md.split('\n')) {
    const quoted = raw.startsWith('>')
    const line = quoted ? raw.replace(/^>\s?/, '') : raw
    if (line.startsWith('## ')) {
      flush()
      blocks.push({ kind: 'heading', text: line.slice(3).trim() })
    } else if (line.trim().startsWith('|')) {
      if (para) flush()
      if (/^\s*\|[\s|:-]+\|\s*$/.test(line)) continue // the |---|---| separator
      table ??= []
      table.push(line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
    } else if (!line.trim()) {
      flush()
    } else {
      if (table) flush()
      if (para && para.quoted !== quoted) flush()
      para ??= { lines: [], quoted }
      para.lines.push(line)
    }
  }
  flush()
  return blocks
}

const INLINE = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]*\]\([^)]*\))/g

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith('***')) return <strong key={i}><em>{part.slice(3, -3)}</em></strong>
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>
    if (part.startsWith('`')) return <span key={i}>{part.slice(1, -1)}</span>
    const link = /^\[([^\]]*)\]\(/.exec(part)
    if (link) return <Fragment key={i}>{link[1].replace(/`/g, '')}</Fragment>
    return <Fragment key={i}>{part}</Fragment>
  })
}

export function Transcript({ text }: { text: string }) {
  return (
    <div className="max-w-[72ch] space-y-3 text-sm leading-relaxed text-foreground">
      {parse(text).map((b, i) => {
        if (b.kind === 'heading') {
          return (
            <h4 key={i} className="pt-2 font-display text-base font-medium text-foreground">
              {inline(b.text)}
            </h4>
          )
        }
        if (b.kind === 'table') {
          return (
            <div key={i} className="overflow-x-auto">
              <table className="text-sm">
                <tbody>
                  {b.rows.map((row, r) => (
                    <tr key={r} className="border-b border-border last:border-0">
                      {row.map((cell, c) => (
                        <td key={c} className="px-3 py-1 align-top">
                          {inline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        return (
          <p
            key={i}
            className={b.quoted ? 'border-l-2 border-border pl-4 text-ink-2' : undefined}
          >
            {/* Joined first: bold and italics often run across the fiche's line breaks. */}
            {inline(b.lines.join(' '))}
          </p>
        )
      })}
    </div>
  )
}
