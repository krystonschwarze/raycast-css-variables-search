# CSS Variables Searcher

Raycast-Erweiterung zum Suchen und Kopieren von CSS-Variablen.

## Installation

1. Repository klonen oder in Raycast installieren
2. In den Raycast-Einstellungen den Pfad zu deiner CSS-Datei angeben (oder eine URL)

## Verwendung

Öffne Raycast und starte "CSS Variables Searcher". Die Erweiterung lädt automatisch deine CSS-Datei und zeigt alle `--variablen` an.

### Suche

Du kannst nach Variablennamen oder Werten suchen. Mehrere Suchbegriffe mit Leerzeichen getrennt funktionieren auch – alle Begriffe müssen gefunden werden (AND-Logik).

Beispiele:
- `primary` findet alle Variablen mit "primary" im Namen oder Wert
- `foreground primary` findet Variablen, die beide Begriffe enthalten
- `enc color` findet Variablen mit "enc" und "color"

### Kategorien

Wenn du ein Präfix in den Einstellungen angibst (z.B. `--enc-`), werden Variablen automatisch in Kategorien gruppiert. Das Dropdown oben rechts filtert nach diesen Kategorien.

Beispiel: `--enc-background-primary` wird zur Kategorie "Background", `--enc-color-primary` zu "Color".

### Kopieren

- **Enter**: Kopiert den Variablennamen (z.B. `--primary-color`)
- **Shift+Enter**: Kopiert mit `var()` Format (z.B. `var(--primary-color)`)
- **Cmd+Shift+Enter**: Kopiert den Wert (z.B. `#336699`)

### Farbvorschau

Wenn eine Variable einen Farbwert enthält (hex, rgb, hsl, etc.), wird ein farbiger Kreis als Icon angezeigt. Das kannst du in den Einstellungen deaktivieren.

## Konfiguration

**CSS File Path**: Pfad zu einer lokalen CSS-Datei  
**CSS File URL**: URL zu einer gehosteten CSS-Datei  
**Show Color Preview**: Farbvorschau ein/aus  
**Filter Prefix**: Präfix für Kategorisierung (z.B. `--enc-`, `--theme-`)

Lokale Dateien haben Vorrang vor URLs. Wenn beide gesetzt sind, wird die lokale Datei verwendet.

## Beispiel CSS

```css
:root {
  --primary-color: #336699;
  --font-size-base: 1rem;
  
  /* Mit Präfix für Kategorisierung */
  --enc-background-primary: #ffffff;
  --enc-color-primary: #336699;
  --enc-spacing-small: 0.5rem;
}
```

## Entwicklung

```bash
npm install
npm run dev
npm run build
```
