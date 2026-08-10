# Attendance Kiosk API — spec for the face-recognition device

The Python app recognises a face locally and tells Tusker "employee X arrived / left".
**No biometric data is sent to or stored by Tusker** — embeddings stay on the device. The
only thing crossing the wire is an employee ID.

## What you need from us (out of band)

| | Example | Notes |
|---|---|---|
| `BASE_URL` | `https://tusker.example.com` | HTTPS only in production |
| `WORKSPACE_ID` | `a1b2c3d4-...` | one per office/organisation |
| `ATTENDANCE_DEVICE_SECRET` | 64 hex chars | **send via password manager, never email/chat/git** |
| Employee ID list | `EMP-042 → Priya S.` | the enrolment roster; must match Tusker exactly |
| Kiosk GPS coords | `17.4401, 78.3489` | fixed lat/lng of where the device is bolted |
| `DEVICE_ID` | `gate-1` | any short label, shows in the audit trail |

## Endpoints

```
POST {BASE_URL}/api/v1/kiosk/check-in
POST {BASE_URL}/api/v1/kiosk/check-out

Headers
  Authorization: Bearer {ATTENDANCE_DEVICE_SECRET}
  x-workspace-id: {WORKSPACE_ID}
  Content-Type: application/json

Body
  {
    "employeeId": "EMP-042",     // required — the recognised person
    "latitude": 17.4401,         // optional, the kiosk's fixed coords
    "longitude": 78.3489,
    "deviceId": "gate-1"         // optional, free text for the audit log
  }
```

Check-in and check-out are **separate calls** — the device decides which one to send
(e.g. an on-screen IN / OUT toggle, or shift time).

### Roster

```
GET {BASE_URL}/api/v1/kiosk/members     # same two headers

→ {"success":true,"data":[{"employeeId":"EMP-042","name":"Priya S"}, ...]}
```

Everyone in the workspace who has an `employeeId` set. Use it to check enrolment folders
against Tusker and to show a name on the screen. `employeeId` is `null` for members HR
hasn't assigned one to — they're omitted, and they cannot punch until that's fixed.
Names only: no email, phone, role or leave data is exposed to the device.

### Responses

| Code | Meaning | What the kiosk should do |
|---|---|---|
| `200` | `{"success":true,"data":{...}}` — recorded | Green screen, show the name |
| `400` | missing `x-workspace-id` or `employeeId` | Config bug — surface loudly at startup, not to the employee |
| `401` | bad or missing device secret | Config bug — same |
| `404` | `employeeId` not found in this workspace | "Not enrolled — see HR". Person exists on the device but not in Tusker |
| `409` | "You have already checked in today." | **Not an error.** Friendly "already marked ✅" |
| `5xx` | server/database problem | Treat as *possibly recorded*. Show "try again shortly". **Do not auto-retry** — a retry can land as a 409 or a double entry |

## Reference client

```python
import os, requests

BASE   = os.environ["TUSKER_BASE_URL"]
SECRET = os.environ["ATTENDANCE_DEVICE_SECRET"]
WS     = os.environ["TUSKER_WORKSPACE_ID"]
LAT, LNG, DEVICE = 17.4401, 78.3489, "gate-1"

def punch(employee_id: str, mode: str = "check-in"):
    """mode is 'check-in' or 'check-out'. Returns (status_code, body)."""
    r = requests.post(
        f"{BASE}/api/v1/kiosk/{mode}",
        headers={"Authorization": f"Bearer {SECRET}", "x-workspace-id": WS},
        json={"employeeId": employee_id, "latitude": LAT,
              "longitude": LNG, "deviceId": DEVICE},
        timeout=10,
    )
    return r.status_code, r.json()
```

## Device-side requirements

- **Enrolment key is the Tusker `employeeId`.** Name each face folder/label with it
  (`faces/EMP-042/*.jpg`). A typo here silently becomes a 404 at the door.
- **Debounce ~30 s per face.** Someone lingering in frame must not fire 40 requests.
- **Confidence threshold.** Only call the API on a confident match; a wrong match marks
  the wrong person present. Prefer "not recognised, try again" over a guess.
- **Secret handling.** Read from an env var or a root-only config file, never hard-code
  it. Anyone holding it can mark anyone present, so treat the device as a physical
  security boundary.
- **Clock.** The attendance time is stamped **server-side at the moment the request
  arrives**, so the device clock doesn't matter — but network delay does. Send
  immediately on recognition; don't batch.
- **Offline behaviour is out of scope for v1.** If the network is down the scan is lost.
  Show it clearly on screen so the employee can mark attendance in the web app instead.
  (Queuing needs a server-side `capturedAt` field we haven't built.)

## Smoke test before writing any face code

```bash
curl -i -X POST "$BASE_URL/api/v1/kiosk/check-in" \
  -H "Authorization: Bearer $ATTENDANCE_DEVICE_SECRET" \
  -H "x-workspace-id: $WORKSPACE_ID" \
  -H "Content-Type: application/json" \
  -d '{"employeeId":"EMP-042","latitude":17.4401,"longitude":78.3489,"deviceId":"gate-1"}'
```

Expect `200` the first time, `409` the second. Then check the row appears in Tusker under
**Team → Attendance** (it shows up live) with a note reading `Face ID kiosk (gate-1)`.
Once that round-trips, the rest is purely the device's recognition loop.
