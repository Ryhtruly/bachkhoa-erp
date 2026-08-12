const TERMINAL_SURVEY_STATUSES = new Set(['Hoàn thành', 'Nộp thành công'])
const TERMINAL_LEGAL_STATUSES = new Set(['Hoàn thành'])

export const isTerminalSurveyStatus = (status) => TERMINAL_SURVEY_STATUSES.has(status)
export const isTerminalLegalStatus = (status) => TERMINAL_LEGAL_STATUSES.has(status)
