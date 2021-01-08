
export interface Line {
  type: string,
  content: string,
}

export interface Heading {
  type: '#',
  levels: 1|2|3,
  content: string,
}

export interface Link {
  type: '=>',
  link: string,
  content: string,
}

export interface Group {
  type: '*'|'>'|'```',
  content: string[],
}

export type Token = Group | Heading | Link | Line

export function parse(text: string) : Token[] {
  const lines = text.split(/\r?\n/)
  let tokens : Token[] = []

  while (lines.length) {
    let line = lines.shift()

    if (line.startsWith('```')) {
      let content: string[] = []
      while (lines.length && !(line = lines.shift()).startsWith('```'))
        content.push(line)

      tokens.push({ type: '```', content })
    } else if (line.startsWith('*') || line.startsWith('>')) {
      const group  = line[0] as '*'|'>'
      let content: string[] = [line.slice(1)]
      while (lines.length && lines[0].startsWith(group))
        content.push(lines.shift().slice(1))

      tokens.push({ type: group, content: content.map(s => s.trim()) })
    } else if (line.startsWith('#')) {
      // will eat up excess #s
      const match = line.match(/^(?<header>#+)(?<content>.*)/)
      tokens.push({
        type: '#',
        levels: Math.min(match.groups.header.length, 3) as 1|2|3,
        content: match.groups.content
      })
    } else if (line.startsWith('=>')) {
      const match = line.match(/^=>\s*(?<link>\S+)\s*(?<content>.*)/)
      if (match)
        tokens.push({
          type: '=>',
          link: match.groups.link,
          content: match.groups.content || match.groups.link
        })
      else {
        const link = line.slice(2).trim()
        tokens.push({ type: '=>', link, content: link })
      }
    } else {
      tokens.push({ type: '', content: line })
    }
  }
  return tokens
}
