import {
  adminClient,
  assertPost,
  cleanText,
  handleOptions,
  json,
  readJson,
  requireUser,
  ResponseError,
  safeError,
  validUuid
} from '../_shared/common.ts'

const INCIDENT_TYPES = new Set([
  'unconscious',
  'cardiac_arrest',
  'trauma',
  'bleeding',
  'other'
])

type Recipient = {
  membership_id: string
  user_id: string
  phone_e164: string | null
  sms_enabled: boolean
  push_subscriptions: Array<Record<string, unknown>>
}

type Attempt = {
  incident_id: string
  recipient_id: string
  channel: 'push' | 'sms'
  status: 'simulated' | 'sent' | 'failed' | 'skipped'
  provider_message_id?: string | null
  destination_masked: string
  error_code?: string | null
}

function numberInRange(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < minimum || value > maximum) return null
  return value
}

function maskPhone(phone: string) {
  return phone.length > 4 ? '***' + phone.slice(-4) : '***'
}

function mapUrl(latitude: number | null, longitude: number | null) {
  if (latitude === null || longitude === null) return null
  return 'https://www.google.com/maps?q=' + latitude + ',' + longitude
}

async function hasScopedAccess(
  admin: ReturnType<typeof adminClient>,
  memberships: Array<{ organization_id: string; role: string }>,
  targetOrganizationId: string
) {
  if (memberships.some((membership) => membership.role === 'system_admin')) return true
  if (memberships.some((membership) => membership.organization_id === targetOrganizationId)) return true

  const administeredOrganizations = new Set(
    memberships
      .filter((membership) => membership.role === 'unit_admin')
      .map((membership) => membership.organization_id)
  )

  let cursor: string | null = targetOrganizationId
  for (let depth = 0; cursor && depth < 16; depth += 1) {
    if (administeredOrganizations.has(cursor)) return true
    const { data: organization, error } = await admin
      .from('organizations')
      .select('parent_id')
      .eq('id', cursor)
      .eq('active', true)
      .maybeSingle()
    if (error) throw error
    cursor = organization ? organization.parent_id : null
  }

  return false
}

async function sendWebhook(url: string, token: string, body: unknown) {
  const target = new URL(url)
  if (target.protocol !== 'https:' || target.username || target.password) throw new Error('invalid_provider_url')
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(8000)
  })
  if (!response.ok) throw new Error('provider_http_' + response.status)
  let payload: Record<string, unknown> = {}
  try {
    payload = await response.json()
  } catch {
    payload = {}
  }
  if (payload.accepted !== true || typeof payload.messageId !== 'string' || !payload.messageId) {
    throw new Error('provider_acceptance_not_confirmed')
  }
  return payload.messageId.slice(0, 200)
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  let reservedIncidentId: string | null = null
  let acceptedByProvider = false

  try {
    assertPost(req)
    const { user } = await requireUser(req)
    const body = await readJson(req)

    if (!validUuid(body.organizationId) || !validUuid(body.idempotencyKey)) {
      throw new ResponseError(400, 'Nieprawidłowy identyfikator jednostki lub alarmu.')
    }

    const incidentType = cleanText(body.incidentType, 40, true)
    if (!INCIDENT_TYPES.has(incidentType)) {
      throw new ResponseError(400, 'Nieobsługiwany rodzaj zdarzenia.')
    }

    const placeDescription = cleanText(body.placeDescription, 240, true)
    if (placeDescription.length < 2) throw new ResponseError(400, 'Podaj dokładniejsze miejsce zdarzenia.')
    const note = cleanText(body.note, 500, false) || null
    const rawLocation = body.location && typeof body.location === 'object' ? body.location : {}
    const latitude = numberInRange(rawLocation.latitude, -90, 90)
    const longitude = numberInRange(rawLocation.longitude, -180, 180)
    const accuracy = numberInRange(rawLocation.accuracyMeters, 0, 100000)
    if (body.location && (latitude === null || longitude === null)) {
      throw new ResponseError(400, 'Nieprawidłowe współrzędne GPS. Pobierz lokalizację ponownie albo wpisz miejsce ręcznie.')
    }
    const admin = adminClient()

    const { data: memberships, error: membershipError } = await admin
      .from('memberships')
      .select('id,organization_id,role,organizations!inner(active)')
      .eq('user_id', user.id)
      .eq('active', true)
      .eq('organizations.active', true)

    if (membershipError) throw membershipError
    if (!memberships || !await hasScopedAccess(admin, memberships, body.organizationId)) {
      throw new ResponseError(403, 'Nie masz aktywnego przypisania ani zakresu administracyjnego dla tej jednostki.')
    }

    const mode = Deno.env.get('NOTIFICATION_MODE') === 'production'
      ? 'production'
      : 'simulation'
    // Ekran testowy nigdy nie może po cichu uruchomić wysyłki produkcyjnej.
    if (body.expectedMode !== mode) {
      throw new ResponseError(409, 'Tryb panelu nie zgadza się z trybem serwera. Administrator musi uzgodnić konfigurację.', 'mode_mismatch')
    }

    const { data: organization, error: organizationError } = await admin
      .from('organizations')
      .select('id,name,code')
      .eq('id', body.organizationId)
      .eq('active', true)
      .single()

    if (organizationError || !organization) {
      throw new ResponseError(404, 'Jednostka nie istnieje albo jest nieaktywna.')
    }

    const { data: incident, error: incidentError } = await admin
      .rpc('reserve_incident', {
        target_user_id: user.id,
        target_organization_id: body.organizationId,
        target_key: body.idempotencyKey,
        target_type: incidentType,
        target_place: placeDescription,
        target_note: note,
        target_latitude: latitude,
        target_longitude: longitude,
        target_accuracy: accuracy === null ? null : Math.round(accuracy),
        target_mode: mode
      })
    if (incidentError && incidentError.message === 'rate_limited') {
      throw new ResponseError(429, 'Odczekaj 30 sekund przed utworzeniem kolejnego alarmu.', 'rate_limited')
    }
    if (incidentError && incidentError.message === 'idempotency_conflict') {
      throw new ResponseError(409, 'Ten identyfikator został już użyty dla innej jednostki.', 'idempotency_conflict')
    }
    if (incidentError || !incident) throw incidentError || new Error('incident_not_created')
    if (incident.is_duplicate) {
      const { count } = await admin.from('alert_recipients').select('id', { count: 'exact', head: true }).eq('incident_id', incident.id)
      return json({ incidentId: incident.id, status: incident.status, mode: incident.notification_mode, duplicate: true, recipientCount: count })
    }
    reservedIncidentId = incident.id

    const { data: recipientData, error: recipientError } = await admin
      .rpc('get_alert_recipients_for_dispatch', {
        target_organization_id: body.organizationId
      })

    if (recipientError) throw recipientError

    const recipients = ((recipientData || []) as Recipient[]).filter((recipient) => {
      const hasSms = Boolean(recipient.sms_enabled && recipient.phone_e164)
      const hasPush = Array.isArray(recipient.push_subscriptions) && recipient.push_subscriptions.length > 0
      return hasSms || hasPush
    })

    if (recipients.length === 0) {
      await admin.from('incidents').update({ status: 'failed' }).eq('id', incident.id)
      await admin.from('audit_log').insert({
        actor_id: user.id,
        organization_id: body.organizationId,
        action: 'alarm_no_recipients',
        entity_type: 'incident',
        entity_id: incident.id,
        details: { mode }
      })
      throw new ResponseError(409, 'Brak dostępnych ratowników z aktywnym kanałem PUSH lub SMS.', 'no_recipients')
    }

    const recipientRows = recipients.map((recipient) => {
      const channels: string[] = []
      if (Array.isArray(recipient.push_subscriptions) && recipient.push_subscriptions.length) channels.push('push')
      if (recipient.sms_enabled && recipient.phone_e164) channels.push('sms')
      return {
        incident_id: incident.id,
        membership_id: recipient.membership_id,
        channels
      }
    })

    const { data: storedRecipients, error: storedRecipientError } = await admin
      .from('alert_recipients')
      .insert(recipientRows)
      .select('id,membership_id')

    if (storedRecipientError || !storedRecipients) {
      throw storedRecipientError || new Error('recipients_not_saved')
    }

    const recipientIdByMembership = new Map(
      storedRecipients.map((item) => [item.membership_id, item.id])
    )
    const attempts: Attempt[] = []
    const smsUrl = Deno.env.get('SMS_WEBHOOK_URL') || ''
    const smsToken = Deno.env.get('SMS_WEBHOOK_TOKEN') || ''
    const pushUrl = Deno.env.get('PUSH_WEBHOOK_URL') || ''
    const pushToken = Deno.env.get('PUSH_WEBHOOK_TOKEN') || ''
    const locationUrl = mapUrl(latitude, longitude)
    const message = {
      title: '🚨 POTRZEBNA POMOC',
      organization: (organization.code ? organization.code + ' — ' : '') + organization.name,
      incidentType,
      place: placeDescription,
      locationUrl,
      incidentId: incident.id,
      createdAt: incident.created_at
    }

    for (const recipient of recipients) {
      const recipientId = recipientIdByMembership.get(recipient.membership_id)
      if (!recipientId) continue

      if (Array.isArray(recipient.push_subscriptions) && recipient.push_subscriptions.length) {
        const attempt: Attempt = {
          incident_id: incident.id,
          recipient_id: recipientId,
          channel: 'push',
          status: mode === 'simulation' ? 'simulated' : 'failed',
          destination_masked: 'push:' + recipient.push_subscriptions.length
        }
        if (mode === 'production') {
          if (!pushUrl || !pushToken) {
            attempt.status = 'skipped'
            attempt.error_code = 'push_provider_not_configured'
          } else {
            try {
              attempt.provider_message_id = await sendWebhook(pushUrl, pushToken, {
                subscriptions: recipient.push_subscriptions,
                message
              })
              attempt.status = 'sent'
              acceptedByProvider = true
            } catch (error) {
              attempt.status = 'failed'
              attempt.error_code = 'push_provider_failed'
            }
          }
        }
        attempts.push(attempt)
      }

      if (recipient.sms_enabled && recipient.phone_e164) {
        const attempt: Attempt = {
          incident_id: incident.id,
          recipient_id: recipientId,
          channel: 'sms',
          status: mode === 'simulation' ? 'simulated' : 'failed',
          destination_masked: maskPhone(recipient.phone_e164)
        }
        if (mode === 'production') {
          if (!smsUrl || !smsToken) {
            attempt.status = 'skipped'
            attempt.error_code = 'sms_provider_not_configured'
          } else {
            try {
              attempt.provider_message_id = await sendWebhook(smsUrl, smsToken, {
                to: recipient.phone_e164,
                message
              })
              attempt.status = 'sent'
              acceptedByProvider = true
            } catch (error) {
              attempt.status = 'failed'
              attempt.error_code = 'sms_provider_failed'
            }
          }
        }
        attempts.push(attempt)
      }
    }

    if (attempts.length) {
      const { error: attemptError } = await admin.from('delivery_attempts').insert(attempts)
      if (attemptError) throw attemptError
    }

    const sentCount = attempts.filter((attempt) => attempt.status === 'sent').length
    const failedCount = attempts.filter((attempt) => attempt.status === 'failed' || attempt.status === 'skipped').length
    const finalStatus = mode === 'simulation'
      ? 'simulated'
      : sentCount === 0
        ? 'failed'
        : failedCount > 0
          ? 'partial'
          : 'sent'

    const { error: statusError } = await admin
      .from('incidents')
      .update({ status: finalStatus })
      .eq('id', incident.id)

    if (statusError) throw statusError

    const { error: auditError } = await admin.from('audit_log').insert({
      actor_id: user.id,
      organization_id: body.organizationId,
      action: 'alarm_dispatched',
      entity_type: 'incident',
      entity_id: incident.id,
      details: {
        mode,
        status: finalStatus,
        recipient_count: recipients.length,
        attempt_count: attempts.length,
        failed_count: failedCount
      }
    })
    if (auditError) throw auditError
    reservedIncidentId = null

    return json({
      incidentId: incident.id,
      status: finalStatus,
      mode,
      duplicate: false,
      recipientCount: recipients.length,
      attemptCount: attempts.length
    })
  } catch (error) {
    if (reservedIncidentId) {
      // Nie zostawiaj alarmu bez końca w statusie dispatching po błędzie.
      try {
        await adminClient().from('incidents').update({ status: acceptedByProvider ? 'partial' : 'failed' }).eq('id', reservedIncidentId)
      } catch { /* Ponowienie z tym samym kluczem nadal nie wysyła drugi raz. */ }
    }
    return safeError(error)
  }
})
