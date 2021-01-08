import express from 'express'
import mustacheExpress from 'mustache-express'
import "dotenv-defaults/config"
import { request, StatusCode, withinCategory } from './gemini-protocol'
import gemini2html from './gemini-to-html'

const app = express()

app.engine('mustache', mustacheExpress('views/partials', '.mustache'))
app.set('view engine', 'mustache')
app.set('views', 'views')
app.use('/static', express.static('public'))

app.get('/', (_req, res) => {
  res.render('index', {url: 'gemini://gemini.circumlunar.space/'})
})

app.get('/go', async (req, res) => {
  let url: URL
  try {
    if (typeof req.query.url === 'string') {
      let s = req.query.url
      if (s.indexOf('//') === -1)
        s = 'gemini://' + s
      s = s.replace(/:\/\/+/, '://') // work around uncatchable SSL error???
      url = new URL(s)
      if (typeof req.query.q === 'string')
        url.search = req.query.q
    } else
      throw new Error('not a string /go: ' + url.toString())
  } catch(e) {
    console.error(e)
    return res.status(400).send('Bad Request')
  }
  if (url.protocol !== 'gemini:')
    return res.status(406).send('Not acceptable')
  try {
    const g = await request(url.toString())
    if (!withinCategory(g.status, 10)) {
      return res.render('gemini', {
        header: `${g.status} ${StatusCode[g.status]}; ${g.meta}`,
        url: g.url,
        body: gemini2html(g.body, g.url)
      })
    }
    const input_type = (g.status === 11) ? 'password' : 'text'
    return res.render('gemini-query', {
      header: `${g.status} ${StatusCode[g.status]}; ${g.meta}`,
      input_type,
      url: g.url,
      body: gemini2html(g.body, g.url)
    })
  } catch(e) {
    console.error(e)
    return res.status(500).send('Internal server error')
  }
})

app.listen(process.env.PORT, () => {
  console.log(`gemini proxy listening @ port ${process.env.PORT}`)
})
