#!/bin/bash
# Installs the Count Up panel for Adobe Premiere Pro.
set -e
cd "$(dirname "$0")"
echo "Installing the Count Up panel for Adobe Premiere Pro..."

DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/com.countup.panel"
rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
cp -R "com.countup.panel" "$DEST"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true

# The panel isn't signed by Adobe, so allow unsigned panels (one setting per CEP version).
for v in 9 10 11 12 13 14; do
  defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1
done

echo
echo "Done. Restart Premiere Pro, then open Window > Extensions > Count Up."
read -n 1 -s -r -p "Press any key to close."
