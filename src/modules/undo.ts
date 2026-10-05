// Weavero -- undo / redo engine (MJT 2026-09-29: "add undo support for all
// the Weavero actions", starting with outline entries).
//
// One history per SCOPE -- a surface plus its identity, e.g.
// "outline:<libraryID>:<itemKey>" -- kept in memory for this Zotero run
// (intake 2026-09-29: per surface, this run only). A step is DATA,
// {label, type, data}: undoing moves it to the redo stack, a new action
// clears the redo stack (the usual editor rule), each stack caps at
// Zotero's own `undoHistory.steps`. The stacks live on the Zotero object,
// not on the plugin instance, and the handler for a step's `type` is
// resolved from the LIVE plugin when the step runs -- so the history
// survives a plugin reload / hot update the way the reader's own annotation
// history does (MJT 2026-09-30: "Why not the same for the outline undo
// history?"). A step whose type the running build no longer knows is
// dropped with a log. Zotero restart clears everything, as for Zotero's.
//
// Slice 2 (MJT 2026-10-01): BATCHES (one gesture = one step, even when it
// writes several times), LINKED GROUPS (a gesture that writes two stores,
// e.g. a bookmark moved between the document and the library, records one
// step per scope sharing a groupId; undoing one undoes its twins), and
// SELECTIVE undo / redo (a step below the top can be run alone when it is
// INDEPENDENT of every step above it -- no entry id in common; the step is
// then moved to the top and run, Berlage 1994 / Azurite: "the reverse
// operation applied in the current context"; a step whose type exposes no
// ids is never independent).
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

declare const Zotero: any;

export const WV_UNDO_CAP = 100;

/** The cap Zotero's own history uses (`undoHistory.steps`, 100 by default,
 *  0 disables undo altogether): one setting governs both histories (MJT
 *  2026-09-30). Falls back to WV_UNDO_CAP when the pref is unreadable. */
export function wvUndoCap(): number {
    try {
        const v = Zotero.Prefs.get("undoHistory.steps");
        return Number.isInteger(v) ? v : WV_UNDO_CAP;
    } catch (e) { return WV_UNDO_CAP; }
}

/** Opt a Zotero DATA write into Zotero's own undo history (10.0+): call
 *  inside the `executeTransaction` that saves the objects, with one of
 *  Zotero's `undo-action-*` Fluent ids (zotero.ftl). Zotero's history
 *  then undoes it from Edit > Undo in the main window exactly like its own
 *  edits (slice 2, 2026-10-01: Weavero's related-item and annotation-
 *  comment writes). A Zotero without UndoHistory (9.x) ignores it. */
export function wvStageNativeUndo(action: string, args?: any) {
    try {
        const UH = Zotero.UndoHistory;
        if (UH && typeof UH.stageAction === "function") UH.stageAction(action, args);
    } catch (e) { Zotero.debug("[Weavero] wvStageNativeUndo err: " + e); }
}

export interface WvUndoStep {
    /** "Add Outline Entry", "Delete 2 Outline Entries" -- shown as "Undo <label>". */
    label: string;
    /** Handler key, e.g. "outline.delete"; registered by the surface that owns it. */
    type: string;
    /** Plain data the handlers need (deep-copyable; never a closure or a DOM node). */
    data?: any;
    /** Engine-stamped unique id (for the history list and selective runs). */
    id?: string;
    /** When the step last landed on the undo stack (push, or redo) -- the
     *  engine stamps it; "most recent action wins" decisions read it. */
    at?: number;
    /** When the step was last undone (moved to the redo stack). */
    undoneAt?: number;
    /** Steps of one gesture across several scopes share this (linked twins). */
    groupId?: string;
}

export interface WvUndoHandlers {
    undo: (this: any, data: any) => Promise<void> | void;
    redo: (this: any, data: any) => Promise<void> | void;
    /** The entry ids a step touches -- the independence test for selective
     *  undo. A type without it can only be run from the top. */
    ids?: (data: any) => string[];
}

interface WvUndoScopeState { undo: WvUndoStep[]; redo: WvUndoStep[]; busy: boolean }

export interface WvUndoListRow {
    id: string; label: string; type: string; at: number; groupId: string | null;
    /** Can be run alone from where it sits (top, or independent of everything above). */
    independent: boolean;
    /** Steps between it and the top (0 = the top). */
    depth: number;
}

class _UndoMixin {
    [k: string]: any;

    /** The stacks, on the Zotero object so they outlive the plugin instance. */
    _wvUndoStacks(): Map<string, WvUndoScopeState> {
        return Zotero._wvUndoState || (Zotero._wvUndoState = new Map());
    }

    _wvUndoScopeState(scope: string): WvUndoScopeState {
        const m = this._wvUndoStacks();
        let s = m.get(scope);
        if (!s) { s = { undo: [], redo: [], busy: false }; m.set(scope, s); }
        return s;
    }

    /** Handlers by step type, on THIS instance (a reload re-registers). */
    _wvUndoRegisterType(type: string, handlers: WvUndoHandlers) {
        if (!type || !handlers || typeof handlers.undo !== "function" || typeof handlers.redo !== "function") return;
        const map = this._wvUndoTypeMap || (this._wvUndoTypeMap = {});
        map[type] = handlers;
    }

    _wvUndoHandlersFor(type: string): WvUndoHandlers | null {
        let map = this._wvUndoTypeMap;
        if (!map || !map[type]) {
            // Surfaces register lazily through _wvUndoRegisterAll (each
            // module contributes its types there).
            try { if (typeof this._wvUndoRegisterAll === "function") this._wvUndoRegisterAll(); } catch (e) {}
            map = this._wvUndoTypeMap;
        }
        return (map && map[type]) || null;
    }

    _wvUndoNextId(): string {
        const n = (Zotero._wvUndoSeq = (Zotero._wvUndoSeq || 0) + 1);
        return "u" + n.toString(36);
    }

    // ---- Batches and linked groups ------------------------------------------

    /** Run `fn` as ONE gesture: stores that record at their write choke point
     *  (bookmarks) defer their capture to the end of the batch, so a gesture
     *  that writes several times -- delete three rows, move a bookmark
     *  between two stores -- records one step per scope, and the steps share
     *  a groupId (linked twins). Nests; only the outermost end flushes. */
    async _wvUndoBatch<T>(fn: () => Promise<T> | T): Promise<T> {
        // A COUNTER, decremented on exit -- never "restore the depth seen on
        // entry": two OVERLAPPING gestures (two fast Deletes whose writes
        // queue) then put back each other's stale depth and left it stuck
        // above 0, which silently stopped every later bookmark capture
        // (pre-release review 2026-10-05). Overlapping gestures share one
        // group and flush once, when the last one ends.
        if (!(this._wvUndoBatchDepth > 0)) {
            this._wvUndoBatchDepth = 0;
            this._wvUndoBatchGroup = "g" + this._wvUndoNextId();
            this._wvUndoBatchFlushers = [];
        }
        this._wvUndoBatchDepth++;
        try { return await fn(); }
        finally {
            this._wvUndoBatchDepth = Math.max(0, (this._wvUndoBatchDepth || 1) - 1);
            if (!this._wvUndoBatchDepth) {
                const fl: Array<() => any> = this._wvUndoBatchFlushers || [];
                this._wvUndoBatchFlushers = null;
                try { for (const f of fl) { try { await f(); } catch (e) { Zotero.debug("[Weavero] undo batch flush err: " + e); } } }
                finally { this._wvUndoBatchGroup = null; }
            }
        }
    }

    _wvUndoInBatch(): boolean { return (this._wvUndoBatchDepth || 0) > 0; }

    /** Register a flusher for the current batch, once per key. */
    _wvUndoOnBatchEnd(key: string, fn: () => any) {
        if (!this._wvUndoInBatch() || !this._wvUndoBatchFlushers) return;
        const tagged = fn as any;
        if (this._wvUndoBatchFlushers.some((f: any) => f._wvKey === key)) return;
        tagged._wvKey = key;
        this._wvUndoBatchFlushers.push(tagged);
    }

    // ---- Recording ------------------------------------------------------------

    /** Record a COMPLETED action. Clears the scope's redo stack. A cap of 0
     *  (Zotero's "undo off") records nothing. Closures are refused: a step
     *  must be replayable by a later build. Inside a batch the step carries
     *  the batch's groupId. */
    _wvUndoPush(scope: string, step: WvUndoStep) {
        try {
            if (!scope || !step || typeof step.type !== "string" || !step.type || typeof step.label !== "string") return;
            const cap = wvUndoCap();
            if (cap <= 0) return;
            const s = this._wvUndoScopeState(scope);
            const rec: WvUndoStep = { id: this._wvUndoNextId(), label: step.label, type: step.type, data: step.data, at: Date.now() };
            const g = step.groupId || this._wvUndoBatchGroup;
            if (g) rec.groupId = g;
            s.undo.push(rec);
            s.redo.length = 0;
            (s as any).gen = ((s as any).gen || 0) + 1;
            if (s.undo.length > cap) s.undo.splice(0, s.undo.length - cap);
            this._wvUndoNotifyChange();
        } catch (e) { Zotero.debug("[Weavero] _wvUndoPush err: " + e); }
    }

    /** Surfaces that mirror the histories (the reader toolbar's Undo / Redo
     *  buttons) hook `_wvUndoAfterChange`; called after every push and run. */
    _wvUndoNotifyChange() {
        try { if (typeof this._wvUndoAfterChange === "function") this._wvUndoAfterChange(); } catch (_) {}
    }

    /** The labels a menu shows: {undo: "Add Outline Entry"|null, redo: ...|null}. */
    _wvUndoPeek(scope: string): { undo: string | null; redo: string | null } {
        const s = this._wvUndoStacks().get(scope);
        return {
            undo: s && s.undo.length ? s.undo[s.undo.length - 1].label : null,
            redo: s && s.redo.length ? s.redo[s.redo.length - 1].label : null,
        };
    }

    /** The top step of a scope's undo or redo stack, with its stamps. */
    _wvUndoTop(scope: string, dir: "undo" | "redo"): WvUndoStep | null {
        const s = this._wvUndoStacks().get(scope);
        const st = s && (dir === "undo" ? s.undo : s.redo);
        return st && st.length ? st[st.length - 1] : null;
    }

    _wvUndoStepIds(step: WvUndoStep): string[] | null {
        try {
            const h = this._wvUndoHandlersFor(step.type);
            if (!h || typeof h.ids !== "function") return null;
            const ids = h.ids(step.data);
            return Array.isArray(ids) ? ids.map(String) : null;
        } catch (_) { return null; }
    }

    /** Whether the step at `index` of a stack can run alone from there: it is
     *  the top, or no step above it touches any of its entry ids. */
    _wvUndoIndependentAt(stack: WvUndoStep[], index: number): boolean {
        if (index < 0 || index >= stack.length) return false;
        if (index === stack.length - 1) return true;
        const mine = this._wvUndoStepIds(stack[index]);
        if (!mine) return false;
        const set = new Set(mine);
        for (let j = index + 1; j < stack.length; j++) {
            const other = this._wvUndoStepIds(stack[j]);
            if (!other) return false;
            if (other.some(id => set.has(id))) return false;
        }
        return true;
    }

    /** The steps ABOVE a step in its undo stack that must be undone before
     *  it can be: every later step that touched one of its entries, and
     *  transitively theirs (newest last). A later step whose type exposes no
     *  ids blocks everything from there up, so all of those are required.
     *  null when the step is not in the stack. (Multi-select undo, MJT
     *  2026-10-01: "automatically tick the ones that must be cancelled
     *  together".) */
    _wvUndoRequiredAbove(scope: string, stepId: string, dir: "undo" | "redo" = "undo"): string[] | null {
        const s = this._wvUndoStacks().get(scope);
        const st = s ? (dir === "undo" ? s.undo : s.redo) : [];
        const i = st.findIndex(x => x.id === stepId);
        if (i < 0) return null;
        const req: string[] = [];
        const mine = this._wvUndoStepIds(st[i]);
        if (!mine) { for (let k = i + 1; k < st.length; k++) req.push(st[k].id!); return req; }
        const needed = new Set<string>(mine);
        for (let j = i + 1; j < st.length; j++) {
            const o = this._wvUndoStepIds(st[j]);
            if (!o) { for (let k = j; k < st.length; k++) req.push(st[k].id!); break; }
            if (o.some(x => needed.has(x))) { req.push(st[j].id!); for (const x of o) needed.add(x); }
        }
        return req;
    }

    /** The linked twins of a step (same groupId) on other scopes' stacks. */
    _wvUndoTwinsOf(scope: string, stepId: string, dir: "undo" | "redo" = "undo"): Array<{ scope: string; stepId: string }> {
        const out: Array<{ scope: string; stepId: string }> = [];
        const s = this._wvUndoStacks().get(scope);
        const step = s && (dir === "undo" ? s.undo : s.redo).find(x => x.id === stepId);
        if (!step || !step.groupId) return out;
        for (const [sc, st] of this._wvUndoStacks()) {
            if (sc === scope) continue;
            for (const x of (dir === "undo" ? st.undo : st.redo)) if (x.groupId === step.groupId && x.id) out.push({ scope: sc, stepId: x.id });
        }
        return out;
    }

    /** The history list for a menu: the undo or redo stack, newest first,
     *  each row saying whether it can be run alone from where it sits. */
    _wvUndoList(scope: string, dir: "undo" | "redo"): WvUndoListRow[] {
        const s = this._wvUndoStacks().get(scope);
        const st = s ? (dir === "undo" ? s.undo : s.redo) : [];
        const out: WvUndoListRow[] = [];
        for (let i = st.length - 1; i >= 0; i--) {
            const step = st[i];
            out.push({
                id: step.id || ("i" + i), label: step.label, type: step.type,
                at: (dir === "undo" ? step.at : step.undoneAt) || 0,
                groupId: step.groupId || null,
                independent: this._wvUndoIndependentAt(st, i),
                depth: st.length - 1 - i,
            });
        }
        return out;
    }

    // ---- Running --------------------------------------------------------------

    /** Undo / redo the scope's last step; resolves to its label, or null when
     *  there was nothing to do (or a step is already running -- re-entrant
     *  calls are ignored). A step that throws, or whose type is unknown to
     *  this build, is DROPPED, not retried: the store it targets may have
     *  moved on, and a stuck step would block the whole history. */
    _wvUndo(scope: string): Promise<string | null> { return this._wvUndoRun(scope, "undo"); }
    _wvRedo(scope: string): Promise<string | null> { return this._wvUndoRun(scope, "redo"); }

    _wvUndoRun(scope: string, dir: "undo" | "redo"): Promise<string | null> {
        const s = this._wvUndoStacks().get(scope);
        const from = s && (dir === "undo" ? s.undo : s.redo);
        if (!from || !from.length) return Promise.resolve(null);
        return this._wvUndoRunAt(scope, dir, from.length - 1);
    }

    /** Run ONE step of a scope by its id, from wherever it sits: the top, or
     *  an independent step below it (selective). Null when it is neither. */
    _wvUndoRunStep(scope: string, dir: "undo" | "redo", stepId: string): Promise<string | null> {
        const s = this._wvUndoStacks().get(scope);
        const from = s && (dir === "undo" ? s.undo : s.redo);
        if (!from) return Promise.resolve(null);
        const i = from.findIndex(x => x.id === stepId);
        if (i < 0 || !this._wvUndoIndependentAt(from, i)) return Promise.resolve(null);
        return this._wvUndoRunAt(scope, dir, i);
    }

    /** The core: take the step at `index` out of the from-stack, run its
     *  handler, stamp it, push it onto the to-stack; then its linked twins
     *  in other scopes (each from its own top, or selectively when
     *  independent -- a twin that is neither stays where it is, logged). */
    async _wvUndoRunAt(scope: string, dir: "undo" | "redo", index: number, opts?: { noGroup?: boolean }): Promise<string | null> {
        const s = this._wvUndoStacks().get(scope);
        if (!s || s.busy) return null;
        const from = dir === "undo" ? s.undo : s.redo;
        const to = dir === "undo" ? s.redo : s.undo;
        if (index < 0 || index >= from.length) return null;
        const step = from.splice(index, 1)[0];
        if (!step) return null;
        const h = this._wvUndoHandlersFor(step.type);
        if (!h) { Zotero.debug("[Weavero] " + dir + " '" + step.label + "': no handler for type " + step.type + ", step dropped"); return null; }
        s.busy = true;
        let label: string | null = null;
        const gen0 = (s as any).gen || 0;
        try {
            await (dir === "undo" ? h.undo.call(this, step.data) : h.redo.call(this, step.data));
            if (dir === "undo") step.undoneAt = Date.now(); else step.at = Date.now();
            // A new action recorded in this scope WHILE the step ran cleared
            // the redo stack; an undone step landing there afterwards would
            // be redone on top of that newer action (pre-release review
            // 2026-10-05). The new action wins: the undone step is dropped.
            if (dir === "undo" && ((s as any).gen || 0) !== gen0) Zotero.debug("[Weavero] undo '" + step.label + "': a newer action came in meanwhile, not kept for redo");
            else to.push(step);
            label = step.label;
        } catch (e) {
            Zotero.debug("[Weavero] " + dir + " '" + step.label + "' failed, step dropped: " + e);
            return null;
        } finally { s.busy = false; }
        if (step.groupId && !(opts && opts.noGroup)) await this._wvUndoRunTwins(scope, dir, step.groupId);
        this._wvUndoNotifyChange();
        return label;
    }

    /** The other scopes' steps of a linked group: run each from its top, or
     *  selectively when independent of what sits above it. */
    async _wvUndoRunTwins(scope: string, dir: "undo" | "redo", groupId: string) {
        for (const [sc, st] of this._wvUndoStacks()) {
            if (sc === scope) continue;
            const from = dir === "undo" ? st.undo : st.redo;
            const i = from.findIndex(x => x.groupId === groupId);
            if (i < 0) continue;
            if (!this._wvUndoIndependentAt(from, i)) {
                Zotero.debug("[Weavero] " + dir + ": linked step '" + from[i].label + "' in " + sc + " is covered by later steps, left in place");
                continue;
            }
            await this._wvUndoRunAt(sc, dir, i, { noGroup: true });
        }
    }

    /** Forget one scope's history, or all of it. */
    _wvUndoClear(scope?: string) {
        if (scope) this._wvUndoStacks().delete(scope);
        else this._wvUndoStacks().clear();
    }
}

const _undoDescriptors = Object.getOwnPropertyDescriptors(_UndoMixin.prototype);
delete (_undoDescriptors as any).constructor;
export const undoMethods = _undoDescriptors;
