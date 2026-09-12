---
name: "You, in iPhoneDuo"
description: "A quiet, preview-first phone-video editor with clear blue actions."
colors:
  bg: "#fff"
  ink: "#1d1d1f"
  muted: "#626267"
  line: "#d2d2d7"
  accent: "#0071e3"
  soft: "#edf5ff"
  surface: "#f5f5f7"
  accent-hover: "#0077ed"
  audio-selected: "#e6f1ff"
  audio-selected-text: "#0059b3"
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "15px"
  headline:
    fontSize: "32px"
    fontWeight: 650
    letterSpacing: "-0.025em"
  title:
    fontSize: "21px"
    fontWeight: 650
    letterSpacing: "-0.025em"
  label:
    fontSize: "14px"
    fontWeight: 600
  helper:
    fontSize: "12px"
    lineHeight: 1.6
rounded:
  control: "8px"
  reset: "10px"
  surface: "12px"
  dialog: "18px"
  rail: "22px"
  rail-primary: "26px"
spacing:
  compact: "8px"
  small: "12px"
  regular: "16px"
  control-group: "22px"
  section: "32px"
  desktop-columns: "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.bg}"
    rounded: "{rounded.rail-primary}"
    padding: "7px 2px"
    width: "52px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-reset:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.reset}"
  number-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    width: "70px"
  mode-selected:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
  upload-surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "22px"
---

# Design System: You, in iPhoneDuo

## Overview

**Creative North Star: "The preview is the surface."**

Preserve the existing name and phone mark in `public/brand/mark.svg`. The confirmed direction is inspired by Apple's website: white and light gray surfaces, system typography, blue actions and a large video preview. The existing purple logo remains an identity asset; it does not define the interaction palette or imply Apple affiliation.

This is the implemented editor, documented from the final CSS cascade in `src/styles.css` and its React components. It is a code-led design with no approved image comp. The preview, upload and adjustment areas sit directly on the page, with space and typography establishing hierarchy.

**Key Characteristics:**

- A large working preview with quiet surrounding controls.
- Neutral surfaces and blue interaction states.
- Main actions remain on the right; errors appear at the top.
- The existing phone logo and multilingual product name stay recognizable.

Local desktop and mobile-viewport screenshots are recorded in `evidence/review/` (empty and editing states). Reviewer disposition is **ship within the reviewed visual scope**, with the mobile replacement label resolved. This document does not establish physical-phone or production verification.

## Colors

The palette uses clear action blue against white and soft neutral gray. Frontmatter values are normative; names below describe their roles.

The companion `.impeccable/design.json` extends these tokens with shadows, motion, breakpoints and isolated component samples. Its generated tonal ramps are panel illustrations, not additional colors used by the application.

### Primary

- **Action blue** (`accent`): render/download actions, links, slider accents, selected clip borders and keyboard focus.
- **Hover blue** (`accent-hover`): primary rail action hover.
- **Soft blue** (`soft`): upload hover/drag state and secondary interaction feedback.
- **Selected audio blue** (`audio-selected`, `audio-selected-text`): the checked audio choice, with darker text on a pale fill.

### Neutral

- **Page white** (`bg`): page, selected mode and floating surfaces.
- **Near-black ink** (`ink`): headings, active labels and ordinary text.
- **Secondary gray** (`muted`): metadata, hints and inactive controls.
- **Divider gray** (`line`): functional separators and outlined clip choices.
- **Surface gray** (`surface`): upload target, segmented control, numeric input, reset and action-rail surround.

Error alerts use a separate pale red surface and dark red text. These semantic treatments do not become decorative accents.

## Typography

All UI text inherits the system stack in the frontmatter; no display webfont is required. Traditional Chinese, Simplified Chinese and English share the same visual hierarchy.

The preview heading uses the headline role, while upload and adjustment headings use the title role. At widths up to 740px they become 27px and 20px respectively. The brand is 25px on desktop, 19px on mobile and 16px at widths up to 360px; its name uses weight 750 while “You, in” uses weight 400.

Controls use the label role. Helpers and file metadata are smaller and muted. Timecodes, numeric inputs and adjustment values use tabular numerals. Do not turn supporting copy into oversized marketing headlines.

## Layout

The centered shell has a maximum width of 1280px. It reserves 80px on the trailing side for the fixed action rail, in addition to safe-area-aware padding. Desktop content uses at least 24px left padding and 104px right padding; up to 740px these become at least 14px and 90px. The header extends into the reserved rail space.

The editor has a fluid preview/upload column and a 280px adjustment column, separated by 48px. At widths up to 1040px, these stack into one column with a 12px gap and a top divider before adjustments. The DOM order is preview, upload, adjustments. One-video mode is the default; two-video mode reveals the folded/unfolded selectors.

The header is 76px tall on desktop and 68px on mobile. Main content starts 40px below it, or 24px on mobile. Preview media preserves 16:9. Preview-to-upload spacing is 38px on desktop and 30px on mobile.

At widths up to 740px the timeline wraps onto its own full-width playback row. Two-video selectors remain a two-column grid. At widths up to 950px an uploaded single-video target uses a separate second-column row for the visible replacement action; retain this resolved mobile behavior.

The rail stays fixed near the vertical center at the safe right edge, with a minimum top position of 120px. Short viewports (up to 420px high) center it directly and reduce button minimum height from 60px to 50px.

## Elevation & Depth

Ordinary sections are flat, transparent and borderless. Tonal fills distinguish controls; separators mark changes in function. Shadows communicate temporary floating layers rather than lifting every section.

- Floating preview: `0 8px 32px #27233329`, with opacity 0.88.
- Processing progress: `0 8px 32px #00000018`.
- Top error: `0 8px 28px #30212324`.
- Share-dialog backdrop: `#27233340`.

The action rail itself has no shadow. It uses a light gray surround. Layer order is rail (10), floating preview (20), then top error (100); native dialog/popover top-layer behavior also applies.

## Shapes

Use modest rounded controls, larger rounded temporary surfaces and a pill-shaped primary rail action, as captured in the frontmatter. Preserve the phone-outline illustrations in the two-video picker.

A selected clip has a two-pixel blue border instead of the resting one-pixel gray border. Its padding shrinks by one pixel on every side so selection does not move the layout. The preview's 16:9 image and the phone template are not reshaped to fit a decorative card.

## Components

### Header

Keep the existing linked brand and language selector. The selector is visually borderless, has a 44px minimum height and retains visible keyboard focus. Small screens place “You, in” above the bold product name.

### Right action rail

Primary render/download actions combine an icon with a short text label. Buttons are 52px wide and normally at least 60px high. Hover changes the background; disabled render uses muted text and a gray fill at full opacity. A result adds edit/download/share actions. Active processing adds cancellation and a progress panel to the rail's left; queue progress is indeterminate.

### Upload and mode controls

The mode selector uses a light gray track and a white selected segment, exposed with `aria-pressed`. The single-video upload surface changes to pale blue on hover or file drag. After upload, show filename, duration, dimensions, size and the replacement action; ellipsize the filename without hiding that action.

Two-video mode uses folded/unfolded phone silhouettes and selected borders. Its compact source-detail row carries explicit choose/replace wording rather than an extra trailing replacement label. Mode changes preserve uploads and settings.

### Adjustment controls

Keep numeric start time, range sliders, horizontal/vertical positioning, reset, fold switch and audio choices grouped by purpose. Sliders, numeric fields and the main control choices have 44px minimum interaction height. Audio radios use a filled selected state. A disabled fieldset is shown at opacity 0.45 when there is no editable media, processing is active or a result is displayed.

Buttons, links and inputs receive a three-pixel blue focus outline with four-pixel offset; grouped audio radio labels receive their own visible outline. Standard button color/background transitions last 0.15 seconds. Reduced-motion preference disables CSS animation and transitions.

### Preview and floating preview

The empty state shows the template demo. Editing adds muted playback, a timeline and drag/pinch framing. Loading shows an overlay; failed preview preparation offers a retry action. The result state replaces the editor canvas with result playback.

When the enabled editing preview is less than 60% visible, it becomes a translucent draggable window. Its width is capped by 280px, viewport width minus 112px, and available viewport height. It stays inside the visual viewport with at least 12px or safe-area insets, and can reach the safe right edge independently of the action rail. Moving the window does not change the crop.

The floating header offers move, return and close controls. Arrow keys move it by 16px, or 48px with Shift. Returning scrolls to the full preview and restores focus to playback. Closing suppresses floating until the full preview becomes visible again.

### Errors and sharing

Errors appear in a fixed, safe-area-aware top alert, at most 560px wide, with dismiss and optional reload actions. Preserve the alert role and manual popover so errors stay above the share dialog and floating preview.

The share dialog is centered, at most 360px wide, with internal overflow for short viewports. Sharing remains limited to the product's supported X/Threads flows and associated native sharing controls. Footer source attribution and privacy copy remain visible.

## Do's and Don'ts

### Do:

- **Do** preserve the product name and existing phone logo.
- **Do** keep the video visually dominant and the surrounding editor quiet.
- **Do** reserve space for right-side actions at every viewport width.
- **Do** retain visible replacement wording after upload on mobile.
- **Do** preserve visible keyboard focus, readable states and reduced-motion support.

### Don't:

- **Don't** reintroduce boxed cards around every editor section.
- **Don't** replace the system typography or blue action palette with the logo's purple.
- **Don't** hide errors below the content or move primary actions into a mobile bottom bar.
- **Don't** confuse dragging the floating preview with changing the video crop.
- **Don't** describe local viewport screenshots as physical-phone or deployed verification.
