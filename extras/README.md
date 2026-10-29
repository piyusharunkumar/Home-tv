# Optional extras

These run as extra containers next to the main relay. Each one is optional, and you can run any combination. You'll need to type a few commands in a terminal (PowerShell or the Docker Desktop terminal).

## 1. Set up your settings

Copy `extras/.env.example` to `extras/.env` and fill in only the parts you need. Never share your `.env`.

## 2. Sign in (one time, only for the ones you use)

From `C:\HomeTV\server`:

```
# Find My: asks for your Apple ID password and the 6-digit code, then remembers the session
docker compose -f docker-compose.yml -f ../extras/docker-compose.extras.yml run --rm findmy python /app/findmy.py login

# Gmail: paste a Google app password (myaccount.google.com/apppasswords), not your normal password
docker compose -f docker-compose.yml -f ../extras/docker-compose.extras.yml run --rm mailwatch python /app/mailwatch.py login
```

## 3. Start them

```
docker compose -f docker-compose.yml -f ../extras/docker-compose.extras.yml up -d --build findmy mailwatch photos
```

Leave out any you don't want.

## What each one does

- **findmy**: during the window you set (e.g. weekday evenings) it shows a live "on the way home" map with the drive time, and greets you when you get home. It can also switch the TV on when you arrive. Uses Apple's Find My through the `pyicloud` library.
- **mailwatch**: reads Gmail (read-only) for delivery updates from Amazon, Amazon Now, noon and Temu, and bills you list in `mailwatch.py`. The bill rules included are examples for UAE and Indian providers; edit them for yours.
- **photos**: picks good photos from a folder (add a line like `PHOTO_FOLDER=C:/Photos` to `server/.env`), skips screenshots and receipts, and shows one in a small frame on the home screen, favouring photos taken on this day in earlier years. Set `photoFrame: true` in `app/js/config.js` and update the TV.

Your data stays on your laptop. Nothing is sent anywhere except to Apple, Google and the TV.
