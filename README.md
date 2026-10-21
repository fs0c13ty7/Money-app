# Money Tracker

A private, offline money tracker for Android. Everything you log is stored **only on your phone**. Nothing is sent anywhere, and there is no account or server.

## What's in this folder

| File | What it is |
|---|---|
| `index.html` | The app page |
| `css/app.css` | All styling, including the light and dark themes |
| `js/` | The app itself: storage, screens, charts and smart features |
| `sw.js` | Lets the app open instantly and work with no signal |
| `manifest.webmanifest`, `icons/` | Makes it installable with its own home-screen icon |

There is no build step. The files run exactly as they are.

## Put it online with GitHub Pages (about 10 minutes, free)

1. Create a free account at github.com if you don't have one.
2. Tap **New repository**. Give it any name (for example `money`). Leave it **Public**, because free GitHub Pages needs that. See "Privacy" below for why that's fine.
3. On the new repository page, tap **uploading an existing file**. Drag in **everything inside this folder**, keeping the `css`, `js` and `icons` folders. Then tap **Commit changes**.
4. Go to **Settings → Pages**. Under "Branch" choose `main` and `/ (root)`, then **Save**.
5. After a minute or two your app is live at `https://YOUR-USERNAME.github.io/REPO-NAME/`.

## Install it on your Android phone

1. Open that address in **Chrome** on your phone.
2. Tap the **⋮** menu, then **Add to Home screen** (it may say **Install app**).
3. Open it from the new icon. It runs full screen like a normal app and works offline.
4. Long-press the icon for shortcuts: **Add expense**, **Add income** and **Search**.

## Privacy

- **Your money data never leaves your phone.** It's stored in the phone's browser storage for this app. GitHub only hosts the app's code, which contains no personal information.
- Anyone who visits the address sees an empty app with *their own* empty storage. They can't see yours.
- The page tells search engines not to list it.

## Keeping your data safe

- Each entry is saved to the phone before the app says "Saved".
- Once installed, the app asks Chrome to protect its storage so it isn't cleared automatically. The bottom of the **More** tab shows whether this is on.
- A snapshot is taken inside the app every day you use it, and the last 30 are kept (**More → Backup & restore**).
- **Save a backup file regularly.** The app reminds you after 3 days. The file goes to your Downloads folder. Copying it somewhere else, such as Google Drive or email, protects you if the phone is lost.
- **Don't clear Chrome's site data for the app's address.** That deletes the app's storage. Restore from a backup file if it ever happens.

## Updating the app later

Upload the changed files to the same repository, replacing the old ones. The app picks up the new version the next time it's opened twice. Your data isn't affected by updates.
