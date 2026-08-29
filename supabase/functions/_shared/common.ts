import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { corsHeaders } from 'npm:@supabase/supabase-js@2.112.4/cors'

function keyFromJson(variableName: string): string {
  const raw = Deno.env.get(variableName)
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    return parsed.default || Object.values(parsed)[0] || ''
  } catch {
    return ''
  }
}

function publishableKey(): string {
  return keyFromJson('SUPABASE_PUBLISHABLE_KEYS') ||
    Deno.env.get('SUPABASE_ANON_KEY') ||
    ''
}

function secretKey(): string {
  return keyFromJson('SUPABASE_SECRET_KEYS') ||
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
    ''
}

function projectUrl(): string {
  const value = Deno.env.get('SUPABASE_URL') || ''
  if (!value) throw new Error('SUPABASE_URL is not configured')
  return value
}

export function adminClient() {
  const key = secretKey()
  if (!key) throw new Error('Supabase secret key is not configured')
  return createClient(projectUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

export async function requireUser(req: Request) {
  const authorization = req.headers.get('Authorization') || ''
  if (!authorization.startsWith('Bearer ')) {
    throw new ResponseError(401, 'Brak ważnej sesji użytkownika.')
  }
  const key = publishableKey()
  if (!key) throw new Error('Supabase publishable key is not configured')
  const scoped = createClient(projectUrl(), key, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const token = authorization.slice(7)
  const { data, error } = await scoped.auth.getUser(token)
  if (error || !data.user) {
    throw new ResponseError(401, 'Sesja wygasła albo jest nieprawidłowa.')
  }
  return { user: data.user, scoped }
}

export class ResponseError extends Error {
  status: number
  code: string

  constructor(status: number, message: string, code = 'request_rejected') {
    super(message)
    this.status = status
    this.code = code
  }
}

export function responseHeaders() {
  return {
    ...corsHeaders,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders()
  })
}

export function handleOptions(req: Request) {
  if (req.method !== 'OPTIONS') return null
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: responseHeaders()
  })
}

export function assertPost(req: Request) {
  if (req.method !== 'POST') {
    throw new ResponseError(405, 'Dozwolona jest wyłącznie metoda POST.')
  }
}

export async function readJson(req: Request) {
  try {
    return await req.json()
  } catch {
    throw new ResponseError(400, 'Nieprawidłowe dane żądania.')
  }
}

export function cleanText(value: unknown, maximum: number, required = false) {
  const cleaned = typeof value === 'string' ? value.trim() : ''
  if (required && !cleaned) throw new ResponseError(400, 'Brakuje wymaganego pola.')
  if (cleaned.length > maximum) throw new ResponseError(400, 'Przekroczono dozwoloną długość pola.')
  return cleaned
}

export function validUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function safeError(error: unknown) {
  if (error instanceof ResponseError) {
    return json({ error: error.code, message: error.message }, error.status)
  }
  console.error(error)
  return json({ error: 'internal_error', message: 'Wystąpił błąd serwera.' }, 500)
}
