/**
 * Electron Fuses + asar integrity hook — called by electron-builder afterPack.
 *
 * Fuses are boolean flags flipped in the packaged Electron binary that disable
 * powerful-but-rarely-needed capabilities at the C++ level (cannot be re-enabled
 * by env vars or CLI args at runtime). Combined with the existing code signing,
 * EnableEmbeddedAsarIntegrityValidation gives us tamper protection: the signed
 * binary refuses to launch if app.asar is modified after packaging.
 *
 * Ordering matters: afterPack runs BEFORE afterSign (build/notarize.cjs). Flipping
 * fuses mutates the binary, so it must happen before code signing — otherwise the
 * signature would not cover the post-flip bytes. On macOS, resetAdHocDarwinSignature
 * clears the ad-hoc signature the flip leaves behind so electron-builder's signing
 * step re-signs a clean binary.
 *
 * Validation is only meaningful on a CI *signed* build, never a local unsigned one:
 * EnableEmbeddedAsarIntegrityValidation interacts with code signing.
 */

const path = require('path')
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')

exports.default = async function flipAppFuses(context) {
  const { electronPlatformName, appOutDir } = context
  const appName = context.packager.appInfo.productFilename

  let electronBinaryPath
  switch (electronPlatformName) {
    case 'darwin':
      electronBinaryPath = path.join(appOutDir, `${appName}.app`, 'Contents', 'MacOS', appName)
      break
    case 'win32':
      electronBinaryPath = path.join(appOutDir, `${appName}.exe`)
      break
    case 'linux':
      electronBinaryPath = path.join(appOutDir, appName.toLowerCase())
      break
    default:
      throw new Error(`[fuses] Unsupported platform: ${electronPlatformName}`)
  }

  console.log(`[fuses] Flipping fuses on ${electronBinaryPath}`)

  await flipFuses(electronBinaryPath, {
    version: FuseVersion.V1,
    // macOS: clear the ad-hoc signature the flip leaves so afterSign re-signs cleanly.
    resetAdHocDarwinSignature: electronPlatformName === 'darwin',
    // Disallow running the packaged binary as a plain Node process (ELECTRON_RUN_AS_NODE).
    [FuseV1Options.RunAsNode]: false,
    // Ignore NODE_OPTIONS — blocks injecting flags into the privileged process.
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    // Ignore --inspect / --inspect-brk — blocks attaching a debugger to main.
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    // Only load app code from app.asar (not an unpacked app/ dir).
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    // Tamper protection: validate app.asar against the hash baked into the signed binary.
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  })

  console.log('[fuses] Fuses flipped.')
}
