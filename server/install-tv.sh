#!/bin/bash
# Builds the dashboard and installs it on the Samsung TV (runs inside the Tizen SDK container).
set -e
TV_IP="${1:?TV IP missing}"
PROFILE=hometv
PASS=hometv1234
DATA=/home/developer/tizen-studio-data
AUTHOR="$DATA/keystore/author/$PROFILE.p12"
APP_ID=$(grep -o 'application id="[^"]*"' /work/app/config.xml | cut -d'"' -f2)
if [ ! -f "$AUTHOR" ]; then
  echo "== Creating signing certificate"
  tizen certificate -a "$PROFILE" -p "$PASS" -c AE -ct Home -n "Home TV" -f "$PROFILE" >/dev/null
fi
DIST=$(find / -path '*certificate-generator/certificates/distributor/tizen-distributor-signer.p12' 2>/dev/null | head -1)
[ -n "$DIST" ] || { echo "Distributor certificate not found"; exit 1; }
DCA=$(dirname "$DIST")/tizen-distributor-ca.cer
mkdir -p "$DATA/profile"
cat > "$DATA/profile/profiles.xml" <<XML
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<profiles active="$PROFILE" version="3.1">
<profile name="$PROFILE">
<profileitem ca="" distributor="0" key="$AUTHOR" password="$PASS" rootca=""/>
<profileitem ca="$DCA" distributor="1" key="$DIST" password="tizenpkcs12passfordsigner" rootca=""/>
<profileitem ca="" distributor="2" key="" password="" rootca=""/>
</profile>
</profiles>
XML
tizen cli-config "profiles.path=$DATA/profile/profiles.xml" >/dev/null 2>&1 || true
echo "== Building"
rm -rf /tmp/app && cp -r /work/app /tmp/app
tizen build-web -- /tmp/app >/dev/null
tizen package -t wgt -s "$PROFILE" -- /tmp/app/.buildResult >/dev/null || { find / -name cli.log 2>/dev/null -exec tail -12 {} \; ; exit 1; }
WGT=$(ls /tmp/app/.buildResult/*.wgt | head -1)
echo "== Connecting to TV $TV_IP"
sdb connect "$TV_IP" >/dev/null; sleep 2
echo "== Installing"
tizen install -s "$TV_IP:26101" -n "$(basename "$WGT")" -- /tmp/app/.buildResult
tizen run -s "$TV_IP:26101" -p "$APP_ID" || true
sdb disconnect "$TV_IP" >/dev/null 2>&1; sdb kill-server >/dev/null 2>&1
echo "== Done"
