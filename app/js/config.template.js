/*
 * ============================================================
 *  YOUR SETTINGS. The setup wizard filled this in; edit any line and
 *  re-run Setup.cmd (choose "Update the TV") to apply your changes.
 * ============================================================
 */
window.CONFIG = {
  familyName: "{{FAMILY_NAME}}",

  location: { name: "{{CITY}}", lat: {{LAT}}, lon: {{LON}}, city: "{{CITY}}", country: "{{COUNTRY}}", prayerMethod: 8 },

  // Days of the weekend (0 = Sunday … 6 = Saturday).
  weekend: {{WEEKEND}},

  // ---------- Behaviour ----------
  idleMinutes: 5,             // no remote press for this long → gallery mode
  cardSeconds: 20,            // how long each screen in the big panel stays up
  idleArtMinutes: 3,          // how often the gallery artwork changes
  homeArtMinutes: 60,         // how often the home-screen background changes
  backgroundDim: 0.18,        // 0 = no dimming, 1 = black
  galleryFrom: "22:00",       // the gallery takes over by itself from…
  galleryUntil: "06:00",      // …until (dashboard the rest of the day; GREEN button = gallery any time)

  // The home server laptop (leave as set by the wizard).
  corsProxy: "http://{{PC_IP}}:8080/proxy?url=",

  // ---------- App tiles (bottom row) ----------
  // Press the BLUE button on the remote to list the IDs of every app on your TV.
  apps: [
    { label: "Netflix",      appId: "org.tizen.netflix-app" },
    { label: "YouTube",      appId: "9Ur5IzDKqV.TizenYouTube" },
    { label: "Prime Video",  appId: "org.tizen.primevideo" },
    { label: "Disney+",      appId: "MCmYXNxgcu.DisneyPlus" },
    { label: "YouTube Kids", appId: "com.samsung.tv.cobalt-ytkids" },
    { label: "Spotify",      appId: "rJeHak5zRg.Spotify" },
    { label: "Apple TV",     appId: "com.samsung.tv.aria-video" }
  ],

  // ---------- Museum art (no keys needed) ----------
  // source "aic" = Art Institute of Chicago, "cma" = Cleveland Museum of Art (open-access collections).
  artThemes: [
    { name: "Impressionism",     source: "aic", query: "impressionism" },
    { name: "Japanese prints",   source: "aic", query: "ukiyo-e woodblock print" },
    { name: "Indian miniatures", source: "cma", query: "painting", department: "Indian and Southeast Asian Art" },
    { name: "Landscapes",        source: "cma", query: "landscape", type: "Painting" }
  ],

  // ---------- Film posters in the gallery (optional) ----------
  // Free key from themoviedb.org (Settings → API → "API Key"). Leave blank for paintings only.
  tmdbKey: "",
  posterEvery: 5,             // one poster for every N gallery pictures

  // ---------- Family photo frame (optional, needs extras/photo-frame) ----------
  photoFrame: false,

  // ---------- Calendars (optional) ----------
  // Google Calendar → Settings → your calendar → "Secret address in iCal format". One link per line.
  calendars: {{CALENDARS}},

  // ---------- World clock ----------
  // tz = time-zone name; base = minutes from UTC (backup only); dst: "eu", "na", "eg" or null.
  worldClock: [
    { name: "Dubai",   tz: "Asia/Dubai",       base: 240,  dst: null },
    { name: "Mumbai",  tz: "Asia/Kolkata",     base: 330,  dst: null },
    { name: "London",  tz: "Europe/London",    base: 0,    dst: "eu" },
    { name: "New York",tz: "America/New_York", base: -300, dst: "na" },
    { name: "Sydney",  tz: "Australia/Sydney", base: 600,  dst: null }
  ],

  // ---------- Exchange rates ----------
  fx: { base: "{{FX_BASE}}", quote: "{{FX_QUOTE}}", gold: true },   // 1 base → quote, plus 1 USD → quote and 22K gold per gram

  // ---------- Spoken greeting + music when the TV switches on ----------
  greetings: {
    enabled: true,
    morningName: "{{FIRST_NAME}}",
    eveningName: "everyone",
    voice: "{{VOICE}}",            // e.g. en-IN-NeerjaNeural, en-GB-SoniaNeural, en-US-JennyNeural
    // Devotional music only in this early-morning window; instrumental jazz at all other times.
    bhajanFrom: "{{BHAJAN_FROM}}", bhajanUntil: "{{BHAJAN_UNTIL}}",
    bhajanUrls: [
      "http://millenniumhits.out.airtime.pro:8000/millenniumhits_a",
      "http://radio2bindia.out.airtime.pro:8000/radio2bindia_a",
      "https://stream.zeno.fm/syu0rdutvxhvv"
    ],
    jazzUrls: [
      "https://0nlineradio.radioho.st/lounge-piano-jazz-bar",
      "https://radio4.vip-radios.fm:18060/stream-128kmp3-SmoothJazzLounge",
      "http://jking.cdnstream1.com/b22139_128mp3",
      "https://ice2.somafm.com/dronezone-128-mp3"
    ]
  },

  // ---------- Commute (optional: Google Maps key with Routes API + Maps Static API) ----------
  workTitles: "show",
  googleMapsKey: "{{MAPS_KEY}}",
  commute: {
    label: "To office",
    origin: "{{HOME_ADDRESS}}",
    destination: "{{WORK_ADDRESS}}",
    fromHour: 6, toHour: 10, startTime: "09:00"
  },
  airportAddress: "",

  spotify: { clientId: "", refreshToken: "" },
  cricket: { apiKey: "", team: "India" },

  // ---------- Headlines (no key) ----------
  news: {{NEWS}},

  // ---------- Kids' board (optional) ----------
  kids: {{KIDS}},
  kidsSheetCsv: "",

  flights: { rapidApiKey: "", airport: "DXB", list: [] },   // airport = your home airport code

  // ---------- Countdowns ----------
  countdowns: [
    // { label: "Diwali", date: "2026-11-08" }
  ],

  demo: false
};
