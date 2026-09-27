// Thin fetch wrapper: adds the bearer token, parses JSON, surfaces API errors.
const TOKEN_KEY = 'ep_token'

export const token = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } },
  set: (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ } },
}

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

function errorText(data, status) {
  if (!data) return `Request failed (${status})`
  if (typeof data.detail === 'string') return data.detail
  if (Array.isArray(data.detail)) return data.detail.map((d) => `${d.loc?.slice(-1)[0]}: ${d.msg}`).join('; ')
  return `Request failed (${status})`
}

export async function api(path, { method = 'GET', body, params } = {}) {
  const url = new URL(`/api${path}`, window.location.origin)
  if (params) Object.entries(params).forEach(([k, v]) => v !== undefined && v !== '' && url.searchParams.set(k, v))
  const headers = { Accept: 'application/json' }
  const t = token.get()
  if (t) headers.Authorization = `Bearer ${t}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null
  if (res.status === 401 && t) { token.set(null); window.dispatchEvent(new Event('ep:logout')) }
  if (!res.ok) throw new ApiError(res.status, errorText(data, res.status))
  return data
}

// PDFs need the auth header, so fetch as a blob and open it in a new tab.
export async function openPdf(path) {
  const win = window.open('', '_blank')
  try {
    const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${token.get()}` } })
    if (!res.ok) throw new Error('Could not load document')
    const url = URL.createObjectURL(await res.blob())
    if (win) win.location.href = url
    else window.location.href = url
  } catch (e) {
    win?.close()
    alert(e.message)
  }
}
