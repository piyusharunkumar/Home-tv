# Switches the Samsung TV on over Wi-Fi (Wake-on-LAN). Used by the scheduled tasks.
param([string]$Mode = 'test')
$Root = 'C:\HomeTV'
$S = Get-Content (Join-Path $Root 'settings.json') -Raw | ConvertFrom-Json
$tv = $S.tvIp; $mac = $S.tvMac
$log = Join-Path $Root 'wake-log.txt'
function Log($m) { Add-Content $log ("{0:yyyy-MM-dd HH:mm:ss} [{1}] {2}" -f (Get-Date), $Mode, $m) }
function TvOn { try { return (Invoke-RestMethod "http://$tv`:8001/api/v2/" -TimeoutSec 4).device.PowerState -eq 'on' } catch { return $false } }
if (-not $mac) { Log 'TV network address unknown - run Setup.cmd again with the TV switched on.'; exit 1 }
if (TvOn) { Log 'TV already on.'; exit 0 }
$bytes = ($mac -split '[-:]') | ForEach-Object { [Convert]::ToByte($_, 16) }
$packet = [byte[]](,0xFF * 6) + ($bytes * 16)
$udp = New-Object Net.Sockets.UdpClient; $udp.EnableBroadcast = $true
$bcast = (($S.pcIp -split '\.')[0..2] -join '.') + '.255'
for ($i = 0; $i -lt 5; $i++) { foreach ($t in '255.255.255.255', $bcast, $tv) { foreach ($p in 9, 7) { [void]$udp.Send($packet, $packet.Length, $t, $p) } }; Start-Sleep -Milliseconds 700 }
$udp.Close()
for ($i = 0; $i -lt 12; $i++) { Start-Sleep 5; if (TvOn) { Log 'Woke the TV.'; exit 0 } }
Log 'Sent the wake signal but the TV did not switch on. Check: TV plugged in, and Settings > General > Network > Expert Settings > Power On with Mobile = ON.'
