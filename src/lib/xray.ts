// Objects handed to CONTENT code -- a reader's iframe window, a note
// editor's, a snapshot's -- must be cloned into that global first, or the
// content side sees an opaque Xray wrapper it cannot read (survey
// 2026-10-06 §4 #7: 44 `cloneInto` sites in four spellings --
// `Components.utils.cloneInto`, `(Components as any).utils.cloneInto`, a
// local `Cu`, `Cu0`, `Cu2` -- behind five different fallbacks).

/** `Cu.cloneInto(obj, target)`: a copy the content global `target` can
 *  read. `options` as Cu's (`{ cloneFunctions: true }` for callbacks). With
 *  no Cu or no target, and when the clone itself fails, the object comes
 *  back as it is -- the call stays total, the content side then reads what
 *  it can (the fallback every site that had one used). */
export function wvCloneFor(obj: any, target: any, options?: any): any {
    try {
        const Cu: any = (Components as any).utils;
        if (!Cu || !target) return obj;
        return options ? Cu.cloneInto(obj, target, options) : Cu.cloneInto(obj, target);
    }
    catch (e) {
        return obj;
    }
}
