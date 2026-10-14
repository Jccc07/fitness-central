import { createClient } from '@/lib/supabase/server'

// Bump this whenever the wording on /consent changes. Everyone is asked again.
export const CONSENT_VERSION = 1

export async function hasCurrentConsent() {
  const supabase = await createClient()
  const { data } = await supabase.from('consents').select('version').maybeSingle()
  return !!data && data.version >= CONSENT_VERSION
}
