# Home TV Gallery - setup wizard. Run via Setup.cmd (as administrator).
$ErrorActionPreference = 'Continue'
$Kit  = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Root = 'C:\HomeTV'
$SDK  = 'vitalets/tizen-webos-sdk'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Say($m, $c = 'Cyan') { Write-Host ''; Write-Host $m -ForegroundColor $c }
function Ask($q, $def) { $a = Read-Host ("  " + $q + $(if ($def) { " [$def]" } else { '' })); if ([string]::IsNullOrWhiteSpace($a)) { return $def } return $a.Trim() }
function YesNo($q, $def = 'y') { $a = Ask "$q (y/n)" $def; return $a -match '^[yY]' }
function Wait-Key($m) { Write-Host "  $m" -ForegroundColor Yellow; [void](Read-Host '  Press Enter when done') }
function Port-Open($ip, $port, $ms = 1500) { $c = New-Object Net.Sockets.TcpClient; try { return $c.ConnectAsync($ip, $port).Wait($ms) -and $c.Connected } catch { return $false } finally { $c.Close() } }

Write-Host '==============================================' -ForegroundColor Green
Write-Host '   Home TV Gallery - setup' -ForegroundColor Green
Write-Host '==============================================' -ForegroundColor Green

# ---------- 0. Copy the kit to C:\HomeTV (keeps your settings on re-runs) ----------
if ($Kit -ne $Root) {
  New-Item -ItemType Directory -Force -Path $Root | Out-Null
  foreach ($d in 'app', 'server', 'windows', 'extras') { robocopy (Join-Path $Kit $d) (Join-Path $Root $d) /E /NFL /NDL /NJH /NJS /XF config.js settings.json .env | Out-Null }
}
$SettingsF = Join-Path $Root 'settings.json'
$S = @{}
if (Test-Path $SettingsF) { (Get-Content $SettingsF -Raw | ConvertFrom-Json).psobject.Properties | ForEach-Object { $S[$_.Name] = $_.Value } }

$mode = '1'
if ($S.tvIp) {
  Say 'Welcome back. What would you like to do?'
  Write-Host '  1) Change my answers and reinstall'
  Write-Host '  2) Reinstall the TV app with my current config.js (keeps your own edits)'
  $mode = Ask 'Choose 1 or 2' '2'
}

# ---------- 1. Docker Desktop ----------
Say 'Step 1 of 7 - Checking Docker Desktop'
$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
  Write-Host '  Docker Desktop is not installed yet.' -ForegroundColor Yellow
  if (YesNo 'Install it now with winget?') {
    winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
  } else { Start-Process 'https://www.docker.com/products/docker-desktop/' }
  Say 'Restart the laptop, open Docker Desktop once (accept its terms, skip sign-in), then run Setup.cmd again.' 'Yellow'
  exit
}
$ok = $false
for ($i = 0; $i -lt 60 -and -not $ok; $i++) {
  docker info *> $null; $ok = ($LASTEXITCODE -eq 0)
  if (-not $ok) {
    if ($i -eq 0) { Write-Host '  Starting Docker Desktop...'; Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe" -ErrorAction SilentlyContinue }
    Start-Sleep 5
  }
}
if (-not $ok) { Say 'Docker Desktop is not running. Open it, wait for "Engine running", then run Setup.cmd again.' 'Red'; exit }
Write-Host '  Docker is running.' -ForegroundColor Green
# Make Docker Desktop start by itself when Windows signs in.
foreach ($f in "$env:APPDATA\Docker\settings-store.json", "$env:APPDATA\Docker\settings.json") {
  if (Test-Path $f) { try { $j = Get-Content $f -Raw | ConvertFrom-Json; if ($j.PSObject.Properties['AutoStart']) { $j.AutoStart = $true } else { $j | Add-Member AutoStart $true }; $j | ConvertTo-Json -Depth 20 | Set-Content $f } catch {} }
}

# ---------- 2. Find the TV ----------
if ($mode -eq '1' -or -not $S.tvIp) {
  Say 'Step 2 of 7 - Finding your Samsung TV (make sure it is switched ON)'
  $cfg = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
  $pcIp = $cfg.IPv4Address.IPAddress | Select-Object -First 1
  $net = ($pcIp -split '\.')[0..2] -join '.'
  $tasks = @{}
  foreach ($n in 1..254) { $ip = "$net.$n"; if ($ip -ne $pcIp) { $c = New-Object Net.Sockets.TcpClient; $tasks[$ip] = @($c, $c.ConnectAsync($ip, 8001)) } }
  Start-Sleep -Milliseconds 2500
  $tvs = @()
  foreach ($ip in $tasks.Keys) {
    $c, $t = $tasks[$ip]
    if ($t.IsCompleted -and -not $t.IsFaulted -and $c.Connected) {
      try { $d = (Invoke-RestMethod "http://$ip`:8001/api/v2/" -TimeoutSec 3).device; if ($d.OS -eq 'Tizen') { $tvs += [pscustomobject]@{ ip = $ip; name = $d.name; model = $d.modelName; mac = $d.wifiMac } } } catch {}
    }
    $c.Close()
  }
  if ($tvs.Count -eq 0) {
    Write-Host '  No Samsung TV found automatically.' -ForegroundColor Yellow
    $tvIp = Ask "Type your TV's IP address (TV: Settings > General > Network > Network Status > IP Settings)" ''
    $tvMac = ''
  } else {
    for ($i = 0; $i -lt $tvs.Count; $i++) { Write-Host ("  {0}) {1}  {2}  ({3})" -f ($i + 1), $tvs[$i].name, $tvs[$i].model, $tvs[$i].ip) }
    $pick = [int](Ask 'Which TV?' '1') - 1
    $tvIp = $tvs[$pick].ip; $tvMac = $tvs[$pick].mac
  }
  $S.tvIp = $tvIp; $S.tvMac = $tvMac; $S.pcIp = $pcIp; $S.gateway = $cfg.IPv4DefaultGateway.NextHop

  # ---------- 3. Questions ----------
  Say 'Step 3 of 7 - A few questions (press Enter to accept the suggestion in [brackets])'
  $S.firstName  = Ask 'Your first name (used in the morning greeting)' $S.firstName
  $S.familyName = Ask 'Family name for the home screen, e.g. "Sharma family"' $(if ($S.familyName) { $S.familyName } else { "$($S.firstName)'s family" })
  $city = Ask 'Your city' $(if ($S.city) { $S.city } else { 'Dubai' })
  try {
    $g = (Invoke-RestMethod ("https://geocoding-api.open-meteo.com/v1/search?count=1&name=" + [uri]::EscapeDataString($city))).results[0]
    $S.city = $g.name; $S.lat = $g.latitude; $S.lon = $g.longitude; $S.country = $g.country_code; $S.tz = $g.timezone
    Write-Host ("  Found {0}, {1}" -f $g.name, $g.country)
  } catch { Write-Host '  Could not look the city up; using Dubai.' -ForegroundColor Yellow; $S.city = 'Dubai'; $S.lat = 25.2048; $S.lon = 55.2708; $S.country = 'AE'; $S.tz = 'Asia/Dubai' }
  Write-Host '  Weekend: 1) Saturday + Sunday   2) Friday + Saturday   3) Sunday only'
  $S.weekend = @{ '1' = '[6, 0]'; '2' = '[5, 6]'; '3' = '[0]' }[(Ask 'Choose' '1')]
  if (-not $S.weekend) { $S.weekend = '[6, 0]' }
  $S.fxBase  = (Ask 'Exchange rate - your local currency (3 letters)' $(if ($S.fxBase) { $S.fxBase } else { 'AED' })).ToUpper()
  $S.fxQuote = (Ask 'Exchange rate - show it in which currency?' $(if ($S.fxQuote) { $S.fxQuote } else { 'INR' })).ToUpper()
  Write-Host '  Greeting voice: 1) Indian English  2) British  3) American'
  $S.voice = @{ '1' = 'en-IN-NeerjaNeural'; '2' = 'en-GB-SoniaNeural'; '3' = 'en-US-JennyNeural' }[(Ask 'Choose' '1')]
  if (-not $S.voice) { $S.voice = 'en-IN-NeerjaNeural' }
  $S.devotional = YesNo 'Play devotional music (bhajans) for an early-morning switch-on? Otherwise instrumental jazz' $(if ($S.devotional -eq $false) { 'n' } else { 'y' })
  $S.morningWake = Ask 'Switch the TV on by itself on workdays at (HH:MM, or "off")' $(if ($S.morningWake) { $S.morningWake } else { '06:30' })
  $S.weekendWake = Ask 'Switch the TV on by itself on weekend mornings at (HH:MM, or "off")' $(if ($S.weekendWake) { $S.weekendWake } else { '09:00' })
  $S.eveningWake = Ask 'Switch the TV on by itself on workday evenings at (HH:MM, or "off")' $(if ($S.eveningWake) { $S.eveningWake } else { '19:00' })

  Say 'Optional extras - press Enter to skip any of them' 'Gray'
  $cals = @(); if ($S.calendars) { $cals = @($S.calendars) }
  if (YesNo 'Show Google Calendar(s) on the TV?' $(if ($cals.Count) { 'y' } else { 'n' })) {
    Write-Host '  Google Calendar (on a computer) > Settings > pick the calendar > "Secret address in iCal format". Paste one per line, empty line to finish.'
    $cals = @(); while ($true) { $l = Read-Host '  link'; if ([string]::IsNullOrWhiteSpace($l)) { break }; $cals += $l.Trim() }
  }
  $S.calendars = $cals
  $S.mapsKey = Ask 'Google Maps key for the live commute map (see the guide; Enter to skip)' $S.mapsKey
  if ($S.mapsKey) { $S.home = Ask 'Home address (building, area, city)' $S.home; $S.work = Ask 'Office address' $S.work }
  $kids = Ask 'Kids'' names for the chores board, comma separated (Enter to skip)' $S.kids
  $S.kids = $kids
  $S.Keys | Out-Null
}

# ---------- 4. Write config.js ----------
$cfgFile = Join-Path $Root 'app\js\config.js'
if ($mode -eq '1' -or -not (Test-Path $cfgFile)) {
  Say 'Step 4 of 7 - Writing your settings'
  function J($x) { return ($x | ConvertTo-Json -Compress) }
  $kidsJson = '[]'
  if ($S.kids) { $kidsJson = J @(($S.kids -split ',') | Where-Object { $_.Trim() } | ForEach-Object { @{ name = $_.Trim(); tasks = @('Homework done', 'Read 20 minutes', 'Pack school bag', 'Tidy room') } }) }
  $news = @{ AE = @(@{ label = 'UAE'; url = 'https://news.google.com/rss?hl=en-AE&gl=AE&ceid=AE:en' }, @{ label = 'India'; url = 'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en' }) }[$S.country]
  if (-not $news) { $cc = $S.country; $news = @(@{ label = $S.city; url = "https://news.google.com/rss?hl=en-$cc&gl=$cc&ceid=$cc`:en" }, @{ label = 'World'; url = 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en' }) }
  $t = [IO.File]::ReadAllText((Join-Path $Root 'app\js\config.template.js'), $utf8)
  $map = @{
    '{{FAMILY_NAME}}' = ($S.familyName -replace '"', ''); '{{FIRST_NAME}}' = ($S.firstName -replace '"', ''); '{{CITY}}' = $S.city
    '{{LAT}}' = "$($S.lat)"; '{{LON}}' = "$($S.lon)"; '{{COUNTRY}}' = $S.country; '{{WEEKEND}}' = $S.weekend; '{{PC_IP}}' = $S.pcIp
    '{{CALENDARS}}' = $(if ($S.calendars.Count) { J @($S.calendars) } else { '[]' }); '{{MAPS_KEY}}' = "$($S.mapsKey)"
    '{{HOME_ADDRESS}}' = ("$($S.home)" -replace '"', ''); '{{WORK_ADDRESS}}' = ("$($S.work)" -replace '"', '')
    '{{FX_BASE}}' = $S.fxBase; '{{FX_QUOTE}}' = $S.fxQuote; '{{VOICE}}' = $S.voice; '{{NEWS}}' = (J @($news)); '{{KIDS}}' = $kidsJson
    '{{BHAJAN_FROM}}' = $(if ($S.devotional) { '04:30' } else { '00:00' }); '{{BHAJAN_UNTIL}}' = $(if ($S.devotional) { '07:30' } else { '00:00' })
  }
  foreach ($k in $map.Keys) { $t = $t.Replace($k, [string]$map[$k]) }
  [IO.File]::WriteAllText($cfgFile, $t, $utf8)
  if (-not $S.pushKey) { $S.pushKey = -join ((48..57 + 97..102) | Get-Random -Count 8 | ForEach-Object { [char]$_ }) }
  [IO.File]::WriteAllText((Join-Path $Root 'server\.env'), "TZ_NAME=$($S.tz)`nPUSH_KEY=$($S.pushKey)`n", $utf8)
  $S | ConvertTo-Json | Set-Content $SettingsF
}

# ---------- 5. Keep the laptop awake + home server service ----------
Say 'Step 5 of 7 - Preparing this laptop as an always-on home server'
powercfg /change monitor-timeout-ac 0; powercfg /change standby-timeout-ac 0; powercfg /change hibernate-timeout-ac 0
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg -attributes SUB_VIDEO 8ec4b3a5-6868-48c2-be75-4f3044be88a7 -ATTRIB_HIDE
powercfg /setacvalueindex SCHEME_CURRENT SUB_VIDEO 8ec4b3a5-6868-48c2-be75-4f3044be88a7 0
powercfg /setactive SCHEME_CURRENT
Write-Host '  Never sleeps on mains power; closing the lid does nothing.'
if (-not (Get-NetFirewallRule -DisplayName 'Home TV relay' -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName 'Home TV relay' -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Any | Out-Null
}
Push-Location (Join-Path $Root 'server')
$ErrorActionPreference = 'Continue'
docker compose up -d --build 2>&1 | Select-Object -Last 2
Pop-Location
Write-Host '  Home server service is running.' -ForegroundColor Green

# ---------- 6. Install on the TV ----------
Say 'Step 6 of 7 - Installing the app on your TV'
$tv = $S.tvIp
if (-not (Port-Open $tv 26101)) {
  Write-Host '  The TV needs Developer Mode switched on (one time):' -ForegroundColor Yellow
  Write-Host '   1. On the TV open Apps (the Apps panel on the home screen).'
  Write-Host '   2. Using the remote''s number pad type 1 2 3 4 5 (on remotes without numbers press the 123 button first).'
  Write-Host '   3. Switch Developer mode ON and set Host PC IP to:' -NoNewline; Write-Host " $($S.pcIp)" -ForegroundColor Green
  Write-Host '   4. Press OK, then restart the TV (hold the power button until the Samsung logo appears).'
  while (-not (Port-Open $tv 26101)) { Wait-Key 'Waiting for the TV... (it must be switched on)' }
}
docker rm -f hometv-watch *> $null
docker run --rm -v "${Root}:/work" -v hometv-tizen:/home/developer/tizen-studio-data $SDK bash /work/server/install-tv.sh $tv 2>&1 | Select-Object -Last 4
docker run -d --name hometv-watch --restart always -e TV_IP=$tv -v "${Root}:/work" $SDK bash /work/server/autostart.sh | Out-Null
Write-Host '  Installed. The dashboard now opens whenever the TV is switched on.' -ForegroundColor Green

# ---------- 7. Daily switch-on + health check ----------
Say 'Step 7 of 7 - Scheduling the daily switch-on'
if (-not $S.tvMac) { try { $S.tvMac = (Invoke-RestMethod "http://$tv`:8001/api/v2/" -TimeoutSec 4).device.wifiMac } catch {} ; $S | ConvertTo-Json | Set-Content $SettingsF }
$user = "$env:USERDOMAIN\$env:USERNAME"
$set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
$pr = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
function PS-Action($file, $arg) { New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Root\windows\$file`" $arg" }
$workdays = @('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday') | Where-Object { ($S.weekend -replace '[\[\] ]', '' -split ',') -notcontains [string]([array]::IndexOf(@('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'), $_)) }
Unregister-ScheduledTask -TaskName 'Home TV - morning' -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'Home TV - evening' -Confirm:$false -ErrorAction SilentlyContinue
if ($S.morningWake -match '^\d{1,2}:\d{2}$') { Register-ScheduledTask -TaskName 'Home TV - morning' -Action (PS-Action 'wake-tv.ps1' '-Mode morning') -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek $workdays -At $S.morningWake) -Settings $set -Principal $pr -Force | Out-Null; Write-Host "  Workdays at $($S.morningWake)" }
if ($S.weekendWake -match '^\d{1,2}:\d{2}$') { Register-ScheduledTask -TaskName 'Home TV - weekend morning' -Action (PS-Action 'wake-tv.ps1' '-Mode morning') -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Saturday,Sunday -At $S.weekendWake) -Settings $set -Principal $pr -Force | Out-Null; Write-Host "  Weekends at $($S.weekendWake)" }
if ($S.eveningWake -match '^\d{1,2}:\d{2}$') { Register-ScheduledTask -TaskName 'Home TV - evening' -Action (PS-Action 'wake-tv.ps1' '-Mode evening') -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek $workdays -At $S.eveningWake) -Settings $set -Principal $pr -Force | Out-Null; Write-Host "  Workday evenings at $($S.eveningWake)" }
Register-ScheduledTask -TaskName 'Home TV - health check' -Action (PS-Action 'tv-health.ps1' '') -Trigger (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 30)) -Settings $set -Principal $pr -Force | Out-Null
Write-Host '  TV setting needed for this: Settings > General > Network > Expert Settings > Power On with Mobile = ON' -ForegroundColor Yellow

# ---------- Done ----------
$auto = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' -ErrorAction SilentlyContinue).AutoAdminLogon
Say 'All done!' 'Green'
Write-Host "  Switch the TV off and on again - within ~15 seconds you'll see the dashboard and hear the greeting."
Write-Host '  Remote: LEFT/RIGHT = screens, GREEN = gallery, BLUE = list app IDs, RED = refresh, Play/Pause = stop music.'
if ($auto -ne '1') {
  Write-Host ''
  Write-Host '  One last recommended step: let this laptop sign in by itself after a restart (Windows updates),' -ForegroundColor Yellow
  Write-Host '  otherwise the TV features pause until someone signs in. See "Automatic sign-in" in START-HERE.html.' -ForegroundColor Yellow
}
