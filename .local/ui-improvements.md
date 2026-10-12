* percents in window title
* image overlay zoom

# Image Bench UI improvements

I went through the app shell, the image views and card, the overlay, Explore, Generate and Settings. Here is what I
found and what I'd change, from small fixes to radical options.

## What's wrong now

**1. The image card has too many buttons.** On hover a tray thumbnail shows up to 9 icon buttons on the left, 2 on the
right, the select circle, 8 marking emoji along the bottom and the badges, all at once
(`components/GeneratedImage.vue:200-250`). Thumbnails are capped at `min(30%, 27vw)`, so the left group wraps to two
rows and covers the image you are judging. Every icon is the same size and weight, so "Delete" looks as important as
"Show parameters".

**2. Many features are hidden behind the middle mouse button.** Middle-click does six different things:

- reuse all parameters (instead of just the seed)
- upscale with a preset
- send to Photoshop as a new document
- filter by a marking
- open the image in a new window
- ⋯

You only learn about them from tooltips, and most touchpads have no middle button. "Reuse all parameters" is even marked
`// currently undocumented`.

**3. Buttons act on mousedown.** Most actions use `@mousedown.left`, so they fire before you release the button and you
can't cancel by dragging away. Some buttons use `@click` instead, so the card isn't consistent.

**4. The card and the full-size viewer don't match.**

- The card uses SVG icons. The viewer (`ImageOverlay.vue`) uses emoji (💡 🎨 🎛️ 📤 🗑️) for the same actions.
- The viewer has no reuse seed, parameters or upscale. To use them you have to close it and find the thumbnail again.
- Parameters open in a separate overlay.

**5. There are three overlapping ways to label an image:** marking emoji (which include six coloured circles),
`tagColor` bars, and comments. On top of that, "concept tray" vs "image tray" is a fourth category whose difference the
UI never explains.

**6. The active tab changes on its own.**

- `App.vue:switchTabAccordingToGenerationMode` moves you to another tab whenever a batch starts, even if you were in the
  middle of something.

**7. Batch generation exists in two places.** Generate ×N, the preset count, ∞ and Variations… appear on both the
Generate tab and the Generated tab. Meanwhile, the Generate tab shows only the latest image.

**8. Destructive actions are inconsistent.**

- Each tray delete asks for confirmation, and there is no undo.
- The toolbar button silently changes between "Clear" and "Clear selected" depending on whether anything is selected.
- The ⋯ menu ranks its actions by danger with ☢️ / ☢️☢️ / ☢️☢️☢️.

**9. Selection only works in the trays.** In Generated you can't select 20 good images and send them to a tray at once.

**10. Small bugs I noticed:**

- Arrow-key navigation in the viewer respects "show marked" but ignores the specific marking filter
  (`ImageStream.vue:getNextImage`), so it steps onto images that are hidden.
- `onFilterMarking` assigns to a prop (`props.showMarked = true`).
- `if (isTray)` tests a ref object, so it is always true.

## Incremental fixes (keep the current structure)

**A. One list of actions, shared by every place that shows them.** This is the change I'd make first, because most of
the others depend on it. Add `src/imageActions.js`, where each action is defined once:

```js
{
    id: "toImageTray", icon
:
    "palette", label
:
    "Add to image tray", key
:
    "T",
        visible
:
    ({kind, isTray, image}) =>
...,
    run: (image, {alt}) =>
...
}
```

The card, the viewer, a right-click menu, keyboard shortcuts and a bulk-selection toolbar would all be built from this
list. Then the emoji-vs-icon mismatch can't come back, and a new action appears everywhere at once.

**B. A smaller card.** Show at most 3 buttons on hover, and move everything else into a ⋯ / right-click menu with text
labels:

```
┌──────────────────────────┐
│ ○                 🎨 💡 ⋯│   ← select, tray toggles (filled when the image is already in that tray), menu
│                          │
│                          │
│ HR 30st             👍   │   ← badges, current marking only
└──────────────────────────┘
⋯ menu:  Reuse seed           S
         Reuse all parameters  Shift+S
         Parameters…           P
         Generate with steps…
         Upscale               U
         Upscale with denoising…
         Send to ControlNet
         Send to Photoshop     Ctrl+P
         Send to Photoshop (new document)
         Comment…              C
         ─────────
         Delete                Del
```

Each middle-click variant becomes its own labelled menu entry, or Shift+click. All actions use `@click`.

**C. Keyboard-driven culling in the viewer:**

- 1–8 set a marking, 0 clears it
- T / C add to the image / concept tray
- Del deletes and moves to the next image
- S / Shift+S reuse the seed / all parameters
- P toggles a parameters panel next to the image instead of a separate overlay
- Space toggles selection

That would let you rate 100 images without touching the mouse.

**D. Undo instead of confirmations.** Delete and Clear happen immediately and show an "Undo" toast for about 6 s. Keep
confirmations only for deleting files on disk.

**E. Selection in every list.** When anything is selected, the toolbar switches to a bulk bar:
`12 selected · Add to tray · Upscale · Send to Photoshop · Remove · ✕`. That also removes the Clear / Clear selected
ambiguity.

**F. Stop switching tabs automatically.** When a batch starts while you're on another tab, pulse the destination tab's
count badge instead. Keep the current behaviour as a setting if you want it.

## Radical options

**R1 (rejected): one Library view instead of the image tabs.** Rejected: the tabs deliberately keep the image sets
apart, so each set is one click away and is previewed at a large size right away.

**R2. Generate becomes the main workspace.** Add a session filmstrip along the bottom or right edge of the Generate tab.
Every image streams there, whether it came from one Generate click or a batch of 128. Clicking a filmstrip item shows it
in the image cell. Shift+click compares it with the current one. Batch Generate / Variations then live only in the
Generate tab. The Generated tab stays for browsing the batch at a large size, and its toolbar keeps only Stop and the
progress indicator.

**R3. Turn the viewer into an inspector.** A large image on one side, with parameters, a diff against the previous image
or the current WebUI settings, actions and marking on the other. Add a compare mode: select 2–4 images to see them side
by side with zoom and pan synced, and the differing parameters highlighted. This fits a tool built around parameter
sweeps much better than a single-image lightbox.

**R4. Explore results as a matrix.** Instead of one section per model, show a grid: models (or LoRAs) as rows, seeds as
columns, with sticky headers and per-row actions ("keep this model", "open on Civitai"). The same layout works for
VaryingParameters sweeps (steps × denoise). This is the XY-plot view people use to compare models.

**R5. Command palette (Ctrl+K).** Every action from A, plus navigation and maintenance ("Clear outputs…", "Open manual",
"Switch to Inpaint"), searchable by name. It's cheap once the action list exists, and it's the main way keyboard users
find features.

**R6. Drag and drop everywhere.** Drag a thumbnail onto a tray tab, onto the Generate input cell (sets the img2img
input), onto a ControlNet unit, or onto a Photoshop drop zone in the header. This replaces several of the "Send to …"
buttons with something you can discover just by trying it.

## Suggested order

1. **The shared action list (A), the smaller card (B) and viewer keyboard shortcuts (C).** These fix the most common
   annoyances without changing the app's structure.
2. **Undo (D), selection everywhere (E) and no auto-switching (F).**
3. **The radical options:** R2 (filmstrip in Generate) gives the biggest structural improvement. R3 and R4 are where the
   tool could stand out from plain WebUI.
