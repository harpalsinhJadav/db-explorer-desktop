/**
 * electron-builder afterPack hook.
 * --------------------------------
 * electron-builder renames/modifies the app bundle but, with `mac.identity`
 * set to null, it does NOT re-sign it. That leaves a stale/invalid signature,
 * which macOS Gatekeeper reports as "damaged and can't be opened" once the app
 * is quarantined on another machine.
 *
 * To make the bundle valid we ad-hoc sign it here (`codesign --sign -`). This
 * does NOT make it notarized — recipients still need to right-click → Open (or
 * clear quarantine) the first time — but it removes the misleading "damaged"
 * error. For zero-friction distribution, sign with a Developer ID certificate
 * and notarize instead (see README).
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  console.log(`[after-pack] ad-hoc signing ${appPath}`);

  // Strip extended attributes that can break signing, then deep ad-hoc sign.
  execFileSync('xattr', ['-cr', appPath], { stdio: 'inherit' });
  execFileSync(
    'codesign',
    ['--force', '--deep', '--sign', '-', appPath],
    { stdio: 'inherit' }
  );

  // Fail the build if the signature isn't valid.
  execFileSync(
    'codesign',
    ['--verify', '--deep', '--strict', '--verbose=2', appPath],
    { stdio: 'inherit' }
  );
  console.log('[after-pack] signature verified OK');
};
