# Meal & banquet check-in — setting up the Google Sheet

Twenty minutes, once. After this, volunteers only open a web page and scan.

## 1. The sheet

1. Create a Google Sheet, e.g. **MAMM 2026 — delegates**. Keep it private to the organising team.
2. **Extensions → Apps Script**. Delete the sample code, paste all of `Code.gs`, and save.
3. Reload the Sheet. A **MAMM 2026** menu appears → **Set up sheets**.
   Approve the permissions Google asks for (it wants to edit *this* spreadsheet).
   Four tabs are created — `Delegates`, `Status`, `Log`, `Config` — and a random staff PIN is shown.

## 2. The delegate list

Paste your Excel data into the **Delegates** tab, matching the columns:

| id | name | affiliation | email | lunch_d1 | lunch_d2 | banquet | diet | note | token |
|---|---|---|---|---|---|---|---|---|---|
| D001 | Zhetenbayev Nursultan | Satbayev University | … | Y | Y | Y | | | *(leave empty)* |

- The three meal columns accept `Y / N`, `1 / 0`, `TRUE / FALSE`, `x` — anything sensible.
- `diet` is shown to the volunteer at the counter, so put *Vegetarian*, *Halal*, *No pork*, allergies there.
- Leave `token` empty, then run **MAMM 2026 → Generate missing badge tokens**. Each delegate gets a
  short code such as `M26-7F3K` (no O/0 or I/1, so nobody misreads it).

Adding people later: paste the rows, run *Generate missing badge tokens* again. Existing tokens are
never changed.

## 3. Publish the web app

**Deploy → New deployment → Web app**

| Field | Value |
|---|---|
| Execute as | **Me** |
| Who has access | **Anyone** |

Copy the `…/exec` URL. **Anyone** here means "no Google sign-in", which is what lets a volunteer's
phone talk to the sheet — the staff PIN in the `Config` tab is what actually guards it. Anyone
holding both the URL and the PIN can mark meals as collected, so treat them like a key: give them
only to the volunteers on duty.

Every time you edit `Code.gs` you must **Deploy → Manage deployments → edit → New version**,
otherwise the old code keeps running.

## 4. Point the app at it

Open `checkin.html` on the phone or tablet (`https://<your-account>.github.io/<repo>/checkin.html`),
go to **Setup**, and fill in:

- the `…/exec` URL
- the PIN from the `Config` tab
- a **station name** — *Door A*, *Room 1*, *Banquet desk*. It is written next to every check-in, so
  when someone turns up twice you can see which door served them.

Press **Test connection**, then **Save & connect**. The settings stay on that device.

## 5. Badges

Open `badges.html`, paste the same URL and PIN, **Load from the sheet** → **Print / Save as PDF**.
Eight badges per A4 page, each with its QR code, the delegate's entitlements and the code in text
as a fallback. Print one page and check it before running the whole batch.

No badges? Skip this — volunteers can find people by name in the **Search** tab instead.

## What the organisers see

Open the Sheet during the event:

- **Status** — one row per delegate, showing `12:07 · Door A` in the column of each meal collected.
- **Log** — every event in order, including refusals, overrides and undos. Never edited, only appended.

The **Board** tab in the app gives the number the kitchen asks for: served / entitled per meal.

## Things worth knowing before the day

- **Offline.** If the Wi-Fi drops, the app keeps working from the list it cached and queues the
  check-ins; the badge in the header shows how many are waiting. They are sent as soon as the
  connection is back. A duplicate is still caught on that same device, but two *different* devices
  that are both offline cannot see each other — the second one is flagged in the `Log` when it syncs.
- **Camera.** It needs HTTPS (GitHub Pages is fine) and the volunteer must tap **Start camera** once.
  On iPhone use Safari; some in-app browsers block the camera.
- **Undo** is on the green screen for a few seconds after every check-in — use it for a mis-scan.
- **Overrides** are never silent: the reason is written into the `Log`.
- Give each station a **different station name** so the report tells you where the queue was.
- Print paper coupons as a fallback. If a tablet dies mid-service you want a way to keep going.

## If something goes wrong

| Symptom | Cause |
|---|---|
| *Could not reach the web app* | deployment not set to **Anyone**, or the URL is the `/dev` one instead of `/exec` |
| *Wrong PIN* | the `Config` tab value and the Setup screen differ |
| Changes to `Code.gs` have no effect | you did not deploy a **new version** |
| Status tab looks wrong after hand-editing | **MAMM 2026 → Rebuild Status sheet from Log** |
