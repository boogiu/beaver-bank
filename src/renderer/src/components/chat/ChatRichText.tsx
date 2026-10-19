import type { ReactNode } from 'react'

function inline(text: string): ReactNode[] {
  return text
    .split(/(!?\[[^\]\n]*\]\([^\n)]*\)|<[^>\n]*>|`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g)
    .map((part, index) =>
      part.startsWith('`') && part.endsWith('`') ? (
        <code key={index}>{part.slice(1, -1)}</code>
      ) : part.startsWith('**') && part.endsWith('**') ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : part.startsWith('*') && part.endsWith('*') ? (
        <em key={index}>{part.slice(1, -1)}</em>
      ) : (
        part
      )
    )
}
export function ChatRichText({ text }: { text: string }): React.JSX.Element {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (line.startsWith('```')) {
      const code: string[] = []
      while (++index < lines.length && !lines[index].startsWith('```')) code.push(lines[index])
      blocks.push(
        <pre key={index}>
          <code>{code.join('\n')}</code>
        </pre>
      )
    } else if (line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] || '')) {
      const cells = (value: string): string[] =>
        value
          .replace(/^\s*\||\|\s*$/g, '')
          .split('|')
          .map((cell) => cell.trim())
      const heading = cells(line)
      index++
      const rows: string[][] = []
      while (index + 1 < lines.length && lines[index + 1].includes('|'))
        rows.push(cells(lines[++index]))
      blocks.push(
        <div className="chat-table" key={index}>
          <table>
            <thead>
              <tr>
                {heading.map((cell, i) => (
                  <th key={i}>{inline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{inline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    } else if (/^#{1,3} /.test(line))
      blocks.push(<h3 key={index}>{inline(line.replace(/^#{1,3} /, ''))}</h3>)
    else if (/^\s*([-*] |\d+\. )/.test(line)) {
      const ordered = /^\s*\d+\./.test(line)
      const items: ReactNode[] = [
        <li key={index}>{inline(line.replace(/^\s*(?:[-*]|\d+\.) /, ''))}</li>
      ]
      const pattern = ordered ? /^\s*\d+\. / : /^\s*[-*] /
      while (index + 1 < lines.length && pattern.test(lines[index + 1])) {
        index++
        items.push(<li key={index}>{inline(lines[index].replace(pattern, ''))}</li>)
      }
      blocks.push(ordered ? <ol key={index}>{items}</ol> : <ul key={index}>{items}</ul>)
    } else
      blocks.push(
        <div className="chat-line" key={index}>
          {line ? inline(line) : <br />}
        </div>
      )
  }
  return <div className="chat-rich">{blocks}</div>
}
