/**
 * macOS code-signing + notarization hook — called by electron-builder afterSign.
 *
 * Signing (Developer ID Application certificate) is handled automatically by
 * electron-builder before this hook runs. These env vars drive it:
 *
 *   CSC_LINK              – .p12 certificate file path  OR  base64-encoded .p12
 *                           (local: leave unset; Keychain is used automatically)
 *                           (CI:    base64 -i "Developer ID Application.p12")
 *   CSC_KEY_PASSWORD      – password that protects the .p12 file
 *
 * After signing, this hook submits the signed .app to Apple's notary service.
 * These env vars are required for notarization:
 *
 *   APPLE_ID                    – your Apple ID email (e.g. you@example.com)
 *   APPLE_APP_SPECIFIC_PASSWORD – app-specific password from appleid.apple.com
 *   APPLE_TEAM_ID               – 10-character Team ID from developer.apple.com
 *
 * The hook is a no-op on any platform other than macOS.
 * If any APPLE_* variable is absent the hook prints a warning and exits cleanly,
 * so local builds without notarization credentials are not blocked.
 */

const { notarize } = require('@electron/notarize')
const { execFileSync } = require('child_process')

exports.default = async function notarizing(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = context.packager.appInfo.productFilename
  const appPath = `${context.appOutDir}/${appName}.app`

  // Guard: verify the binary is actually code-signed before trying to notarize.
  // If CSC_LINK / Keychain cert was missing, electron-builder skips signing and
  // Apple's notary service will reject an unsigned submission.
  try {
    execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'pipe' })
  } catch {
    console.warn(
      '[notarize] Skipping — app is not code-signed.\n' +
      '           Set CSC_LINK + CSC_KEY_PASSWORD (or install the "Developer ID\n' +
      '           Application" certificate in Keychain) before running publish:mac.',
    )
    return
  }

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env

  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.warn(
      '[notarize] Skipping — APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and ' +
      'APPLE_TEAM_ID must all be set.',
    )
    return
  }

  console.log(`[notarize] Submitting ${appPath} to Apple notary service…`)

  try {
    await notarize({
      tool: 'notarytool',
      appPath,
      appleId: APPLE_ID,
      appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
      teamId: APPLE_TEAM_ID,
    })
  } catch (err) {
    // notarize() staples right after Apple accepts the submission, retrying only a
    // few seconds apart. A staple failure means the app IS notarized but the runner
    // couldn't fetch the ticket (e.g. "network connection was lost", code 68), so
    // retry with longer waits instead of failing the release.
    if (!/^Failed to staple/.test(String(err && err.message))) throw err
    console.warn(`[notarize] Notarized, but stapling failed: ${err.message.split('\n')[0]}`)
    if (!(await stapleWithRetry(appPath))) {
      console.warn(
        '[notarize] Shipping without a stapled ticket. Gatekeeper fetches it online on\n' +
        '           first launch, so only offline first launches are affected.',
      )
    }
  }

  console.log('[notarize] Notarization complete.')
}

async function stapleWithRetry(appPath, attempts = 5, waitMs = 30_000) {
  for (let i = 1; i <= attempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    try {
      execFileSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'pipe' })
      console.log(`[notarize] Stapled on retry ${i}/${attempts}.`)
      return true
    } catch (err) {
      const out = String(err.stdout || err.message).trim().split('\n').pop()
      console.warn(`[notarize] Staple retry ${i}/${attempts} failed: ${out}`)
    }
  }
  return false
}
