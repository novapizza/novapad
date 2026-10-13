# Decision Record: Large JSON (record viewer for files ≥ 50 MB)

Origin: a user opened a 1 GB file and got `Failed to open: Cannot create a string longer than
0x1fffffe8 characters`. `0x1fffffe8` = 536,870,888 is V8's maximum string length, hit inside
`iconv.decode` in [`fileHandlers.ts`](../../../../src/main/ipc/fileHandlers.ts). There was no
size guard anywhere in the open path.

## Decisions (owner: Linh, SA)

1. **Two paths, not one.** Files below the threshold keep the existing Monaco path untouched.
   Above it, a new record-based path never materialises the file as a string. *Why:* the small
   path is good and heavily tested; bolting compromises onto it would degrade the common case.

2. **JSON first, array-of-records shape.** The 1 GB files in practice are `[ {...}, {...} ]`
   or NDJSON. *Why:* a depth-1 boundary index makes JSON as cheap as CSV. A deep single object
   would need a hierarchical index and a WASM tokenizer; explicitly out of scope for v1 and the
   viewer refuses such files with a clear message.

3. **Target 1 GB, not 10 GB.** *Why:* at 1 GB a plain-JS tokenizer, a non-progressive index
   (2–3 s), and a synchronous-feeling save (1–2 s) are all acceptable; the 10 GB hardening
   (WASM, index cache, job UI) can be layered on later without redesign.

4. **Editable from day one.** Edits are per-record replacements held in an in-memory overlay;
   the file on disk is the immutable base. Save streams base + overlay to a temp file and
   renames. *Why:* the user explicitly wants "same as small file"; per-record editing gives that
   without an editable virtual text buffer (Monaco cannot be backed by a file). Record insertion
   is deferred to v2; edit + delete cover the realistic use.

5. **Editing UI = Monaco on one record.** Records are small, so a record opens in a mini Monaco
   editor; Apply validates with `JSON.parse` and writes the overlay. *Why:* full editing power
   (add keys, reorder) with familiar UX, far less work than inline leaf editing in the tree.

6. **Mighty JSON tabs in v1: Format tree + Extract.** Diff and Unescape have no large-file
   meaning. TS / Schema / Repair / Diagram are v2 (sample-based or streaming).

7. **Threshold 50 MB for `.json/.ndjson/.jsonl`, hard cap 256 MB for everything else.** *Why:*
   the FormatTab already records 18 MB taking ~3 s to parse; 50–500 MB is where real users hurt
   today. Non-JSON files above 256 MB get a friendly refusal instead of the V8 error.

8. **Side fix: `magikaSample` aliasing.** `new Uint8Array(raw.buffer, off, 16384)` is a view;
   structured clone ships the *entire* backing ArrayBuffer over IPC on every read and write.
   Copy the slice instead.
