# 🧠 Geniality Plan — DOOH Simulator Evolution Roadmap

> *"When the time comes, we execute."*
> Generated: March 9, 2026

---

## Current Platform Inventory

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 14 + React 18 + TypeScript + Tailwind + Zustand |
| Vision API | FastAPI (Python) + YOLOv8 + SAM (ViT-H) + OpenCV |
| 3D Render | Three.js `@dooh/render` with custom GLSL shaders |
| Shared Types | `@dooh/core` TypeScript package |
| Database | SQLite via Prisma 7 (Points, Leads, Simulations) |
| Monorepo | Turborepo + npm workspaces |

---

## Phase 1 — Activate WebGL Preview (Three.js Shaders → Browser)

**Priority:** HIGHEST — biggest ROI, code is 90% written.

### What exists today
- `@dooh/render` package has full GLSL shaders:
  - `led-screen.glsl` — Creative texture + UV fit + pixel grid mask + scene-match color correction
  - `glass-overlay.glsl` — Fresnel reflection (Schlick) + roughness + fake env reflection + tint
  - `cinematic.glsl` — Chromatic aberration + bloom + Reinhard highlight compression + vignette + grain
- Three.js engines: `DisplayEngine`, `GlassOverlayEngine`, `CinematicComposer`, `CompositorScene`
- All orchestrated by `CompositorScene` with orthographic camera in pixel space

### What's wrong
- `PreviewCanvas.tsx` currently uses **Canvas 2D** perspective transforms
- The Three.js pipeline is written but NOT wired to the browser preview
- Users see a flat 2D composited image instead of real-time shader-rendered output

### What to build
1. Create a `WebGLPreviewCanvas.tsx` component that instantiates `CompositorScene`
2. Feed it: background plate, creative texture, corner data, render preset, time-of-day, environment
3. Replace the Canvas 2D preview with the WebGL renderer
4. Result: real-time pixel grid, glass reflections, bloom, cinematic post — all at 60fps

### Impact
- Instant visual quality leap — night-and-day difference
- Screen looks like a real LED display, not a flat overlay
- Enables future features (interactive lighting, real-time parameter tweaking)

---

## Phase 2 — Campaign Entity + Multi-Point Grouping

**Priority:** HIGH — fills 2 existing placeholder pages.

### What exists today
- `/simulator/campaigns` page — shell only, shows "Em breve"
- `/simulator/exports` page — shell only, shows "Em breve"
- `Simulation` model logs pointId + creative dimensions + timestamp (no output reference)
- No `Campaign` entity in Prisma

### What to build

#### Data Model
```prisma
model Campaign {
  id          String   @id @default(cuid())
  name        String
  client      String   @default("")
  description String   @default("")
  creativeUrl String   @default("")
  creativeType String  @default("image")
  creativeWidth  Int   @default(0)
  creativeHeight Int   @default(0)
  status      String   @default("draft") // draft | active | completed
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  simulations CampaignSimulation[]
}

model CampaignSimulation {
  id          String   @id @default(cuid())
  campaignId  String
  campaign    Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  pointId     String
  point       Point    @relation(fields: [pointId], references: [id])
  renderUrl   String   @default("") // exported image/video URL
  renderType  String   @default("image")
  status      String   @default("pending") // pending | rendered | exported
  createdAt   DateTime @default(now())
}
```

#### Features
1. Create campaign → select creative → select multiple DOOH points
2. Campaigns page shows all campaigns with point count, status, last render date
3. Each campaign expands to show per-point simulation previews
4. Batch render: simulate the same creative across all selected points
5. Exports page: browse all rendered outputs grouped by campaign

### Impact
- Transforms the tool from "single-point previewer" to "network campaign planner"
- Agencies can present a full DOOH network buy in one flow
- Fills the 2 empty pages that clients can already see in the nav

---

## Phase 3 — AI Attention Heatmap

**Priority:** HIGH — unique market differentiator, no competitor has this.

### Concept
Upload a creative → AI generates a **saliency heatmap** predicting where human eyes land. Overlaid on the simulator preview with a **Visibility Score (0-100)**.

### Technical Approach

#### Option A: TranSalNet (recommended)
- Lightweight saliency prediction model (~50MB)
- Add as Python endpoint in `apps/vision/routers/saliency.py`
- Input: creative image → Output: heatmap (grayscale probability map)
- Run inference on CPU — fast enough for single images

#### Option B: CLIP-based attention
- Use CLIP to compute text↔image region relevance
- Input: creative image + brand name → highlights regions matching brand identity
- More sophisticated but heavier

#### Integration
1. New endpoint: `POST /api/vision/attention-heatmap`
   - Accepts: creative image (or URL)
   - Returns: heatmap image (PNG) + visibility score + top-3 attention zones
2. Frontend: overlay heatmap on PreviewCanvas with adjustable opacity
3. Show Visibility Score badge on the simulation card
4. In Campaign mode: rank points by predicted attention score

### Sales pitch transformation
- Before: *"Here's how your ad looks on this screen"*
- After: *"Here's PROOF that 78% of pedestrian attention lands on your brand logo"*

### Impact
- First DOOH simulator with AI-powered attention prediction
- Quantifiable creative effectiveness metric
- Agencies can justify creative decisions with data

---

## Phase 4 — PDF Proposal Generator

**Priority:** MEDIUM — turns the simulator into a sales-closing machine.

### Concept
After simulating a creative across points, generate a **professional PDF proposal** with:
- Rendered mockups (before/after for each point)
- Screen specs (resolution, nits, location map)
- Audience data & classification
- Compliance results (aspect match, resolution check)
- Attention heatmap + Visibility Score (if Phase 3 done)
- Estimated impressions based on minimum insertions
- Intermidia branding + contact info

### Technical Approach

#### Option A: React-PDF (@react-pdf/renderer)
- Generate PDF entirely on the client
- Use React components to define layout
- Works with Next.js, no server dependency
- Good for simple layouts

#### Option B: Puppeteer (server-side)
- Create an HTML template page (hidden route like `/api/proposal/[campaignId]`)
- Use Puppeteer to render → PDF
- Better for complex layouts, pixel-perfect output
- Requires server-side Node.js

#### Proposed template sections
1. **Cover page** — Campaign name, client, date, Intermidia logo
2. **Executive summary** — Point count, total impressions, audience reach
3. **Per-point pages** — Before/after mockup, specs table, heatmap, score
4. **Creative compliance** — Pass/warn/fail checklist per point
5. **Network map** — Points plotted on a simple map by city
6. **Pricing / CTA** — Contact info, next steps

### Impact
- One-click sales proposal from simulation data
- Replace manual PowerPoint creation
- Professional output that closes deals

---

## Phase 5 — A/B Creative Split-Screen

**Priority:** MEDIUM — simple to build, high value for agencies.

### Concept
Side-by-side comparison of two different creatives on the same DOOH point. Drag a slider to compare. Combined with Attention Heatmap, each creative gets a Visibility Score for data-driven selection.

### What exists today
- `BeforeAfterSlider` component already built (used for before/after comparison)
- `CompatiblePointsSuggestion` already ranks points by creative compatibility

### What to build
1. **A/B mode toggle** in the simulator top bar
2. Second creative upload slot (Creative A / Creative B)
3. Split-screen renderer: same background + same point, different creatives
4. Draggable comparison slider (reuse `BeforeAfterSlider`)
5. If Attention Heatmap exists: show Visibility Score for each → declare winner
6. Export A/B comparison as a single image or slide

### Impact
- Agencies compare creative options visually on the actual DOOH point
- Data-driven creative selection (not gut feeling)
- Minimal dev effort — reuses existing components

---

## Phase 6 — AR On-Site Preview (WebXR)

**Priority:** FUTURE — highest wow-factor, highest effort.

### Concept
Generate a QR code per point. Client scans it on-site, opens a WebXR session. Phone camera shows the real location with the creative composited onto the actual screen in real-time.

### Technical Approach
1. **QR generation** — Each published point gets a shareable URL: `/ar/[slug]`
2. **WebXR session** — Use `@react-three/xr` or raw WebXR API
3. **Anchor placement** — Use the stored screen corners as the AR anchor rectangle
4. **Creative rendering** — Apply the same display shader (pixel grid, nits, glass) in AR
5. **Fallback** — For devices without AR support, show the standard simulator preview

### Prerequisites
- Phase 1 (WebGL preview) must be done — same Three.js pipeline powers AR
- Stored screen corners must be accurate (already are via SAM + tracking)
- HTTPS required for WebXR (already the case in production)

### Challenges
- AR anchor accuracy depends on the user standing near the mapped viewpoint
- Lighting estimation varies by device
- iOS Safari WebXR support is still limited (may need native wrapper)

### Impact
- "Jaw-dropper" in client meetings
- Client physically stands at the DOOH point and sees their ad
- Unmatched immersive sales experience

---

## Bonus Ideas (Lower Priority, High Potential)

### 7. AI Scene Understanding
- Use CLIP or LLaVA to describe location context automatically
- *"Busy urban intersection, glass storefront, high foot traffic"*
- Auto-suggest creative placement strategies based on context

### 8. Dynamic Creative Optimization (DCO) Preview
- Show how data-driven creative variations render across different conditions
- Time: morning commute vs evening leisure
- Weather: sunny vs rainy (glass reflections change!)
- Audience: different demographic targeting

### 9. Ambient Sound Context
- Pair visual simulation with ambient audio profiles
- Busy intersection, quiet office lobby, shopping mall
- Immersive buyer presentations with sound

### 10. Environmental Impact Scoring
- Power consumption estimates based on nits × screen area × runtime
- Carbon footprint calculation
- Eco-certification alignment badges

### 11. Competitor Screen Detection
- Upload a street photo → auto-detect ALL screens (not just yours)
- Show competitive DOOH landscape
- *"There are 3 other screens within 50m — here's how yours stands out"*

### 12. Analytics Dashboard
- Simulation count per point, per time period
- Popular points ranking
- Lead conversion tracking (WhatsApp captures → follow-ups)
- Export history and download stats

---

## Existing Gaps to Fix Along the Way

| Gap | Description | When to Fix |
|-----|-------------|-------------|
| Image export is client-only | Server endpoint is a stub | During Phase 2 |
| Simulation model is log-only | No creative URL, render settings, or output reference stored | During Phase 2 |
| Lead model is disconnected | No relation to Simulation | During Phase 2 |
| No export history | Rendered videos are fire-and-forget | During Phase 2 |
| No authentication | Admin pages are unprotected | Before production launch |
| No i18n | UI is Portuguese-only | When targeting international markets |
| Video render store is ephemeral | Progress lost on page refresh | During Phase 1 |

---

## Execution Order Summary

```
Phase 1: WebGL Preview ──────────── (unlock visual quality)
    │
Phase 2: Campaigns + Exports ────── (fill placeholder pages, data model)
    │
Phase 3: AI Attention Heatmap ───── (unique differentiator)
    │
Phase 4: PDF Proposal Generator ─── (sales closer)
    │
Phase 5: A/B Creative Comparison ── (agency workflow)
    │
Phase 6: AR On-Site Preview ─────── (showstopper demo)
    │
Bonus: Scene AI, DCO, Sound, Analytics...
```

---

*When you're ready: "Hey my dude, let's execute the Geniality Plan" — and we ship it.* 🚀
