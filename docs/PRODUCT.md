# UCFitness Product Context

## Register

- Default register: product
- Public landing page override: brand

## Product

UCFitness is a mobile-first fitness game that turns daily step data into visible goals, friendly competition, challenges, and UC rewards. The product should make the next useful action understandable within seconds while treating connected health data with care.

## Users

- Primary: mobile-first adults in their 20s to 40s who want a simple reason to walk more
- Secondary: competition-oriented users motivated by rankings, groups, and challenges
- Re-engagement: returning users with low recent activity who need encouragement without shame
- Accessibility: keyboard, screen-reader, low-vision, reduced-motion, and 320px reflow needs are first-class

## Core promise

Turn everyday steps into a loop people want to repeat:

1. See today's progress.
2. Understand a reachable competitive gap.
3. Earn a visible reward.
4. Return for the next achievable goal.

## Personality

- Energetic
- Colorful with purpose
- Playful, not childish
- Encouraging, not clinical
- Trustworthy with health data
- Compact and easy to scan

## Color roles

The public landing page uses a full-palette brand strategy rather than a dark SaaS treatment:

- Blue: daily goals and the primary action
- Emerald: completion, synchronization, and momentum
- Violet: competition, rank, and community
- Amber: UC rewards and earned value

Color must always be paired with text, numbers, or icons so meaning never depends on color alone.

## Anti-references

Do not make UCFitness look like:

- A dark developer tool or enterprise SaaS dashboard
- A monochrome finance product
- A page with a large empty hero and little product evidence
- A blue-purple glow composition presented as "fitness energy"
- A wall of identical cards, decorative gradients, or glass panels
- A cold interface that hides competition and rewards below the fold

## Landing-page requirements

- Show concrete product UI in the first view on mobile and desktop.
- Surface step progress and the next useful action in the first mobile view; move rank and UC into the immediately following proof section when the fold would become crowded.
- Keep the primary CTA immediately visible and at least 44px high.
- Use natural content height; do not stretch sparse content to `100vh`.
- Keep headings readable without gradient text.
- Preserve WCAG 2.2 AA contrast, visible focus, reduced motion, and 320px reflow.
- Keep `header`, `main`, and `footer` as sibling landmarks, and send the skip link to the real page `main`.
- When the header is fixed, keep skip-link and in-page targets below it with matching scroll margins; verify target top is not above the header bottom.
- Prefer compact vertical rows over unnamed horizontal card scrollers on mobile.
- When a named horizontal scroller is necessary, make it focusable only at widths where it actually scrolls, provide an operation hint and a 3:1 focus indicator, and keep the fully visible desktop layout out of the tab order.
- Align disclosure-to-full-detail changes with the breakpoint that can distribute those details across columns; compare page and section height one pixel below and at each breakpoint.
- At 320px, keep metric names, reward conditions, and values understandable without truncation.
- Keep the exact reward threshold beside compact numeric proofs, derive each proof surface color from its meaning rather than its array position, and expose enough of the next mobile card to make local horizontal scrolling discoverable. If the exposed content can be mistaken for decoration, add an explicit directional cue.
- Keep secondary benefits and trust details available on mobile through a labeled, keyboard-operable disclosure instead of removing them or restoring a full-height section.
- Keep one dominant message per viewport: the mobile hero prioritizes the CTA, current steps, and remaining steps; rank and UC stay visible in the next section instead of competing inside the fold.
- Stage supporting information in this order: today's progress, reachable gap, habit loop, product response, then rewards. Do not repeat the same metrics as separate chips, cards, and proof rows in one view.
- Map motion to meaning: progress draws forward, ranking bars grow, rewards arrive once, and the page progress line responds to scrolling. Avoid simultaneous decorative loops on mobile and do not apply the same entrance animation to every section.
- Motion is progressive enhancement. Unsupported browsers keep the complete static layout, and `prefers-reduced-motion: reduce` shows the final state immediately.
- Preserve text contrast throughout motion. Do not lower the opacity of containers that include readable text; animate transforms, SVG drawing, or separate decorative layers instead.
