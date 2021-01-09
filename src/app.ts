import express from 'express'
import mustacheExpress from 'mustache-express'
import "dotenv-defaults/config"
import { request, Response, StatusCode, withinCategory } from './gemini-protocol'
import gemini2html from './gemini-to-html'

const app = express()

function render(g: Response) : string {
  if (g.mime?.subtype === 'gemini')
    return gemini2html(g.body, g.url)
  if (g.mime?.subtype === 'html')
    return '<main>'+g.body+'</main>'
  switch (g.mime?.type) {
    case 'image':
      return `<img src="data:${g.mime.type+'/'+g.mime.subtype};base64,${g.body}" />`
    case 'audio':
      return `<audio src="data:${g.mime.type+'/'+g.mime.subtype};base64,${g.body}" controls>`
        + 'there\'s suppose to be audio here…</audio>'
    case 'video': // good luck
      return '<video controls>'+
        `<source src="data:${g.mime.type+'/'+g.mime.subtype};base64,${g.body}" type="${g.mime.type+'/'+g.mime.subtype}">`
        + 'there\'s suppose to be a video here…</video>'
    case 'text':
    default:
      return '<main><pre>' + g.body + '</pre></main>'
  }
}

app.engine('mustache', mustacheExpress('views/partials', '.mustache'))
app.set('view engine', 'mustache')
app.set('views', 'views')
app.use('/static', express.static('public'))

app.get('/', (_req, res) => {
  res.render('index', { url: 'gemini://gemini.circumlunar.space/' })
})

app.get('/go', async (req, res) => {
  let url: URL
  try {
    if (typeof req.query.url === 'string') {
      let s = req.query.url
      if (s.indexOf('//') === -1)
        s = 'gemini://' + s
      s = s.replace(/:\/\/+/, '://')
      url = new URL(s)
      if (typeof req.query.q === 'string')
        url.search = req.query.q
    } else
      throw new Error('Not a string /go: ' + url.toString())
  } catch(e) {
    let msg = '';
    if (e instanceof Error)
      msg = ': '+e.message
    console.error(e)
    return res.status(400).send('Bad Request'+msg)
  }

  if (url.protocol !== 'gemini:')
    return res.status(406).send('Not acceptable: non-gemini protocol')

  try {
    const g = await request(url.toString())
    if (req.query.raw) {
      if (g.mime)
        res.set('Content-Type', g.mime.type+'/'+g.mime.subtype)
      return res.send(g.rawBody)
    }
    if (withinCategory(g.status, 10)) {
      const input_type = (g.status === 11) ? 'password' : 'text'
      return res.render('gemini-query', {
        header: `${g.status} ${StatusCode[g.status]}; ${g.meta}`,
        input_type,
        url: g.url,
        body: g.body.trim() ? '<main><pre>'+g.body+'</pre></main>' : undefined
      })
    }
    if (withinCategory(g.status, 20)) {
      return res.render('gemini', {
        header: `${g.status} ${StatusCode[g.status]}; ${g.meta}`,
        url: g.url,
        body: render(g)
      })
    }
    return res.render('gemini', {
      header: `${g.status} ${StatusCode[g.status]}; ${g.meta}`,
      url: g.url,
      body: g.body.trim() ? '<main><pre>'+g.body+'</pre></main>' : undefined
    })
  } catch(e) {
    let msg = '';
    if (e instanceof Error)
      msg = ': '+e.message
    return res.status(500).send('Internal server error'+msg)
  }
})

app.listen(process.env.PORT||1965, () => {
  console.log(`gemini proxy listening @ port ${process.env.PORT||1965}`)
})
