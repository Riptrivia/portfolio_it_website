# Live portal deployment on Windows

The customer and administrator interfaces require the updated static site and updated ticket Worker. The Gmail bridge and D1 schema already in use do not need to be recreated.

## Update the existing Worker folder

Copy the updated `ticket-worker/worker.js` from the website repository into:

```text
C:\Users\Marcy\Downloads\ticketworker\worker.js
```

In PowerShell:

```powershell
Set-Location "C:\Users\Marcy\Downloads\ticketworker"

(Get-Content .\wrangler.toml -Raw).Replace(
  'REPLACE_WITH_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com',
  '582527406778-cfbma4qultuhglgsbkie2eh19ebu1q7a.apps.googleusercontent.com'
) | Set-Content .\wrangler.toml

npx.cmd wrangler@latest deploy
```

Do not replace the existing D1 database ID and do not recreate any Worker secret.

## Publish the static site

Copy these updated files into the root of the local `portfolio_it_website` repository while preserving paths:

- `ticket-portal.html`
- `ticket-portal.css`
- `ticket-portal.js`
- `ticket-config.js`
- `request-support.html`
- `request-support.css`
- `index.html`
- `build.js`
- `README.md`
- `ticket-worker/worker.js`
- `ticket-worker/schema.sql`
- `ticket-worker/wrangler.toml.example`
- `ticket-worker/google-apps-script/Code.gs`

Validate and publish:

```powershell
npm run build
git add .
git commit -m "Add live customer and admin support portal"
git push origin main
```

GitHub Pages deploys on pushes to `main`. The Google OAuth client is authorized for the `https://riptrivia.github.io` origin.

## First administrator enrollment

1. Open the live `ticket-portal.html#admin` page.
2. Sign in as `pestcoe.zfix@gmail.com`.
3. Add the displayed manual key to Google Authenticator as a time-based key.
4. Enter the current six-digit code.
5. Clear the clipboard if the setup key was copied.

The Worker returns the enrollment key only until the first TOTP verification succeeds.
