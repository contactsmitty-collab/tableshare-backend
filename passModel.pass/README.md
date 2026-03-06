# Apple Wallet pass model for TableShare reservations

This folder is the **pass model** used to generate `.pkpass` files for reservations. The backend overrides `eventTicket` fields, `barcode`, and `relevantDate` at runtime.

## Scripted setup (recommended)

If you prefer not to work with cert files by hand:

1. **One-time in Apple Developer:** Create the Pass Type ID `pass.com.tableshare.app.reservation` and a signing certificate for it; download the `.cer` and install it in Keychain (double‑click the .cer).
2. **One-time in Keychain Access:** Find the certificate “Pass Type ID: TableShare Reservation Pass”, right‑click → **Export** → save as a `.p12` file (e.g. `TableShareWallet.p12`). You can set a password or leave it blank.
3. **In the backend repo:**  
   `./scripts/setup-wallet-certs.sh ~/path/to/TableShareWallet.p12`  
   This downloads Apple WWDR G4 and creates `certs/AppleWWDRCA.pem`, and from your `.p12` creates `certs/signerCert.pem` and `certs/signerKey.pem`. If you run it without arguments, it only downloads the WWDR and prints instructions for the `.p12` step.

Then set the `WALLET_PASS_*` env vars (below) and restart the API.

---

## Required before "Add to Wallet" works

1. **Apple Developer setup**
   - Create a **Pass Type ID** `pass.com.tableshare.app.reservation` (matches bundle ID `com.tableshare.app`) in [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list/passTypeId).
   - Create a **Signing certificate** for that Pass Type ID and download the `.cer`.
   - Export the certificate and private key as `.pem` (see [passkit-generator: Generating Certificates](https://github.com/alexandercerutti/passkit-generator/wiki/Generating-Certificates)).
   - Download the **Apple WWDR G4** certificate (required for passes; older G1/G2/G3 cause "the pass is invalid"). From [Apple PKI](https://www.apple.com/certificateauthority/) get **AppleWWDRCAG4.cer**, then convert to PEM:  
     `openssl x509 -inform DER -in AppleWWDRCAG4.cer -out AppleWWDRCA.pem`

2. **Edit `pass.json`**
   - `passTypeIdentifier` is set to `pass.com.tableshare.app.reservation` (must match the Pass Type ID you create in the portal).
   - Set `teamIdentifier` to your Apple Team ID (10 characters).

3. **Add icons** (required by Apple)
   - Add `icon.png` (29×29) and `icon@2x.png` (58×58) to this folder.
   - You can use [Apple’s pass template](https://developer.apple.com/documentation/walletpasses/creating_the_source_for_a_pass) or [Passkit Visual Designer](https://pkvd.app) to get valid assets.

4. **Copy certs into the backend**
   - From the backend repo root: `cp ~/Desktop/signerCert.pem ~/Desktop/signerKey.pem ~/Desktop/AppleWWDRCA.pem certs/`
   - Or copy the three `.pem` files into `tableshare-backend/certs/`.

5. **Backend environment variables**
   - Set these (in `.env` or your host’s config). Paths can be absolute or relative to the process working directory (e.g. when you run `npm start` from the backend root, `./certs/signerCert.pem` works).

   **Local (backend at `/Users/christophersmith/Desktop/TableShare/tableshare-backend`):**
   ```
   WALLET_PASS_MODEL_DIR=./passModel.pass
   WALLET_PASS_CERT_PATH=./certs/signerCert.pem
   WALLET_PASS_KEY_PATH=./certs/signerKey.pem
   WALLET_PASS_WWDR_PATH=./certs/AppleWWDRCA.pem
   ```

   **Production (e.g. server at `/opt/tableshare-backend`):** use the same variable names and paths where you put the files, e.g. `/opt/tableshare-backend/passModel.pass` and `/opt/tableshare-backend/certs/signerCert.pem`, etc.
   - `WALLET_PASS_KEY_PASSPHRASE` – (optional) only if you set a passphrase on the key.

If any of these are missing, the backend returns `503` for `GET /api/v1/restaurants/reservations/:id/wallet-pass` and the app can hide or disable "Add to Wallet".

## Troubleshooting: "The pass is invalid"

1. **Use WWDR G4** – Apple only accepts the G4 WWDR for signing. If you used an older WWDR (e.g. from an old tutorial), download [Apple WWDR G4](https://www.apple.com/certificateauthority/) (AppleWWDRCAG4.cer), convert to PEM as above, and replace `certs/AppleWWDRCA.pem` on the server. Restart the API.
2. **Match Pass Type ID** – In [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list/passTypeId), the Pass Type ID must be exactly `pass.com.tableshare.app.reservation` and the signing certificate must be created for that ID.
3. **Match Team ID** – `pass.json` has `teamIdentifier`: use your 10-character Apple Team ID (same as in the signing certificate).
4. **Validate a pass** – From the backend root run: `node scripts/export-sample-wallet-pass.js` to create `sample.pkpass`. Upload that file to [PKPass Validator](https://pkpassvalidator.azurewebsites.net/) – it will report the exact error (e.g. wrong WWDR, Team ID, or Pass Type ID).
5. **Team ID** – In [Apple Developer → Membership](https://developer.apple.com/account#MembershipDetailsCard), confirm your **Team ID** (10 characters). It must exactly match `teamIdentifier` in `pass.json`. If it doesn’t, edit `pass.json` and update `teamIdentifier`.
