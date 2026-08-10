# Migrate Grafana Cloud → self-hosted on UGREEN DXP2800

Plan for moving vctennis observability (Loki + Prometheus remote write + Grafana dashboards + email alerts) onto a home **UGREEN DXP2800** (UGOS Pro, Docker) with minimal functional loss.

**Cloud stack today:** [niftyamaranth452.grafana.net](https://niftyamaranth452.grafana.net)  
**App ship:** [`src/lib/observability.ts`](../../src/lib/observability.ts), Netlify [`health-probe`](../../netlify/functions/health-probe.mts)  
**Source of truth for domain events:** Turso `Events` (always written; Grafana is optional dual-write)

---

## 1. Goals and non-goals

### Keep (do not lose)

| Asset | Where it lives today | How we keep it |
|---|---|---|
| Domain event history | Turso `Events` | Unchanged — never depended on Cloud storage |
| Dashboards | [`dashboards/*.json`](dashboards/) | Import as-is by **reusing Cloud datasource UIDs** |
| Alert rules | [`alerting/rules.json`](alerting/rules.json) | Re-provision against local Grafana |
| Email alerts | Cloud contact point → Proton | Recreate with Grafana SMTP (see §7) |
| Probe + event shipping | Netlify → Cloud push APIs | Retarget env URLs to NAS endpoints |
| PII rules / label shapes | docs + code | Same Loki labels / Prom metric names |

### Accept losing (or replacing)

| Item | Why |
|---|---|
| Historical Cloud metrics/logs | No supported one-click export into self-hosted Loki/Mimir; volume is small — **accept a cutover gap** (Turso still has events) |
| Grafana Cloud Assistant / hosted MCP | Cloud product; Cursor `grafana-assistant` plugin won’t talk to OSS Grafana the same way |
| Cloud-managed uptime | Home ISP / NAS power = possible blind window for *shipping* (Turso still records mutations) |
| Cloud built-in alert mailer | Must configure SMTP on self-hosted Grafana |

### Non-goals

- Backfilling Turso rows into Loki/Prometheus (already out of scope in Event-logging.md)
- Replacing Turso with NAS DB
- Running the Astro app on the NAS

---

## 2. Why this is feasible on a DXP2800

| Fact | Implication |
|---|---|
| Intel N100 + UGOS Pro Docker | Official container support (App Centre / Docker Compose projects) |
| 8 GB DDR5 (expandable to 16 GB) | Light stack fits; avoid stuffing media + LLM + this stack on same box without RAM headroom |
| App already uses **standard push APIs** | Loki `/loki/api/v1/push` + Prometheus remote write — no Cloud SDK |
| Dashboards/alerts pinned to UIDs `grafanacloud-prom` / `grafanacloud-logs` | Provision local datasources with **those same UIDs** → zero panel/rule rewrite |

**Hard constraint:** Netlify Functions run on the public internet. The NAS write endpoints must be reachable over **HTTPS from outside your LAN** (tunnel preferred — do not raw-expose Loki/VM ports).

---

## 3. Target architecture

```text
                    Netlify (SSR + health-probe cron)
                              |
              HTTPS write (Basic auth)
                    /                   \
           Loki push                 remote_write
     /loki/api/v1/push            /api/v1/write
                    \                   /
                     Cloudflare Tunnel (or Tailscale Funnel)
                              |
                     UGREEN DXP2800 (LAN)
                              |
         ┌────────────────────┼────────────────────┐
         │                    │                    │
    grafana (UI+alerts)   loki (logs)     victoria-metrics
         │                    │              (PromQL + RW)
         └──────── datasources UIDs ───────────────┘
              grafanacloud-logs / grafanacloud-prom
```

### Recommended containers (Compose one project)

| Service | Image (pin versions in practice) | Role | Approx RAM |
|---|---|---|---|
| `grafana` | `grafana/grafana-oss` | UI, alerting, SMTP | 256–512 MiB |
| `loki` | `grafana/loki` (single-binary / filesystem) | Log store + push API | 256–512 MiB |
| `victoriametrics` | `victoriametrics/victoria-metrics` | Metrics store + remote write + PromQL | 256–512 MiB |
| `cloudflared` | `cloudflare/cloudflared` | Public HTTPS without port-forward | ~50 MiB |
| Optional `npm` | Nginx Proxy Manager | Only if you prefer NPM + port 443 over Cloudflare | ~100 MiB |

**Why VictoriaMetrics instead of Prometheus?** Smaller footprint, native remote-write receiver at `/api/v1/write`, PromQL compatible enough for these dashboards (`count_over_time`, `last_over_time`, gauges).

**Do not run:** Alloy/Promtail (app already pushes), Tempo, Mimir HA, full Loki microservices — overkill for this traffic.

### Storage layout on NAS

Create under shared Docker folder (UGREEN guidance: `/Shared Folders/docker/...`):

```text
docker/vctennis-obs/
  compose.yml
  .env                 # GF_SECURITY_ADMIN_PASSWORD, WRITE_USER, WRITE_PASSWORD, …
  grafana/data/
  loki/data/
  loki/config.yml
  victoriametrics/data/
  provisioning/
    datasources/datasources.yml
    dashboards/dashboards.yml
    alerting/          # optional file provisioning later
  dashboards/          # copies of repo JSON (or bind-mount from a git sync)
```

Use a **dedicated data volume on HDD/SSD**, not the eMMC system partition. Prefer NVMe for VM/Loki hot data if you have a free M.2 slot.

### Retention (start here, tune later)

| Store | Suggested retention | Rationale |
|---|---|---|
| VictoriaMetrics | 180–365 days | Probe samples every 5m + sparse event samples; tiny series count |
| Loki | 90–180 days | Structured event lines only; low volume |
| Grafana | DB on disk | SQLite default is fine at this scale |

---

## 4. Critical trick: keep Cloud datasource UIDs

Provision Grafana datasources exactly as:

```yaml
# provisioning/datasources/datasources.yml
apiVersion: 1
datasources:
  - name: VictoriaMetrics
    uid: grafanacloud-prom
    type: prometheus
    access: proxy
    url: http://victoriametrics:8428
    isDefault: true
    editable: false

  - name: Loki
    uid: grafanacloud-logs
    type: loki
    access: proxy
    url: http://loki:3100
    editable: false
```

Then:

- Import [`domain-events.json`](dashboards/domain-events.json) and [`prod-health.json`](dashboards/prod-health.json) unchanged.
- Re-apply [`alerting/rules.json`](alerting/rules.json) with only `folderUid` / contact-point wiring adjusted if needed — Prom datasource UID stays valid.

If you rename UIDs, you must edit every panel and alert rule — avoid that.

---

## 5. Public write path (security)

Netlify must POST to Loki and VictoriaMetrics. Prefer **Cloudflare Tunnel** over opening router ports.

### Option A — Cloudflare Tunnel (recommended)

1. Create a Cloudflare account zone (or use an existing domain you control), e.g. `obs.example.com`.
2. Run `cloudflared` on the NAS; map hostnames:
   - `loki-write.obs.example.com` → `http://loki:3100`
   - `metrics-write.obs.example.com` → `http://victoriametrics:8428`
   - `grafana.obs.example.com` → `http://grafana:3000` (UI; restrict separately)
3. Put **HTTP Basic auth** (or Cloudflare Access) in front of write hostnames only.
4. Do **not** expose Grafana UI to the world without Access / VPN / strong auth.

### Option B — Tailscale

- NAS + laptop on Tailscale; use **Funnel** only for write endpoints, or run a small public relay.
- Simpler if you already live in Tailscale; Funnel quotas/docs change — verify current limits.

### Option C — Port forward + Let's Encrypt

- Works, worse threat model (home IP exposed, CGNAT may block). Avoid unless tunnel isn’t possible.

### Auth mapping for existing env vars

App expects Basic auth:

| Env | Cloud meaning | NAS meaning |
|---|---|---|
| `GRAFANA_LOKI_URL` | `https://logs-prod-….grafana.net` | `https://loki-write.obs.example.com` |
| `GRAFANA_LOKI_USER` | numeric instance id | shared write username |
| `GRAFANA_PROM_REMOTE_WRITE_URL` | `…/api/prom/push` | `https://metrics-write.obs.example.com/api/v1/write` |
| `GRAFANA_PROM_USER` | numeric instance id | same write username |
| `GRAFANA_CLOUD_TOKEN` | access policy token | shared write password |

**No app code change required** if the reverse proxy / tunnel auth accepts the same Basic scheme. Optional later cleanup: rename `GRAFANA_CLOUD_TOKEN` → `GRAFANA_WRITE_TOKEN` in code + Netlify + docs.

**VictoriaMetrics note:** remote-write path is `/api/v1/write` (not Grafana Cloud’s `/api/prom/push`). Only the URL env changes.

---

## 6. Compose sketch (reference — pin digests before prod)

Illustrative only; adjust paths/PUID to UGOS norms.

```yaml
services:
  victoriametrics:
    image: victoriametrics/victoria-metrics:v1.110.0
    command:
      - "-storageDataPath=/data"
      - "-retentionPeriod=12"
      - "-httpListenAddr=:8428"
    volumes:
      - ./victoriametrics/data:/data
    restart: unless-stopped

  loki:
    image: grafana/loki:3.4.2
    command: ["-config.file=/etc/loki/config.yml"]
    volumes:
      - ./loki/config.yml:/etc/loki/config.yml:ro
      - ./loki/data:/loki
    restart: unless-stopped

  grafana:
    image: grafana/grafana-oss:11.5.2
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: ${GF_ADMIN_PASSWORD}
      GF_SERVER_ROOT_URL: https://grafana.obs.example.com
      GF_USERS_ALLOW_SIGN_UP: "false"
      # SMTP — see §7
      GF_SMTP_ENABLED: "true"
      GF_SMTP_HOST: ${SMTP_HOST}
      GF_SMTP_USER: ${SMTP_USER}
      GF_SMTP_PASSWORD: ${SMTP_PASSWORD}
      GF_SMTP_FROM_ADDRESS: ${SMTP_FROM}
      GF_SMTP_FROM_NAME: vctennis-grafana
    volumes:
      - ./grafana/data:/var/lib/grafana
      - ./provisioning:/etc/grafana/provisioning:ro
      - ./dashboards:/var/lib/grafana/dashboards:ro
    restart: unless-stopped

  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    restart: unless-stopped
```

Loki single-node filesystem config should enable the push API and set `retention_period` / compactor delete — follow current Loki “monolithic” docs; store under `./loki/data`.

---

## 7. Alerting parity (email without Cloud mailer)

Today ([`alerting/README.md`](alerting/README.md)):

- Contact point `vctennis-ops-email` → `etor.diaz@proton.me`
- Rules: `vctennis-app-down`, `vctennis-errors-high`
- Cloud sent mail via Grafana Cloud’s mailer (**not** Resend)

On NAS Grafana:

1. Configure SMTP (`GF_SMTP_*`). Practical options:
   - **Resend SMTP** (if you already use Resend for the app) — same provider, separate from `EMAILS_ENABLED` app flag
   - Other transactional SMTP that allows Proton as recipient
2. Recreate contact point from [`contact-point-email.json`](alerting/contact-point-email.json) (API or UI).
3. Import rule group from [`rules.json`](alerting/rules.json).
4. **Test** contact point before cutover.
5. Update runbook links in annotations if needed.

**Caveat:** If the NAS or tunnel is down, `vctennis-app-down` may fire on **no data** (rule uses `noDataState: Alerting`). That is correct for “we’re blind,” but you will also get false positives during NAS maintenance — use silences.

**Optional improvement (post-cutover):** add a second heartbeat or mute windows; not required for day-one parity.

---

## 8. Phased cutover (minimize loss)

### Phase 0 — Inventory (30–60 min)

- [ ] Confirm DXP2800 Docker works; free ~2 GB RAM for this stack
- [ ] Domain + Cloudflare (or Tailscale) ready
- [ ] Export any Cloud-only dashboards not in git (should be none)
- [ ] Screenshot Cloud alert state / notification policy
- [ ] Note current Netlify `GRAFANA_*` values (backup)

### Phase 1 — Bring up stack offline (LAN only)

- [ ] Deploy Compose; Grafana login works on LAN IP
- [ ] Provision datasources with UIDs above
- [ ] Import both dashboard JSONs; panels load (empty is OK)
- [ ] Recreate folder `vctennis`, contact point, alert rules
- [ ] From a laptop on LAN, `curl` Loki push + VM remote write with Basic auth

### Phase 2 — Expose write endpoints

- [ ] Cloudflare Tunnel hostnames live with TLS
- [ ] Basic auth (or Access) on write hosts only
- [ ] From a **non-home** network (phone LTE), push a test series/log line
- [ ] Confirm series appear in Grafana Explore

### Phase 3 — Parallel validation (optional dual ship)

App supports **one** destination today. Options:

| Approach | Pros | Cons |
|---|---|---|
| **A. Short cutover** (recommended for this project) | Simple | Brief gap in Cloud; NAS becomes sole ship target |
| **B. Temporary dual-write code** | Cloud safety net for days | Small code change + two env sets; remove after |

Recommendation: **A** plus keep Cloud stack idle 7–14 days (don’t delete) so you can flip Netlify env back if NAS misbehaves. Turso events continue either way.

### Phase 4 — Netlify cutover

1. Set Netlify env:

```bash
GRAFANA_LOKI_URL=https://loki-write.obs.example.com
GRAFANA_LOKI_USER=<write-user>
GRAFANA_CLOUD_TOKEN=<write-password>
GRAFANA_PROM_REMOTE_WRITE_URL=https://metrics-write.obs.example.com/api/v1/write
GRAFANA_PROM_USER=<write-user>
```

2. Redeploy or trigger env refresh so Functions pick up vars.
3. Wait for next `health-probe` (~5 min); check Explore for `vctennis_probe_success`.
4. Create a test booking (or use staging) and confirm `vctennis_events` + Loki `{service_name="vctennis"}`.
5. Force a probe failure in a controlled way only if you can silence alerts first — or wait for natural traffic.

### Phase 5 — Alert soak + Cloud teardown

- [ ] 7 days: alerts quiet except real issues; SMTP delivery OK
- [ ] Update [`README.md`](../../README.md), [`docs/Event-logging.md`](../../docs/Event-logging.md), [`alerting/README.md`](alerting/README.md) instance URL
- [ ] Point Cursor Grafana MCP / bookmarks at local Grafana (or accept Assistant loss)
- [ ] Cancel / shrink Grafana Cloud subscription when confident
- [ ] Optional: delete Cloud stack data after backup of any annotations you care about

---

## 9. App / repo changes (small, optional)

Day-one cutover needs **env + docs only**. Nice follow-ups:

1. Rename `GRAFANA_CLOUD_TOKEN` → `GRAFANA_WRITE_TOKEN` (code, `env.d.ts`, `.env.example`, Netlify, `scripts/check-env.js`).
2. Make Basic auth optional when user/token unset but URL set (LAN-only testing).
3. Commit a `ops/grafana/docker/` Compose + Loki config as the runnable companion to this plan.
4. File-provision alert rules so recreate is `docker compose up` instead of curl/UI.
5. Dual-write toggle only if you want a long overlap with Cloud.

---

## 10. What “without losing much” means in practice

| Concern | Outcome |
|---|---|
| Bookings / users / Turso events | **No loss** |
| Dashboard definitions | **No loss** (git + same UIDs) |
| Alert logic | **No loss** if SMTP + rules re-provisioned |
| Last N weeks of Cloud graphs | **Likely lost** as continuous series (acceptable; Turso holds event facts) |
| Probe history across cutover | **Gap** at flip time |
| Grafana Assistant in Cursor | **Lost** unless you keep a Cloud stub |
| Reliability vs Cloud | **Slightly worse** (home power/ISP); mitigate with UPS + tunnel health monitoring |

---

## 11. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| NAS offline | No new metrics/logs; `app-down` may alert | UPS; silence during maintenance; Turso still has events |
| Tunnel misconfig | Silent ship failures (app already swallows errors) | LTE test before cutover; watch Netlify function logs |
| Wrong remote-write path | Metrics empty | Use `/api/v1/write` for VictoriaMetrics |
| SMTP blocked to Proton | Alerts don’t email | Test contact point; allowlist Grafana sender |
| 8 GB RAM pressure | OOM / NAS sluggish | Cap container memory; upgrade to 16 GB if stacking media apps |
| Exposing Grafana UI | Credential stuffing | Cloudflare Access or VPN-only; strong admin password |
| UID mismatch | Empty dashboards | Force `grafanacloud-prom` / `grafanacloud-logs` |

---

## 12. Success criteria

- [ ] Explore shows `vctennis_probe_*` updating every ~5 minutes
- [ ] Domain events appear in Loki + `vctennis_events` after real traffic
- [ ] Both dashboards match Cloud layouts and query successfully
- [ ] Test email from contact point arrives at Proton
- [ ] `vctennis-app-down` / `vctennis-errors-high` evaluate without datasource errors
- [ ] Netlify has no ship errors in function logs for 48h
- [ ] Docs in repo describe NAS URLs instead of Cloud portal steps

---

## 13. Suggested effort

| Work | Estimate |
|---|---|
| Docker + provisioning + LAN prove | 2–4 h |
| Tunnel + auth + external prove | 1–3 h |
| Dashboards + alerts + SMTP | 1–2 h |
| Netlify cutover + verify | 1 h |
| Soak + docs + Cloud cancel | spread over 1–2 weeks |
| **Total focused work** | **~1 day**, plus soak |

App code: **0–2 hours** if you only flip env; more only for renames / dual-write / compose-in-repo.

---

## 14. Decision checklist before starting

1. **Tunnel domain:** Which hostname will Netlify call?
2. **SMTP provider** for Grafana alerts (Resend vs other)?
3. **Cutover style:** short flip (A) vs temporary dual-write (B)?
4. **Grafana UI access:** VPN/Tailscale only, or Cloudflare Access?
5. **Accept history gap** on Cloud metrics/logs? (Recommended: yes.)

When those five are answered, Phase 1 can start on the DXP2800 without touching production Netlify env until Phase 4.
