// Google Sheets access straight from the browser. The landlord grants the
// Sheets scope through the same Firebase Google sign-in (re-auth, or linking
// Google to an email/password account), which hands back a short-lived OAuth
// access token. No server or extra API key is involved.

import {
  GoogleAuthProvider,
  linkWithPopup,
  reauthenticateWithPopup,
  type UserCredential,
} from 'firebase/auth'
import { auth } from '../firebase'

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
const API = 'https://sheets.googleapis.com/v4/spreadsheets'

let cached: { token: string; expiresAt: number } | null = null

/** A token we already hold (no popup), or null. Used for silent auto-push. */
export function cachedSheetsToken(): string | null {
  return cached && cached.expiresAt > Date.now() + 60_000 ? cached.token : null
}

/** Asks the signed-in user (via popup) to grant Google Sheets access. Must run from a click. */
export async function connectGoogleSheets(): Promise<string> {
  const existing = cachedSheetsToken()
  if (existing) return existing
  const user = auth.currentUser
  if (!user) throw new Error('Sign in first')

  const provider = new GoogleAuthProvider()
  provider.addScope(SHEETS_SCOPE)
  const hasGoogle = user.providerData.some((p) => p.providerId === 'google.com')
  if (hasGoogle && user.email) provider.setCustomParameters({ login_hint: user.email })

  let result: UserCredential
  try {
    result = hasGoogle ? await reauthenticateWithPopup(user, provider) : await linkWithPopup(user, provider)
  } catch (error) {
    if (error instanceof Error && error.message.includes('auth/user-mismatch')) {
      throw new Error(`Pick the Google account ${user.email} in the popup.`)
    }
    if (error instanceof Error && error.message.includes('auth/credential-already-in-use')) {
      throw new Error('That Google account is already used by another House Hub login.')
    }
    throw error
  }
  const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken
  if (!token) throw new Error('Google did not return Sheets access')
  // Google access tokens last an hour; refresh a little early.
  cached = { token, expiresAt: Date.now() + 55 * 60_000 }
  return token
}

async function call<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers },
  })
  if (response.status === 401) {
    cached = null
    throw new Error('Google Sheets access expired – connect again')
  }
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try {
      const body = (await response.json()) as { error?: { message?: string } }
      if (body.error?.message) message = body.error.message
    } catch {
      // Keep the status text.
    }
    if (response.status === 403) message += ' (is the Google Sheets API enabled, and do you have edit access to the sheet?)'
    if (response.status === 404) message = 'Spreadsheet not found – check the link and that you can open it'
    throw new Error(message)
  }
  return (await response.json()) as T
}

const range = (tab: string, cells: string) => encodeURIComponent(`'${tab.replace(/'/g, "''")}'!${cells}`)

export async function getSpreadsheetTitle(token: string, spreadsheetId: string): Promise<string> {
  const body = await call<{ properties: { title: string } }>(token, `${API}/${spreadsheetId}?fields=properties.title`)
  return body.properties.title
}

/** Creates the tab if the spreadsheet doesn't have it yet. */
export async function ensureTab(token: string, spreadsheetId: string, tab: string) {
  const body = await call<{ sheets: { properties: { title: string } }[] }>(
    token,
    `${API}/${spreadsheetId}?fields=sheets.properties.title`,
  )
  if (body.sheets.some((s) => s.properties.title === tab)) return
  await call(token, `${API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }),
  })
}

/** All values in columns A:Z, numbers/dates unformatted (dates arrive as serials). */
export async function readTab(token: string, spreadsheetId: string, tab: string): Promise<(string | number | boolean)[][]> {
  const body = await call<{ values?: (string | number | boolean)[][] }>(
    token,
    `${API}/${spreadsheetId}/values/${range(tab, 'A:Z')}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
  )
  return body.values ?? []
}

/**
 * Replaces the entry table (A:G) with `rows` and writes a small summary in
 * I1:J3. Written RAW so descriptions starting with "=" never become formulas.
 */
export async function writeTab(
  token: string,
  spreadsheetId: string,
  tab: string,
  rows: (string | number)[][],
  summary: (string | number)[][],
) {
  await ensureTab(token, spreadsheetId, tab)
  await call(token, `${API}/${spreadsheetId}/values/${range(tab, 'A:J')}:clear`, { method: 'POST', body: '{}' })
  await call(token, `${API}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: [
        { range: `'${tab.replace(/'/g, "''")}'!A1`, values: rows },
        { range: `'${tab.replace(/'/g, "''")}'!I1`, values: summary },
      ],
    }),
  })
}
