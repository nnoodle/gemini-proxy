import { parse, Token, Link, Heading } from './parse-gemini'
import { buildAbsoluteURL as mkurl } from 'url-toolkit'

const tag = (tagtype: string, attributes: string, content: string) =>
  `<${tagtype} ${attributes}>${content}</${tagtype}>`

const ltyp = (symbol: string, classes?: string) =>
  tag('span', `class="section_type ${classes}"`, symbol)
const cont = (tagtype: string, content: string, classes?: string) =>
  tag(tagtype, `class="section_content ${classes}"`, content)

function proxify(url: string) : string {
  return '/go?url='+encodeURIComponent(url)
}

function fixupLink(input: string, base: string) {
  // this still fails torture test 0010
  try {
    // informal guess about whether or not it's a relative URL
    // or a normal URL without the protocol and doubleslash
    if ( input.indexOf('://') === -1 && input[0] !== '/'
      && input.indexOf('.') !== -1
      && (input.indexOf('/') === -1 ||
        input.indexOf('/') >= input.indexOf('.')))
      input = 'gemini://' + input
    const url = mkurl(base, input, {alwaysNormalize: true})
    if (url.startsWith('gemini:'))
      return proxify(url.toString())
    else
      return url.toString()
  } catch(e) {
    return input
  }
}

export default function gemini2html(text: string, baseurl: string) : string {
  if (typeof text !== 'string')
    return ''
  const tokens: Token[] = parse(text)
  let html: string[] = []
  for (const text of tokens) {
    switch (text.type) {
      case '':
        html.push(ltyp(''))
        html.push(cont('p', text.content))
        break
      case '=>': {
        const link = fixupLink((text as Link).link, baseurl)
        html.push(ltyp(text.type))
        html.push(cont('span', tag('a', `href="${link}"`, text.content)))
        break
      }
      case '```':
        for (const s of (text.content as string[])) {
          html.push(ltyp(text.type, 'preformatted'))
          html.push(cont('pre', s, 'preformatted'))
        }
        break
      case '#': {
        const levels = (text as Heading).levels
        html.push(ltyp(text.type.repeat(levels)))
        html.push(cont('h'+levels, text.content))
        break
      }
      case '*':
        html.push(ltyp(''))
        html.push(cont(
          'ul',
          (text.content as string[]).map((s: string) : string =>
            `<li>${s}</li>`).join('')
        ))
        break
      case '>':
        for (const s of (text.content as string[])) {
          html.push(ltyp(text.type, 'quoted'))
          html.push(cont('p', s, 'quoted'))
        }
        break
      default:
        throw new Error('Unknown type GEMINI2HTML: ' + text.type)
    }
  }
  return `<main class="wrap">${html.join('')}</main>`
}
