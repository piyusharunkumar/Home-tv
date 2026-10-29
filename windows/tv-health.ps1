# Every 30 minutes: keeps the TV watcher and relay running, and logs problems to C:\HomeTV\health-log.txt
$Root = 'C:\HomeTV'
$S = Get-Content (Join-Path $Root 'settings.json') -Raw | ConvertFrom-Json
$notes = @()
if (-not (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object IPAddress -eq $S.pcIp)) { $notes += "laptop address changed from $($S.pcIp) - run Setup.cmd again (option 1)" }
$w = docker inspect -f '{{.State.Running}}' hometv-watch 2>$null
if ($w -ne 'true') { docker start hometv-watch 2>$null | Out-Null; $notes += 'restarted the TV watcher' }
try { Invoke-WebRequest 'http://127.0.0.1:8080/health' -UseBasicParsing -TimeoutSec 5 | Out-Null } catch { Push-Location (Join-Path $Root 'server'); docker compose up -d 2>$null | Out-Null; Pop-Location; $notes += 'restarted the relay' }
try {
  if ((Invoke-RestMethod "http://$($S.tvIp)`:8001/api/v2/" -TimeoutSec 5).device.PowerState -eq 'on') {
    $c = New-Object Net.Sockets.TcpClient; $ok = $false; try { $ok = $c.ConnectAsync($S.tvIp, 26101).Wait(3000) -and $c.Connected } catch {}; $c.Close()
    if (-not $ok) { $notes += 'TV Developer Mode looks switched off (Apps > 12345 > Developer mode ON, Host PC IP ' + $S.pcIp + ', restart TV)' }
  }
} catch {}
Add-Content (Join-Path $Root 'health-log.txt') ("{0:yyyy-MM-dd HH:mm} {1}" -f (Get-Date), $(if ($notes) { $notes -join '; ' } else { 'ok' }))
