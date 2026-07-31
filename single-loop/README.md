# Single-Loop FBH Solver

Rust/WASM-Solver für genau einen Fußbodenheizkreis in einem beliebigen einfachen
Polygon, mit TypeScript/Vite-Oberfläche. Alle Maße in Millimetern, Referenz ist
die Rohrmittellinie (16-mm-Rohr, Mindestbiegeradius 80 mm).

## Entwicklung

```bash
cd single-loop
npm install
npm run dev
```

- `http://localhost:5173/` — Polygoneditor und Heizkreis-Solver.
- `http://localhost:5173/plate.html` — BEKOTEC-Noppenmodell-Diagnose.

## BEKOTEC-Noppenmodell-Diagnoseseite

`plate.html` validiert ausschließlich das Verlege-Substrat der Platte
`BEKOTEC_EN_23_FI_30_16`: 75-mm-Raster, Schachbrett aus großen und kleinen
Noppen, acht 45-Grad-Richtungen, zertifizierte Bewegungs-Templates und der
daraus eingebettete Pose-Graph mit angenommenen und verworfenen Kanten.

**Diese Seite erzeugt keinen Heizkreis.** Sie zeigt nur das Modell, auf dem der
spätere Loop-Planer arbeitet. Raumform (Rechteck, L, U, C), Anschlusskante,
Plattenphase in `[0,75)²` und Wandabstand sind einstellbar; jede SVG-Ebene ist
einzeln zuschaltbar.

## Prüfungen

```bash
cargo test --release --manifest-path solver/Cargo.toml
cargo clippy --manifest-path solver/Cargo.toml --all-targets -- -D warnings
npm test
npm run typecheck
npm run build
```

Die Golden-Fixtures unter `fixtures/plate/` stammen aus dem
Schlüter-BEKOTEC-THERM-Handbuch 2025/2026 (Seite 39 „Verlegung des Heizrohrs",
Seite 119 BEKOTEC-THERM-HR): breite 90-Grad- und Tropfenkehren sind zulässig,
enge Ein-Noppen-Wendungen werden mit `BEND_RADIUS_TOO_SMALL` verworfen.
`solver/tests/plate_golden.rs` zertifiziert jede Fixture gegen das
unabhängige Template-Zertifikat und den kanonischen Katalog.
