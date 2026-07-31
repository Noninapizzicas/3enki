---
name: ui-nomenclature
description: Reverse-lookup glossary that turns a vague description of a UI element into its exact technical name ("the overlapping circles with +3" → Avatar Group; "the thing that dims the page behind a popup" → Scrim). Use when the user describes a UI component without knowing its name, or when you need the precise term for an element you're building. Covers 76 web and macOS components. For naming a component, not building one.
fuente: namethatui
url: https://namethatui.com
---

# UI Nomenclature

Turn a vague description of a UI element into the precise technical term, so you know exactly what to build or ask for.

## Quick Start

The user describes a UI element loosely. You return the matching term(s) in this format:

```
**Scrim** (Backdrop / Overlay) — The translucent layer that separates a modal surface from the page.
```

If several terms could fit, list the best match first, then 1–2 alternates with a one-line note on how they differ.

## Instructions

1. **Read for intent, not keywords.** Users describe what they *see* or *want* ("the numbered dots at the top of checkout", "the menu that shows when you right-click"), not the technical name. Map the visual to the glossary below.
2. **Quote the glossary verbatim.** Its descriptions are authoritative — use them as-is, don't paraphrase.
3. **Disambiguate close terms.** When two compete (*Popover* vs *Tooltip*, *Modal* vs *Drawer*, *Badge* vs *Chip*), contrast them so the user can pick.
4. **When nothing matches exactly,** name the closest term and say plainly it's an approximation, or describe the element using the glossary's vocabulary.
5. **Stay within this glossary.** If a term genuinely isn't here, say so rather than inventing one.
6. **Keep it tight.** A naming question wants a name, not an essay. Lead with the term; expand only if asked.

## Examples

**Example 1 — visual description**
User: "What do you call the overlapping profile pictures with the +5 at the end?"
Output:
```
**Avatar Group** — Overlapping profile circles with a ring between them and a +N at the end.
```

**Example 2 — disambiguation**
User: "The popup thing that appears when I hover over a link."
Output:
```
**Hover Card** — A rich, non-modal preview revealed from a hovered or focused reference. Shows a content preview (profile, page summary) on hover.

Not to be confused with:
- **Tooltip** — A plain-text label on hover, for labeling a control (no interactive content).
- **Popover** — Triggered by click, not hover; stays until dismissed; may contain interactive elements.
```

**Example 3 — "what are the parts of…"**
User: "What do you call the different parts of a form input?"
Output:
```
**Form Field** — Every part of a labeled input: **label** (the text above), **placeholder** (the gray hint inside), **helper text** (guidance below), and the red **error line** (validation feedback).
```

---

## Glossary — Web Components

**Steps**
The numbered circles across the top of a checkout or wizard, one per stage.

**Avatar Group**
Overlapping profile circles with a ring between them and a +N at the end.

**Multi-select**
One control holding several values: the checkbox dropdown, the chip field, and the two-pane transfer list.

**Scrollspy**
The "On this page" list whose current link follows what you're reading.

**Inline Alert vs. Callout vs. Banner**
Three in-page notices named by where they sit, and none of them is a toast. Alert = inline with content. Callout = highlighted block. Banner = full-width strip at top/bottom.

**Sign-in Form**
The login form's nameable parts — the eye (password visibility toggle), the OR line (divider), and the Continue-with buttons (social login).

**Pagination**
The numbered page buttons under a list — and the dot version, the page control.

**Date Picker**
The little calendar that pops up on a date field — and the highlighted stripe of a range.

**Parallax Scrolling**
Layers that scroll at different speeds — the background lags and depth appears.

**Carousel**
A strip of slides you page through with arrows or the little dots.

**Site Header vs. Navigation Bar**
The whole top strip is the header; the row of page links inside it is the nav.

**Card**
The rectangle with media, title, body, and a footer — every part has a name.

**Resize Handle** (Size Grip)
The three diagonal lines in a text box's corner that you drag to make it bigger.

**Hamburger Menu** (Nav Drawer)
The three-line button and the navigation panel it slides open.

**Bento Grid**
One grid, mixed tile sizes — a layout packed like a bento box.

**Masonry Layout** (Pinterest Grid)
Cards of different heights packed into columns with no row gaps.

**Easing** (Timing Function)
The speed curve of an animation — why motion feels smooth or robotic.

**Spring Animation**
Physics-based motion that overshoots the target and settles.

**Text Scramble** (Decode Effect)
Random characters churn and settle into the real text.

**Lightbox**
The click-to-enlarge image overlay that dims the page behind it.

**Marquee**
Content that auto-scrolls sideways in an endless loop.

**Form Field**
Every part of a labeled input — label, placeholder, helper text, and the red error line.

**Truncation** (Ellipsis / Line Clamp)
Text cut short with … — at the end of the line, after N lines, or in the middle.

**Drag & Drop**
The grips, handles, previews, and landing cues around a drag interaction.

**Divider vs. Separator vs. Rule**
The same thin line can mark a topic break, separate controls, or be decoration.

**Progress Ring vs. Spinner vs. Progress Bar**
A spinner means wait; a ring or bar can show how much work is complete.

**The Three Dots** (Overflow Menu)
Horizontal dots, vertical dots, three lines, and an ellipsis mean different things.

**Toast** (Snackbar)
A brief, non-blocking message that appears after an action.

**Modal Dialog vs. Drawer vs. Sheet**
Three overlay patterns distinguished by placement, scope, and task depth. Modal = centered, blocking. Drawer = slides from edge, can be non-blocking. Sheet = attached to a parent, scoped.

**Popover vs. Dropdown Menu vs. Tooltip**
Three anchored overlays with different triggers, content, and dismissal rules. Popover = click, rich content. Dropdown = click, action list. Tooltip = hover, plain text.

**Scrim** (Backdrop / Overlay)
The translucent layer that separates a modal surface from the page.

**Skeleton vs. Spinner**
Two loading indicators for predictable layouts and indeterminate waits. Skeleton = placeholder shapes where content will appear. Spinner = generic "loading" with no layout hint.

**Combobox** (Autocomplete / Typeahead)
A text input paired with a filtered list of selectable suggestions.

**Command Palette**
A keyboard-first searchable launcher for actions and navigation.

**Accordion** (Disclosure)
Stacked sections whose headings expand and collapse their content.

**Tabs**
A single row of labels that switches one shared content region.

**Badge vs. Chip vs. Pill vs. Tag**
Compact labels distinguished by meaning, shape, and interactivity. Badge = status/count. Chip = interactive token. Pill = shape variant. Tag = categorization label.

**Breadcrumbs**
A hierarchy trail from the current page back to its ancestors.

**Sticky vs. Fixed Positioning**
Two ways to keep an element visible with different containing blocks. Sticky = scrolls then sticks. Fixed = always relative to viewport.

**Focus Ring** (:focus-visible)
The keyboard-aware outline that identifies the active control.

**Empty State**
Purposeful guidance shown when a view has no content yet.

**Hover Card**
A rich, non-modal preview revealed from a hovered or focused reference.

**Switch vs. Checkbox vs. Radio**
Controls for an on/off setting, independent choices, or one choice from a group. Switch = immediate toggle. Checkbox = multiple independent. Radio = one from group.

**Toggle Group** (Segmented Control)
A connected row of compact options with one persistent selection.

---

## Glossary — macOS Components

**Insertion Caret** (Insertion Point)
The blinking line inside text that marks where the next character will appear.

**Pointer** (Cursor)
Every shape the mouse pointer takes — and the real name of each one.

**Alert**
The small centered window with a badged icon, a bold line, and Cancel/OK buttons.

**Slider**
The round knob you drag along a track to pick a value from a range.

**Color Well**
The little swatch button that shows the current color and opens the picker.

**Mac Window**
The movable Mac app frame, from its title bar and toolbar to its resize edges.

**Split View**
Resizable panes separated by a draggable divider inside a Mac window.

**Scroll View** (Scroller)
A viewport whose AppKit scrollbar is called a scroller.

**Search Field**
A Mac text field with built-in search, clearing, and recent-query controls.

**Save Panel**
The standard Mac dialog for naming a file and choosing where to save it.

**Token Field**
A text input that turns recognized values into removable rounded tokens.

**Combo Button**
A primary action joined to a separate arrow that opens related actions.

**Level Indicator**
A Mac gauge rendered as a capacity bar, rating stars, or relevance meter.

**Column View** (Browser)
Finder-style columns that reveal each successive level of a hierarchy.

**Outline View**
An indented tree of rows that expand to reveal nested children.

**Menu Bar**
The strip along the top of the Mac screen — every part, labeled.

**Context Menu**
The menu opened at the pointer by right-clicking or Control-clicking an item.

**Disclosure Triangle**
The small rotating control that reveals or hides nested content.

**Dock Badge**
The red count or status label overlaid on an app's Dock icon.

**Focus Ring**
The accent-colored glow that identifies the control receiving keyboard input.

**Inspector**
The right-hand panel for viewing and editing details of the current selection.

**Panel** (Floating Window / HUD)
An auxiliary macOS window that floats above related document windows.

**Popover**
A floating bubble whose arrow points back to the control that opened it.

**Pop-Up Button vs. Pull-Down Button vs. Combo Box**
Three similar-looking macOS controls for choosing a value or invoking a menu action. Pop-Up = shows current selection. Pull-Down = title stays fixed, triggers action. Combo Box = editable text + list.

**Segmented Control**
A row of connected choices with the current segment visibly selected.

**Sheet**
A modal panel attached to one macOS window rather than the whole app.

**Sidebar** (Source List)
The translucent navigation column along the left edge of a macOS window.

**Stepper**
The compact up-and-down arrow pair used to increment or decrement a value.

**Toolbar** (Unified Title Bar)
A row of window actions integrated with the modern macOS title bar.

**Traffic Lights** (Window Controls)
The red, yellow, and green controls at the top-left of a macOS window.

**Visual Effect Material** (Vibrancy)
The adaptive translucent background used behind macOS sidebars, menus, and panels.

**Menu Bar Extra** (Status Item)
The icon that lives on the right side of the macOS menu bar.
