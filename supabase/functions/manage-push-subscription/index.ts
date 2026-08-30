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

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    assertPost(req)
    const { user } = await requireUser(req)
    const body = await readJson(req)

    if (!validUuid(body.membershipId)) {
      throw new ResponseError(400, 'Nieprawidłowe przypisanie ratownika.')
    }

    const subscription = body.subscription && typeof body.subscription === 'object'
      ? body.subscription
      : {}
    const keys = subscription.keys && typeof subscription.keys === 'object'
      ? subscription.keys
      : {}
    const endpoint = cleanText(subscription.endpoint, 2048, true)
    const p256dh = cleanText(keys.p256dh, 512, true)
    const authSecret = cleanText(keys.auth, 512, true)
    const allowedHosts = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com']
    let endpointUrl: URL
    try { endpointUrl = new URL(endpoint) }
    catch { throw new ResponseError(400, 'Nieprawidłowy adres subskrypcji PUSH.') }
    if (endpointUrl.protocol !== 'https:' || endpointUrl.username || endpointUrl.password ||
      endpointUrl.port || !allowedHosts.includes(endpointUrl.hostname)) {
      throw new ResponseError(400, 'Nieobsługiwany dostawca subskrypcji PUSH. Skontaktuj się z administratorem.')
    }
    if (!/^[A-Za-z0-9_-]{87}=?$/.test(p256dh) || !/^[A-Za-z0-9_-]{22}={0,2}$/.test(authSecret)) {
      throw new ResponseError(400, 'Nieprawidłowe klucze subskrypcji PUSH.')
    }
    const admin = adminClient()

    const { data: membership, error: membershipError } = await admin
      .from('memberships')
      .select('id,organization_id,organizations!inner(active)')
      .eq('id', body.membershipId)
      .eq('user_id', user.id)
      .eq('role', 'responder')
      .eq('active', true)
      .eq('organizations.active', true)
      .maybeSingle()

    if (membershipError) throw membershipError
    if (!membership) {
      throw new ResponseError(403, 'Tylko aktywny ratownik może zarejestrować to urządzenie.')
    }

    const { data: subscriptionId, error: registrationError } = await admin
      .rpc('upsert_push_subscription', {
        target_membership_id: body.membershipId,
        target_endpoint: endpoint,
        target_p256dh: p256dh,
        target_auth_secret: authSecret
      })

    if (registrationError) throw registrationError

    await admin.from('audit_log').insert({
      actor_id: user.id,
      organization_id: membership.organization_id,
      action: 'push_subscription_registered',
      entity_type: 'push_subscription',
      entity_id: subscriptionId,
      details: { membership_id: body.membershipId }
    })

    return json({ ok: true })
  } catch (error) {
    return safeError(error)
  }
})
