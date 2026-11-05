# Fuel realization evidence from photographs

The user confirmed that photographs attached to a fuel quantity are uploaded when that load occurs. A read-only UI audit found separate dates within the same form and a later response edit timestamp. Therefore whole-form approval/edit/import dates cannot substitute for per-row photo dates.

## Integration prerequisite

The existing synchronization reads tabular exports, which currently do not preserve the original attachment timestamps. Before deriving dates, verify access and the real response contract from the server that already holds the integration credential. Do not extract browser cookies, copy tokens into reports, hardcode operational examples, or assign a guessed date.

Official reference: [Sytex form answers and associated files](https://sytex.slite.page/p/pHuZN39b9teTlw/Respuestas-de-formularios). It documents GET `/api/urformanswer/` with code/index filters and GET `/api/answerfile/` for associated files. Endpoint existence does not prove that the installed credential has access.

`GET /api/operations/fuel-photo-source?form=...&index=...` is a bounded, read-only capability check restricted to active global Admin accounts and forms already known to FNET. It returns response structure/types only, never original values, credentials, file URLs or photo/person/location data. It rejects unexpected Sytex destinations, redirects and malformed references; requests time out and access is limited to one check per 30 seconds per process. It does not write database records or modify Sytex.

The first stage does **not** apply dates. Automatic derivation remains unverified until real attachment fields and access are established. The final reader must bind photos to their original quantity row, retain date provenance, preserve explicit physical load dates and treat photos spanning different days as ambiguous. Photo-derived dates must invalidate stale OK source hashes through the existing review mechanism; no OK may be created automatically.

Local prerequisite validation: 650 tests in 92 files; no new migration, no business-data test writes, no FIFO changes. Production capability evidence and any final date-reader implementation must be recorded separately before declaring the user-visible correction complete.
