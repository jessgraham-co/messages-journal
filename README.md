# Messages (private journal)

A private, local-only web app styled like the iOS Messages app. Nothing you write here ever leaves your phone — there's no server, no network request, no analytics. Every conversation and message is saved in your browser's local storage on your device only.

## Deploy to GitHub Pages

1. Create a new **private** GitHub repository (private is optional, but recommended since it's personal).
2. Push these files to it:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```
3. In the repo, go to **Settings → Pages**, set **Source** to the `main` branch, root folder, and save.
4. GitHub will give you a URL like `https://YOUR_USERNAME.github.io/YOUR_REPO/`. It can take a minute or two to go live.

## Install it on your iPhone

1. Open that URL in **Safari** on your iPhone (it won't add correctly from Chrome or other browsers).
2. Tap the **Share** button, then **Add to Home Screen**.
3. It'll appear as its own app icon and open full-screen, with no Safari address bar.

## How it works

- **Compose (✎, top right)** — start a new conversation. Type a name in "To:", write a message, hit send. If that name already exists it adds to the existing thread instead of making a duplicate. On a brand-new install with zero conversations, there's also a big blue compose button in the bottom right.
- **Search** filters conversations by name *and* by message content — if a message inside a thread matches, that message shows as the preview with your search term highlighted.
- **Tapping a contact's name/photo** at the top of a conversation lets you rename them or add a photo.
- **Tapping your last message** toggles its status between "Delivered" and "Read" — that's manual, nothing is simulated automatically.
- **Edit (top left of the inbox)** lets you delete conversations. It's hidden automatically when there's nothing to edit.
- **Settings (gear icon, top right)** — set up, change, or remove a 4-digit passcode, switch on Dark Mode, and export your data.
- Everything is only ever your own outgoing (blue) messages — there are no simulated replies.

## Passcode lock

- Turning on "Require Passcode" in Settings walks you through setting a 4-digit code (enter it twice to confirm).
- Once it's on, you'll be asked for it every time you open the app, and again any time you switch away and come back.
- **Change Passcode** and **Remove Passcode** both require entering your current code first.
- **Forgot Passcode?** on the lock screen is a last resort: since there's no server or recovery email involved, the only way to regain access without the code is to erase the passcode *and* all saved conversations on that device. It will warn you and ask for confirmation before doing that.
- Important: this passcode locks the app's screens. It does **not** encrypt the conversation data sitting in local storage — someone with direct access to your device's browser storage/dev tools could still read it. Treat it as a privacy screen, not a vault.

## Dark Mode

Settings → **Dark Mode** switches the whole app to a black, iOS-style dark theme (translucent blurred bars, dimmed dividers, adjusted system blue, matching iOS 26's Liquid Glass conventions). The first time you open the app it follows your iPhone's own Light/Dark appearance setting automatically; once you flip the switch yourself, that choice is remembered and stops following the system setting.

## Export your data

Settings → **Export Conversations (.txt)** downloads a `.zip` containing one plain-text file per conversation, named after the contact, with every message and its timestamp in order. On iPhone Safari this opens the share sheet so you can save it to Files, AirDrop it, or send it to yourself — unzip it (the Files app can do this by tapping the .zip) to get the individual `.txt` files. The whole thing is built on-device with no external library or network call, in keeping with nothing ever leaving your phone.

## A note on your data

Because storage is tied to Safari on this one device, **clearing Safari's website data, or reinstalling/switching phones, will erase everything** (including your passcode). Export regularly if that history matters to you.
