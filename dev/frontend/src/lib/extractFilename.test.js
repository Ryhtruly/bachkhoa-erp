import { describe, expect, it } from 'vitest'
import { extractFilenameFromHeader } from './api'

describe('extractFilenameFromHeader', () => {
  it('returns defaultFilename when header is missing or empty', () => {
    expect(extractFilenameFromHeader(null, 'default.txt')).toBe('default.txt')
    expect(extractFilenameFromHeader('', 'default.txt')).toBe('default.txt')
  })

  it('parses regular filename="..." and filename=...', () => {
    expect(extractFilenameFromHeader('attachment; filename="test.xlsx"')).toBe('test.xlsx')
    expect(extractFilenameFromHeader('attachment; filename=test.xlsx')).toBe('test.xlsx')
  })

  it("prefers filename*=UTF-8'' over filename=...", () => {
    const header = 'attachment; filename="safe.pdf"; filename*=UTF-8\'\'H%C3%B3a%20%C4%91%C6%A1n.pdf'
    expect(extractFilenameFromHeader(header)).toBe('Hóa đơn.pdf')
  })

  it('handles lowercase utf-8', () => {
    const header = "inline; filename*=utf-8''Bao_cao.docx"
    expect(extractFilenameFromHeader(header)).toBe('Bao_cao.docx')
  })
})
