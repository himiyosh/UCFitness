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

## First-session activation

- Setup is complete only when the user can confirm their step source, choose a sustainable daily goal, and understand the next action.
- Daily goals must stay within 500 to 100,000 whole steps; the suggested starting point is 5,000.
- Saving the profile leads to a persistent completion state rather than an immediate redirect.
- The first quest is a reachable 500-step action that hands off to Home, where progress, competition, and UC reward distance remain visible.
- Connection or profile lookup failures are shown as failures, never as an unconfigured account or a fabricated default.

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

## Authenticated-page requirements

- Audit every registered user route rather than treating the home dashboard or shared shell as a proxy for the whole product.
- Use the shared `AuthenticatedPageHeader` and `PageIntro` for standard authenticated pages. Keep the product wordmark out of the heading hierarchy and give each page one descriptive `h1`.
- Keep profile navigation on the canonical `/user/{username}` route. Use route-scoped loading skeletons rather than a global full-screen overlay that can outlive redirects or errors.
- Build date-driven initial UI from a server-provided `YYYY-MM-DD` and deterministic UTC arithmetic so Edge and browser hydration produce the same structure.
- Keep the information order: today's progress, reachable competition gap, UC reward, then the next action. Detailed rankings and friend activity follow that decision layer.
- Carry the reachable competition gap into detailed global and group ranking summaries once the user has positive recorded progress, so navigation does not remove the next actionable target. Exclude zero-step and absent users from ranks, medals, and success states while retaining the fixed row geometry with empty placeholders. Keep this insight outside fixed-height ranking rows.
- Separate recorded zero, missing data, and database/API failure. Recorded zero belongs in recorded-day averages but not active-day or best-day counts.
- Compare an in-progress month with the previous month through the same day, not with the previous full month.
- Give returning low-activity users an achievable 100–500 step entry point before harder optional goals.
- Require group membership for group-scoped ranking data, and do not reveal private-group existence to non-members.
- Use the shared dialog stack for every portal modal. Keyboard users must be able to cycle focus, press Escape, leave a long-running operation without duplicate submission, and return to the trigger.
- Pair every visual chart with an accessible value table or equivalent list. Hide image-capture-only duplicates from the accessibility tree.
- Treat 1024px authenticated layouts as sidebar-constrained tablet space. Keep the four-module home rail at two columns through 1280px and enable four columns at 1536px, when the remaining content container preserves readable card widths.
- Keep normal pages on document scrolling, keep legal footer links reachable from 320px upward, and make every visible interactive target at least 44 by 44 CSS pixels.
- Place screen-reader-only tables inside an absolutely positioned 1px wrapper so semantic alternatives never create visual dead space.
- Align panels that share a dashboard grid row from the same breakpoint upward, while preserving natural height in single-column mobile flow. Let charts absorb useful extra height instead of leaving empty bands inside stretched status panels.
- Keep QuickActions as an independent auxiliary dock. At `xl`, place Friend Pulse and the weekly ranking preview directly in the same grid row and align their bottoms. Friend Pulse keeps five activity-or-discovery rows, uses each user's own step goal, and summarizes positive-step activity count, combined steps, and reached goals without treating recorded zero as activity.
- Size chart plots from their own panel width with container queries. Home and profile charts should occupy roughly half or more of the panel once controls and summaries are accounted for, without clipping labels or removing accessible value alternatives.
- Keep visual chart axes, bars, and labels out of the accessibility tree when a complete semantic value table is present. Remove hidden visual scrollers from sequential focus, reserve plot headroom for value labels, clamp first/last labels to the plot edges, and preserve bar/goal-line boundaries in Forced Colors.
- Make the authenticated home feel like a fitness game through one data story: progress, reachable competition, earned step value, then the next achievable action. Follow with missions, weekly momentum, rewards, and challenges, then an independent utility dock and a direct Friend Pulse / weekly ranking comparison. The preview must carry the named next rival and required steps instead of ending at the current step total.
- Preserve the five-row leaderboard geometry and reactions, but place detailed competition context outside the rows. A compact Competition Mission shows current rank among positive-step participants, the named next rival, required steps, leader gap, and active period. Delay the outer global/group split until `2xl`; keep 1024px and 1280px single-column. Unknown/loading/error states do not expose a false 0% progressbar, non-top progress never reaches 100%, and scope failures remain independent and retryable.
- Challenge pages prioritize continuation over creation. Only joined, active, started, unfinished, incomplete challenges with available progress can become the focus item. Sort them by reachable remaining steps, then deadline and reward; lead with the next 100–500 steps, reserve fire urgency for the final three days, and keep creation after the list. Use the same JST deadline contract in list, card, and join authorization, and isolate stale tab/action requests with abort and generation guards.
- Reserve delight for real state changes. Goal, rank, UC, and mission completion may react once within 650ms; decorative infinite motion and repeated zero-value messaging are not allowed. Reduced motion must compute to zero animation and transition duration.
- Keep mission reads side-effect free. Mission generation, evaluation, and rewards require an explicit POST action and must never occur during GET. A ledger, balance, bonus, or completion write failure must return a non-success response; the approved single-RPC transaction remains a database prerequisite for full atomicity. Successful preparation moves focus to the mission heading and announces the new state; a newly earned bonus remains visible after the short celebration ends.
- Treat mission streak availability as an auxiliary state. If its database query fails, return `streak: null` with an explicit unavailable flag instead of converting it to zero or retrying already-applied reward writes.
- Do not convert challenge progress fetch failures into zero steps. Preserve recorded zero as data, and show an explicit unavailable state when the progress request fails.
- Prefer explicit local theme choice; use equipped themes only as the initial fallback on devices without a saved preference.
