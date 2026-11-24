# UnStevened Social on GitHub + Cloudflare (free)

1. **GitHub:** make a new repo named `calculatorfunforkids` (private is fine). Upload everything in this folder **except** `.preview`.
2. **Cloudflare dashboard → Storage & Databases → D1 → Create** a database named `unstevened-social`. Copy its **Database ID**.
3. On GitHub, edit `wrangler.toml` and paste that ID where it says `PASTE-YOUR-D1-DATABASE-ID-HERE`.
4. **Cloudflare → R2:** make sure the bucket `unstevened-clips` exists (create it if it doesn't).
5. **Cloudflare → Workers & Pages → Create → Pages → Connect to Git.** Pick `calculatorfunforkids` (the project name becomes your link: calculatorfunforkids.pages.dev).
   - Build command: *(leave empty)*
   - Build output directory: `public`
6. Run **Set Owner Password.bat** on your PC and type your owner password. It copies a hash to your clipboard.
   In the Pages project: **Settings → Variables and Secrets → Add → Secret**, name `OWNER_HASH`, paste the value.
7. **Deployments → Retry deployment** (or push any change to GitHub). Every push to GitHub publishes automatically.

## Turn on Sign in with Google (free)

1. Go to https://console.cloud.google.com, sign in, and make a new project (any name).
2. **APIs & Services → OAuth consent screen**: pick **External**, fill in the app name (UnStevened Social) and your email, then save. Under **Audience**, click **Publish app** so anyone can sign in (no Google review is needed for name + email).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → type **Web application**.
   Under **Authorized JavaScript origins** add your site address, e.g. `https://calculatorfunforkids.pages.dev` (and `http://localhost:8888` if you want it in the preview).
4. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`). It is not a secret.
5. In Cloudflare: Pages project → **Settings → Variables and Secrets → Add**, name `GOOGLE_CLIENT_ID`, paste it, then redeploy.

Now new accounts must connect a Google account. Old accounts are asked to connect one the next time they log in.
In the Owner panel → **People**, you'll see each person's Google name and email (and you can search by them).
Optional: Owner panel → Overview → **Google sign-in** lets you allow only emails from your school's domain (e.g. `myschool.org`).

The site opens as a calculator. Type **67670** and press **=** to open UnStevened Social.
The **Math Games** button opens the learning games.

Test on your own PC first with **Preview UnStevened Social.bat** (http://localhost:8888).
