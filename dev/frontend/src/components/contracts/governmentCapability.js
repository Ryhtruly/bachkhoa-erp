export const GOV_SUBMIT_CAPABILITY = 'GOV_SUBMIT'
export const GOV_TRACKING_CAPABILITY = 'GOV_TRACKING'
export const LEGACY_GOV_SUBMISSION_CAPABILITY = 'GOV_SUBMISSION'

export const RECEIPT_ONLY_MODE = 'RECEIPT_ONLY'
export const TRACK_TO_COMPLETION_MODE = 'TRACK_TO_COMPLETION'

export function normalizeGovernmentCapability(value) {
  const code = String(value || '').trim().toUpperCase()
  if (code === LEGACY_GOV_SUBMISSION_CAPABILITY) return GOV_TRACKING_CAPABILITY
  return code
}

export function governmentSubmissionMode(value = {}) {
  if (value.submission_mode) return value.submission_mode
  const capability = normalizeGovernmentCapability(value.capability_code || value.capability)
  if (capability === GOV_SUBMIT_CAPABILITY) return RECEIPT_ONLY_MODE
  if (capability === GOV_TRACKING_CAPABILITY) return TRACK_TO_COMPLETION_MODE
  if (value.allow_gov_tracking || value.requires_gov_submission || value.requiresGovSubmission) {
    return TRACK_TO_COMPLETION_MODE
  }
  if (String(value.node_code || value.code || '').trim().toLowerCase() === 'k05b') {
    return TRACK_TO_COMPLETION_MODE
  }
  return null
}

export function isGovernmentCapability(value) {
  return Boolean(governmentSubmissionMode(value))
}

export function isGovernmentTracking(value) {
  return governmentSubmissionMode(value) === TRACK_TO_COMPLETION_MODE
}
