# SolarFlow Component Specifications (`replica/design/components.md`)

Design specifications for all core primitives in SolarFlow Web and Desktop applications.

---

## 1. Button Primitive

- **Variants:** 
  - `primary`: Solid emerald gradient with high-contrast white text (`bg-accent`, `text-on-accent`).
  - `secondary`: Clean slate-light surface (`bg-surface-muted`, `border-border`, `text-text-muted`).
  - `accent-amber`: Solar generation action button for exports & milestones.
  - `ghost`: Transparent with subtle hover effect.
  - `danger`: Red action button (`bg-danger`, `text-white`).
- **Sizes:**
  - `sm`: 32px height, 12px text, 10px px, radius `sm` (8px).
  - `md`: 40px height, 13.5px text, 16px px, radius `md` (10px).
  - `lg`: 48px height, 15px text, 20px px, radius `lg` (12px).
- **States:**
  - `default`: Resting state with subtle shadow.
  - `hover`: Subtle translateY(-1px) elevation lift + shadow expansion.
  - `active`: translateY(0px) pressed feel.
  - `focus-visible`: 2px solid `var(--sf-accent)` ring with 2px offset.
  - `disabled`: Opacity 0.5, cursor `not-allowed`, no hover transforms.
  - `loading`: Retains width, displays rotating Lucide spinner, disables interactions.
- **Accessibility:**
  - Semantic `<button type="button|submit">`, `aria-busy` when loading, full keyboard accessibility.

---

## 2. Solar Telemetry Metric Card

- **Structure:**
  - Icon pill container with theme-specific background.
  - Metric label (`text-xs font-semibold uppercase text-text-subtle`).
  - Hero Value (`text-2xl font-extrabold tracking-tight text-text font-mono`).
  - Status trend indicator or subtitle.
- **Variants:**
  - `generation`: Emerald glow accent (`kWh`, `kW`).
  - `revenue`: Amber glow accent (`₹ Earnings`).
  - `inverters`: Sky blue accent (Online / Offline status).
  - `losses`: Crimson/Red accent (66KV tripping / curtailment loss).
- **Interactions:**
  - Interactive click transition with subtle card elevation (`--sf-shadow-card-hover`).

---

## 3. Responsive App Shell & Navigation

- **Desktop (>= 850px):**
  - Dark forest green sidebar (`#09261f`) with clean gold/emerald accents.
  - Brand header with solar icon badge.
  - Active navigation pill with glowing left bar and smooth backdrop highlight.
  - Top header with company switcher, multilingual Gujarati/English toggle, and notification bell.
- **Mobile (< 850px):**
  - Top status bar with live status chip.
  - Floating bottom navigation bar with frosted glass backdrop blur (`backdrop-filter: blur(12px)`).
  - Quick action drawer for secondary routes (Expenses, Salaries, AI Help Center).
- **Desktop Electron App:**
  - Frameless modern window titlebar integration with drag region.
  - Native feel, hardware-accelerated rendering.

---

## 4. Modal & Dialog Overlay

- **Overlay:** `rgba(7, 39, 31, 0.75)` with `backdrop-filter: blur(6px)`.
- **Card Container:**
  - Maximum width scaled by purpose (`460px` for alerts, `720px` for forms).
  - Rounded `xl` (20px), border `1px solid rgba(255, 255, 255, 0.2)`.
  - Close button in top-right with accessible tap target (38×38px).
- **Motion:** Fade-in + spring scale from 0.95 to 1.0.

---

## 5. Form Inputs & Select Controls

- **Base Field:**
  - Background `#ffffff`, border `1.5px solid var(--sf-border)`.
  - Padding `10px 14px`, font size `14px` (16px on mobile to prevent iOS auto-zoom).
  - Border radius `10px`.
- **Focus State:**
  - Border color `var(--sf-accent)`, box-shadow `0 0 0 3px rgba(4, 120, 87, 0.15)`.
- **Validation:**
  - Inline error text with alert icon, gentle red highlight (`border-danger`).
