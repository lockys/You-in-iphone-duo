# You, in iPhoneDuo

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users and purpose

People making a short phone meme for X or Threads, primarily on their phones. They should see the effect immediately, upload a clip, adjust it and download a real MP4 without an account.

## Capabilities and constraints

- Modern.js 3.9, React, Rspack and native server FFmpeg. No paid media service or browser-side export engine.
- Default to one video for the whole template. An explicit two-video mode assigns independent clips and framing to folded/unfolded states; switching modes preserves uploads and settings.
- Each upload is limited by MAX_UPLOAD_MB, at most 20 MB, with no duration limit. Output remains 1920×1080 H.264, yuv420p, AAC when audio is present, and faststart.
- Preserve the original restored fold effect and the source template. Previews are muted and support Safari playback recovery, pointer dragging and pinch zoom.
- Bounded cancellable processing queue; temporary private media; no filenames, video content or raw native errors in logs.
- Traditional Chinese (Taiwan), Simplified Chinese and English. Sharing is limited to X and Threads, with #uiniphoneduo.

## Brand commitments and interaction

Keep the name and existing phone logo. The user explicitly requested the Apple official website aesthetic: white/light gray surfaces, system typography, blue actions and a large video preview. This is a web tool and does not claim Apple affiliation.
Main actions float on the right. Errors remain at the top. When the editing video scrolls out of view, keep a draggable translucent preview that can reach the right edge.

## Evidence

The existing 8150.mp4 template and source attribution remain visible. MIT attribution for the adapted fold effect remains in README and the shipped license notice. Verification must distinguish local automation, physical phones and production deployment.
