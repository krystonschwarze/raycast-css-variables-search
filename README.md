# CSS Variables Searcher

Eine Raycast-Erweiterung zum Durchsuchen und Kopieren von CSS-Variablen aus Ihren CSS-Dateien.

## Features

- 🔍 **Erweiterte Suche**: Finden Sie CSS-Variablen mit mehreren Suchbegriffen (z.B. "foreground primary", "background color")
- 📋 **Flexibles Kopieren**: Kopieren Sie Variablenwerte, -namen oder var() Format
- 🎨 **Farbvorschau**: Farbige Kreise zeigen CSS-Farbwerte visuell an
- 🏷️ **Konfigurierbare Filterung**: Präfix-basierte Kategorisierung und Filterung von CSS-Variablen
- ⚡ **Performance**: Intelligentes Caching für schnelle Ladezeiten
- 🛠️ **Konfigurierbar**: Wählen Sie Ihre CSS-Datei oder URL in den Raycast-Einstellungen aus
- 🎯 **Benutzerfreundlich**: Intuitive Benutzeroberfläche mit Fehlerbehandlung

## Installation

1. Laden Sie die Erweiterung in Raycast herunter oder klonen Sie dieses Repository
2. Öffnen Sie die Raycast-Einstellungen
3. Navigieren Sie zu "CSS Variables Searcher" in den Erweiterungen
4. Konfigurieren Sie den Pfad zu Ihrer CSS-Datei im Feld "CSS File Path"

## Verwendung

1. Öffnen Sie Raycast (⌘ + Leertaste)
2. Tippen Sie "CSS Variables Searcher" oder verwenden Sie das Kürzel
3. Verwenden Sie das Dropdown, um nach Kategorien zu filtern (basierend auf Ihrem konfigurierten Präfix)
4. Durchsuchen Sie Ihre CSS-Variablen mit erweiterten Suchbegriffen:
   - **Einzelne Begriffe**: `primary`, `color`, `spacing`
   - **Mehrere Begriffe**: `foreground primary`, `background color`, `font size`
   - **Kombinierte Suche**: `sui color primary` (findet alle Variablen, die alle drei Begriffe enthalten)
5. Verwenden Sie die Tastenkombinationen oder Aktionen:
   - **Enter**: Kopiert den Variablennamen (z.B. `--primary-color`)
   - **Cmd+Enter**: Kopiert den Variablennamen mit var() Format (z.B. `var(--primary-color)`)
   - **Wert kopieren**: Kopiert den CSS-Variablenwert (z.B. `#336699`)
   - **Einstellungen öffnen**: Öffnet die Erweiterungseinstellungen
   - **Aktualisieren**: Lädt die CSS-Datei erneut

## Konfiguration

Die Erweiterung unterstützt zwei Quellen für CSS-Dateien:

### 1. Lokale Datei
Geben Sie den Pfad zu einer lokalen CSS-Datei an, die CSS-Variablen (Custom Properties) enthält.

### 2. Gehostete URL
Geben Sie eine URL zu einer gehosteten CSS-Datei an. Die Erweiterung lädt die Datei automatisch herunter.

**Hinweis**: Lokale Dateien haben Priorität über URLs. Wenn beide konfiguriert sind, wird die lokale Datei verwendet.

### Zusätzliche Einstellungen

- **Show Color Preview**: Aktivieren/deaktivieren Sie die farbigen Kreis-Icons für CSS-Farbwerte (Standard: aktiviert)
- **Filter Prefix**: Präfix für die Kategorisierung (z.B. `--sui-`, `--theme-`)

CSS-Variablen werden durch das `--` Präfix definiert:

```css
:root {
  --primary-color: #336699;
  --font-size-base: 1rem;
  --spacing-4: 1rem;
  
  /* Mit Präfix --sui- für Kategorisierung */
  --sui-background-primary: #ffffff;
  --sui-background-secondary: #f8f9fa;
  --sui-color-primary: #336699;
  --sui-color-secondary: #6c757d;
  --sui-spacing-small: 0.5rem;
  --sui-spacing-medium: 1rem;
  --sui-spacing-large: 1.5rem;
}
```

**Beispiel mit Präfix `--sui-`:**
- `--sui-background-primary` → Kategorie: "Background"
- `--sui-color-primary` → Kategorie: "Color"  
- `--sui-spacing-small` → Kategorie: "Spacing"

## Technische Details

- **Caching**: 
  - Lokale Dateien: Caching basierend auf Datei-Modifikationszeit
  - URLs: Einfaches Caching für bessere Performance
- **Fehlerbehandlung**: Umfassende Fehlerbehandlung mit benutzerfreundlichen Nachrichten
- **Performance**: Optimiert für große CSS-Dateien mit vielen Variablen
- **Kompatibilität**: Funktioniert mit allen CSS-Dateien, die CSS Custom Properties verwenden
- **URL-Unterstützung**: Automatisches Herunterladen und Parsen von gehosteten CSS-Dateien
- **Priorisierung**: Lokale Dateien haben Vorrang vor URLs
- **Farbvorschau**: Automatische Erkennung und visuelle Darstellung von CSS-Farbwerten
- **Flexible Kopier-Optionen**: Verschiedene Formate für das Kopieren von Variablen
- **Erweiterte Suchfunktion**: Mehrere Suchbegriffe mit Leerzeichen getrennt (AND-Logik)
- **Konfigurierbare Kategorisierung**: Präfix-basierte Kategorisierung von CSS-Variablen
- **Flexible Filterung**: Benutzerdefinierte Präfixe für maßgeschneiderte Kategorien
- **Kategorie-Filter**: Dropdown-Filter für bessere Organisation und Navigation

## Entwicklung

```bash
# Dependencies installieren
npm install

# Entwicklungsserver starten
npm run dev

# Build erstellen
npm run build

# Linting
npm run lint
```