import * as tls from 'tls'
import { isIP } from 'net'
import { transcode } from 'buffer'

export enum StatusCode {
  INPUT                       = 10,
  SENSITIVE_INPUT             = 11,
  SUCCESS                     = 20,
  REDIRECT_TEMPORARY          = 30,
  REDIRECT_PERMANENT          = 31,
  TEMPORARY_FAILURE           = 40,
  SERVER_UNAVAILABLE          = 41,
  CGI_ERROR                   = 42,
  PROXY_ERROR                 = 43,
  SLOW_DOWN                   = 44,
  PERMANENT_FAILURE           = 50,
  NOT_FOUND                   = 51,
  GONE                        = 52,
  PROXY_REQUEST_REFUSED       = 53,
  BAD_REQUEST                 = 59,
  CLIENT_CERTIFICATE_REQUIRED = 60,
  CERTIFICATE_NOT_AUTHORISED  = 61,
  CERTIFICATE_NOT_VALID       = 62,
}

export function withinCategory(num: number, min: number, max?: number): boolean {
  return num >= min && num <= (max || min+9)
}

class MimeType {
  mime: string

  type: string
  subtype: string

  parameter: string
  value: string

  constructor (mime: string) {
    const lower = (str: string) => (typeof str === 'string') ? str.toLowerCase() : str
    mime = mime.replace(/\s/g, '')

    if (mime.indexOf(';') !== -1)
      [this.mime, this.type, this.subtype, this.parameter, this.value] = mime.match(
        /(?<type>.*?)\/(?<subtype>.*?);(?:(?<parameter>.*)=(?<value>.*))?/)
    else {
      [this.mime, this.type, this.subtype] = mime.match(/(?<type>.*?)\/(?<subtype>.*)/)
    }

    this.type = lower(this.type)
    this.subtype = lower(this.subtype)
    this.parameter = lower(this.parameter)
  }
}

export class Response {
  url: string
  data: Buffer[]

  status: StatusCode
  meta: string
  mime: MimeType
  body: string
  rawBody: Buffer

  redirects: string[]

  constructor(url: string) {
    this.url = url
    this.redirects = []
    this.status = 0
    this.data = []
  }

  static parseHeader(header: string) : [StatusCode, string] {
    const space = header.indexOf(' ')
    if (space === -1)
      throw new Error('No space in header PARSEHEADER: ' + header)
    const statusString = header.slice(0, space)
    const status = parseInt(statusString)
    if (!status)
      throw new Error('Status not a number PARSEHEADER: ' + statusString)
    const meta = header.slice(space+1)
    if (meta.length > 1024)
      throw new Error('Contents of META too long PARSEHEADER: ' + meta)

    return [status, meta]
  }

  receive(buf: Buffer) {
    this.data.push(buf)
  }

  parse() {
    const buf: Buffer = Buffer.concat(this.data)
    const headend = buf.indexOf('\r\n'); // suppress error
    [this.status, this.meta] = Response.parseHeader(buf.slice(0, headend).toString())
    this.rawBody = buf.slice(headend+2)
    if (this.status === 20) {
      try {
        this.mime = new MimeType(this.meta)
      } catch(e) {
        console.error(e)
        this.mime = new MimeType('text/gemini;charset=UTF-8')
      }
      switch (this.mime.type) {
        case 'video':
        case 'image':
        case 'audio':
          this.body = this.rawBody.toString('base64')
          break
        default:
          if ( this.mime.parameter
            && this.mime.parameter === 'charset'
            && this.mime.value.toLowerCase() === 'iso-8859-1') {
            // this doesn't actually work
            this.body = transcode(this.rawBody, 'latin1', 'utf8').toString()
          }
          this.body = this.rawBody.toString()
          break
      }
    } else {
      this.body = this.rawBody.toString()
    }
  }

  redirectp() : string | false {
    const len = this.redirects.length
    // (this.status >= 30 && this.status < 40)
    if (  withinCategory(this.status, 30) && len < 5
      && !(len > 0 && this.redirects[0] === this.meta)
      && !this.redirects.includes(this.url)) {
      console.log('redirecting from', this.url, 'to', this.meta)
      this.redirects.unshift(this.url)
      this.status = 0
      this.data = []
      this.url = this.meta
      return this.url
    }
    return false
  }
}

export function request(urlstr: string, response?: Response) : Promise<Response> {
  if (!response) {
    var url = new URL(urlstr)
    response = new Response(url.toString())
  } else
    url = new URL(urlstr, response.redirects[0])
  return new Promise((resolve, reject) => {
    try {
      let socketerr: Error
      const TLS_OPTIONS: tls.ConnectionOptions = {
        port: parseInt(url.port) || 1965,
        host: url.hostname,
        rejectUnauthorized: false,
        servername: isIP(url.hostname) ? undefined : url.hostname
      }
      const socket: tls.TLSSocket =
        tls.connect(TLS_OPTIONS, () => {
          if (!socket.write(`${url}\r\n`, 'utf8'))
            reject('failed to write to socket')
        })
      socket.on('data', (data: Buffer) => response.receive(data));
      socket.on('close', err => {
        if (err)
          return reject(socketerr)
        try {
          response.parse()
        } catch(e) {
          return reject(e)
        }
        const newurl = response.redirectp()
        if (newurl)
          request(newurl, response)
            .then(resp => resolve(resp))
        else
          resolve(response)
      })
      socket.on('error', e => socketerr = e)
    } catch(e) {
      return reject(e)
    }
  })
}
