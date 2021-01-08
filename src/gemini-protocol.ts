import * as tls from 'tls'

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

export class Response {
  url: string
  data: string

  status: StatusCode
  meta: string
  body: string

  redirects: string[]

  constructor(url: string) {
    this.url = url
    this.redirects = []
    this.status = 0
    this.data = ''
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

  receive(input: string) {
    this.data += input
  }

  parse() {
    const headend = this.data.indexOf('\r\n'); // odd
    [this.status, this.meta] = Response.parseHeader(this.data.slice(0, headend))
    this.body = this.data.slice(headend+2)
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
      this.data = ''
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
      const socket: tls.TLSSocket =
        tls.connect(parseInt(url.port) || 1965, url.hostname, { rejectUnauthorized: false }, () => {
          if (!socket.write(`${url}\r\n`, 'utf8'))
            reject('failed to write to socket')
        })
      socket.on('data', (data: Buffer) => response.receive(data.toString()));
      socket.on('close', () => {
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
      });
    } catch(e) {
      return reject(e)
    }
  })
}
