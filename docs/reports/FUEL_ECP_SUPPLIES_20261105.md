# ECP fuel declared in used supplies

## Cause and correction

Civil ECP forms may declare diesel under repeated `Insumos utilizados` rows instead of a tank-load quantity question. Those rows were already synchronized into `sytex_supply_import_items` but were absent from the fuel overview.

The overview now reads the newest supply import per form and keeps each positive diesel/gasoil row as a separate event, with its original form/group/index identity. Only forms whose catalog description identifies ECP and whose site is unambiguous qualify. Server-side project scope remains enforced before review history is loaded.

These events are explicitly labeled **Insumo declarado ECP**. They describe reported consumption, not independently verified tank fills. Machine numbers in descriptions remain literal source text; tank readings and hourmeters are not inferred. Nafta, 2T oil, mower parts, containers and expressly purchased/requested items are excluded from this fallback. Legacy supply rows without the synchronized identity are not inferred.

The date is the explicit FO realization start when available; otherwise it remains unknown. Approval, import and edit dates are never substituted. Undated rows are visible with all dates selected. One ECP can contain several supply rows without proof of several different physical load dates.

Structured tank evidence and ECP supply evidence for the same form/site are both retained and flagged as a possible duplicate. Totals are provisional in that case; no OK is created automatically. Existing source identities and reviews are unchanged. A failure reading the synchronized supply source fails the request rather than silently claiming completeness.

## Validation

- Local: `npm test`: **639/639**, 90 files (published baseline 630; nine added regression cases).
- `npm run lint`: zero errors, four preexisting warnings.
- `npm run build -- --webpack`: successful (local alternative to the known Turbopack environment issue).
- `npx tsc --noEmit`: successful after build.
- Tests use synthetic data and an invalid database endpoint; SQL tests use disposable PGlite only.
- Source diagnosis used a forced read-only connection. No actual load was marked OK as a test.
- No migrations, schema changes, upstream Sytex edits or n8n changes. Paused FIFO work is excluded in a separate checkout.

## Limits

This covers synchronized ECP supplies with usable identities, quantities and a single known site. It does not certify complete historical coverage of Sytex or infer missing realization dates. Release and authenticated production verification remain required before declaring the fix deployed.
