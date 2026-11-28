# Weavero

The words used for how Weavero attaches itself to Zotero's windows and how it takes itself off again. Decisions behind them: [docs/adr/](docs/adr/).

## Language

### Window wiring

**Wiring entry**:
One named step that attaches part of Weavero to one Zotero window, in a fixed order among the other steps; a main window and a standalone reader window each have their own list of them.
_Avoid_: hook, patch, setup step

**Wire**:
To run a **wiring entry** on one window, so that what it adds is there and acting; wiring a window that already has it changes nothing.
_Avoid_: install, attach, set up

**Unwire**:
To take off one window everything a **wiring entry** added there, leaving that window as Zotero made it; the counterpart of **wire**, run when the window closes and when Weavero is disabled or reloaded.
_Avoid_: teardown, cleanup, unpatch

**Layer**:
One named contribution to a Zotero function that several **wiring entries** or features may change at once; each layer can be added or removed alone, and the others stay.
_Avoid_: wrapper, monkey-patch

### Scope

**Per-window**:
Belonging to one window: added when that window is **wired**, gone when it is **unwired**, with no effect on the other windows.

**Plugin-wide**:
Belonging to Weavero as a whole rather than to any window (a setting watched, a menu registered with Zotero, something shared by every window); taken off once, when Weavero stops.
_Avoid_: global (in this sense)

**Dies with its window**:
Said of a **wiring entry** that leaves nothing to **unwire**: what it does ends by itself, and is inert once Weavero is gone (each such entry says why).
