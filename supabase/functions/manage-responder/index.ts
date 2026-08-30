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

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254
}

function validPhone(value: string | null) {
  return value === null || /^\+[1-9][0-9]{7,14}$/.test(value)
}

function cleanCompetencies(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 12).map((item) => cleanText(item, 60, false)).filter(Boolean)
}

async function canManage(admin: ReturnType<typeof adminClient>, userId: string, organizationId: string) {
  const { data: roles, error: roleError } = await admin
    .from('memberships')
    .select('organization_id,role,organizations!inner(active)')
    .eq('user_id', userId)
    .eq('active', true)
    .eq('organizations.active', true)
    .in('role', ['unit_admin', 'system_admin'])

  if (roleError) throw roleError
  if (!roles || roles.length === 0) return false
  if (roles.some((membership) => membership.role === 'system_admin')) return true

  const managedIds = new Set(
    roles
      .filter((membership) => membership.role === 'unit_admin')
      .map((membership) => membership.organization_id)
  )

  let cursor: string | null = organizationId
  for (let depth = 0; cursor && depth < 16; depth += 1) {
    if (managedIds.has(cursor)) return true
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

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    assertPost(req)
    const { user } = await requireUser(req)
    const body = await readJson(req)
    const action = cleanText(body.action, 40, true)

    if (action !== 'invite') {
      throw new ResponseError(400, 'Nieobsługiwana operacja administracyjna.')
    }
    if (!validUuid(body.organizationId)) {
      throw new ResponseError(400, 'Nieprawidłowy identyfikator jednostki.')
    }

    const displayName = cleanText(body.displayName, 120, true)
    const email = cleanText(body.email, 254, true).toLowerCase()
    const phoneE164 = cleanText(body.phoneE164, 20, false) || null
    const competencies = cleanCompetencies(body.competencies)
    if (displayName.length < 2) throw new ResponseError(400, 'Imię i nazwisko musi mieć co najmniej 2 znaki.')

    if (!validEmail(email)) {
      throw new ResponseError(400, 'Nieprawidłowy służbowy adres e-mail.')
    }
    if (!validPhone(phoneE164)) {
      throw new ResponseError(400, 'Telefon musi mieć format międzynarodowy, np. +48…')
    }

    const admin = adminClient()
    if (!await canManage(admin, user.id, body.organizationId)) {
      throw new ResponseError(403, 'Nie masz uprawnień do zarządzania ratownikami tej jednostki.')
    }

    const { data: organization, error: organizationError } = await admin
      .from('organizations').select('id').eq('id', body.organizationId).eq('active', true).maybeSingle()
    if (organizationError) throw organizationError
    if (!organization) throw new ResponseError(404, 'Jednostka nie istnieje albo jest nieaktywna.')

    const redirectTo = Deno.env.get('INTERNAL_APP_URL') || ''
    if (!/^https:\/\//.test(redirectTo)) {
      throw new ResponseError(503, 'Administrator musi skonfigurować adres powrotu z zaproszenia.')
    }
    const { data: invitation, error: invitationError } = await admin.auth.admin.inviteUserByEmail(
      email,
      {
        data: { display_name: displayName },
        redirectTo
      }
    )

    if (invitationError || !invitation.user) {
      if (invitationError && /already|registered|exists/i.test(invitationError.message)) {
        throw new ResponseError(409, 'Konto o tym adresie już istnieje. Przypisanie istniejącego konta wymaga zatwierdzenia administratora systemu.', 'account_exists')
      }
      throw invitationError || new Error('invite_failed')
    }

    const { data: membershipId, error: registrationError } = await admin
      .rpc('register_invited_responder', {
        invited_user_id: invitation.user.id,
        target_organization_id: body.organizationId,
        target_display_name: displayName,
        target_phone_e164: phoneE164,
        target_competencies: competencies,
        approving_user_id: user.id
      })

    if (registrationError) {
      throw new ResponseError(503, 'Zaproszenie e-mail utworzono, ale przypisanie do jednostki nie zostało zapisane. Administrator systemu musi naprawić przypisanie istniejącego konta.', 'invitation_needs_repair')
    }

    return json({
      ok: true,
      membershipId,
      invitedUserId: invitation.user.id
    }, 201)
  } catch (error) {
    return safeError(error)
  }
})
