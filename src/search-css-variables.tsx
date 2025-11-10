import {
  ActionPanel,
  List,
  Action,
  Icon,
  showToast,
  Toast,
  getPreferenceValues,
  openExtensionPreferences,
  Clipboard,
} from "@raycast/api";
import { useState, useEffect } from "react";
import * as fs from "fs";
import * as https from "https";
import * as http from "http";

interface CSSVariable {
  name: string;
  value: string;
  category?: string;
}

interface Preferences {
  cssFilePath: string;
  cssFileUrl: string;
  showColorPreview: boolean;
  filterPrefix: string;
}

interface CacheEntry {
  mtime: number;
  variables: CSSVariable[];
  isUrl?: boolean;
  url?: string;
}

// Einfacher Cache für die CSS-Variablen
const cssCache: Map<string, CacheEntry> = new Map();

// Hilfsfunktion um Kategorien basierend auf Präfix zu erkennen
const detectCategory = (variableName: string, filterPrefix: string): string => {
  if (!filterPrefix || filterPrefix.trim() === "") {
    return "Alle";
  }

  const prefix = filterPrefix.trim();

  // Prüfe ob der Variablenname mit dem Präfix beginnt
  if (variableName.startsWith(prefix)) {
    // Extrahiere den Teil nach dem Präfix
    const afterPrefix = variableName.substring(prefix.length);

    // Finde das erste Wort nach dem Präfix (bis zum ersten Bindestrich oder Ende)
    const firstWordMatch = afterPrefix.match(/^([a-zA-Z0-9]+)/);
    if (firstWordMatch) {
      const category = firstWordMatch[1];
      return category.charAt(0).toUpperCase() + category.slice(1);
    }
  }

  return "Andere";
};

// Hilfsfunktion um zu prüfen, ob ein Wert eine Farbe ist
const isColorValue = (value: string): boolean => {
  const trimmedValue = value.trim();

  // Hex-Farben (#fff, #ffffff)
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmedValue)) return true;

  // RGB/RGBA Farben
  if (/^rgba?\(/.test(trimmedValue)) return true;

  // HSL/HSLA Farben
  if (/^hsla?\(/.test(trimmedValue)) return true;

  // Named colors (nur grundlegende Farben)
  const namedColors = [
    "red",
    "green",
    "blue",
    "yellow",
    "orange",
    "purple",
    "pink",
    "brown",
    "black",
    "white",
    "gray",
    "grey",
    "transparent",
    "currentColor",
  ];
  if (namedColors.includes(trimmedValue.toLowerCase())) return true;

  // CSS-Variablen die auf Farben verweisen (Aliases)
  if (/^var\(--/.test(trimmedValue)) return true;

  return false;
};

// Hilfsfunktion um eine Farbe in einen Hex-Wert zu konvertieren
const colorToHex = (value: string, cssVariables?: CSSVariable[]): string => {
  const trimmedValue = value.trim();

  // CSS-Variablen-Alias (var(--variable-name))
  if (/^var\(--/.test(trimmedValue)) {
    const varMatch = trimmedValue.match(/var\(--([^)]+)\)/);
    if (varMatch && cssVariables) {
      const varName = `--${varMatch[1]}`;
      const referencedVar = cssVariables.find((v) => v.name === varName);
      if (referencedVar) {
        return colorToHex(referencedVar.value, cssVariables);
      }
    }
    return "#000000"; // Fallback für unbekannte Variablen
  }

  // Bereits Hex-Farbe
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmedValue)) {
    // 3-stellige Hex zu 6-stellig konvertieren
    if (trimmedValue.length === 4) {
      return `#${trimmedValue[1]}${trimmedValue[1]}${trimmedValue[2]}${trimmedValue[2]}${trimmedValue[3]}${trimmedValue[3]}`;
    }
    return trimmedValue.toLowerCase();
  }

  // RGB zu Hex
  const rgbMatch = trimmedValue.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]);
    const g = parseInt(rgbMatch[2]);
    const b = parseInt(rgbMatch[3]);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  // HSL zu Hex (vereinfacht)
  const hslMatch = trimmedValue.match(/^hsla?\((\d+),\s*(\d+)%,\s*(\d+)%/);
  if (hslMatch) {
    const h = parseInt(hslMatch[1]);
    const s = parseInt(hslMatch[2]);
    const l = parseInt(hslMatch[3]);
    // Vereinfachte HSL zu RGB Konvertierung
    const c = ((1 - Math.abs((2 * l) / 100 - 1)) * s) / 100;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l / 100 - c / 2;
    let r, g, b;

    if (h < 60) {
      r = c;
      g = x;
      b = 0;
    } else if (h < 120) {
      r = x;
      g = c;
      b = 0;
    } else if (h < 180) {
      r = 0;
      g = c;
      b = x;
    } else if (h < 240) {
      r = 0;
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      g = 0;
      b = c;
    } else {
      r = c;
      g = 0;
      b = x;
    }

    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);

    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  // Named colors zu Hex (nur grundlegende Farben)
  const colorMap: { [key: string]: string } = {
    red: "#ff0000",
    green: "#008000",
    blue: "#0000ff",
    yellow: "#ffff00",
    orange: "#ffa500",
    purple: "#800080",
    pink: "#ffc0cb",
    brown: "#a52a2a",
    black: "#000000",
    white: "#ffffff",
    gray: "#808080",
    grey: "#808080",
    transparent: "transparent",
    currentColor: "currentColor",
  };

  return colorMap[trimmedValue.toLowerCase()] || "#000000";
};

// Hilfsfunktion zum Laden von URLs
const fetchUrl = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    const client = isHttps ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers: {
        "User-Agent": "CSS Variables Searcher/1.0",
      },
    };

    const req = client.request(options, (res) => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve(data);
        });
      } else {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
      }
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    req.end();
  });
};

export default function Command() {
  const [cssVariables, setCssVariables] = useState<CSSVariable[]>([]);
  const [filteredVariables, setFilteredVariables] = useState<CSSVariable[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("Alle");
  const [searchText, setSearchText] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const preferences = getPreferenceValues<Preferences>();

  const parseCSSVariables = (cssContent: string): CSSVariable[] => {
    const variables: CSSVariable[] = [];

    // CSS-Variablen parsen
    const cssRegex = /(?:(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);?)/g;
    let match;

    while ((match = cssRegex.exec(cssContent)) !== null) {
      const name = match[1].trim();
      const value = match[2].trim();
      const category = detectCategory(name, preferences.filterPrefix);
      variables.push({ name, value, category });
    }

    return variables;
  };

  const loadCSSVariables = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Prüfe, ob mindestens eine Quelle konfiguriert ist
      if (!preferences.cssFilePath && !preferences.cssFileUrl) {
        throw new Error("Bitte konfigurieren Sie entweder einen CSS-Dateipfad oder eine CSS-URL in den Einstellungen");
      }

      // Priorisiere lokale Datei über URL
      const useLocalFile = preferences.cssFilePath && preferences.cssFilePath.trim() !== "";
      const useUrl = !useLocalFile && preferences.cssFileUrl && preferences.cssFileUrl.trim() !== "";

      if (useLocalFile) {
        await loadFromLocalFile();
      } else if (useUrl) {
        await loadFromUrl();
      } else {
        throw new Error("Bitte konfigurieren Sie entweder einen CSS-Dateipfad oder eine CSS-URL in den Einstellungen");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unbekannter Fehler";
      setError(errorMessage);

      await showToast({
        style: Toast.Style.Failure,
        title: "Fehler beim Laden der CSS-Datei",
        message: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadFromLocalFile = async () => {
    if (!preferences.cssFilePath) {
      throw new Error("CSS-Dateipfad ist nicht konfiguriert");
    }

    // Prüfe, ob der Pfad existiert
    if (!fs.existsSync(preferences.cssFilePath)) {
      throw new Error(`CSS-Datei nicht gefunden: ${preferences.cssFilePath}`);
    }

    // Prüfe Cache
    const stats = fs.statSync(preferences.cssFilePath);
    const cachedEntry = cssCache.get(preferences.cssFilePath);

    if (cachedEntry && cachedEntry.mtime === stats.mtime.getTime() && !cachedEntry.isUrl) {
      setCssVariables(cachedEntry.variables);
      return;
    }

    // Lese CSS-Datei
    const cssContent = fs.readFileSync(preferences.cssFilePath, "utf-8");
    const variables = parseCSSVariables(cssContent);

    // Aktualisiere Cache
    cssCache.set(preferences.cssFilePath, {
      mtime: stats.mtime.getTime(),
      variables: variables,
      isUrl: false,
    });

    setCssVariables(variables);

    if (variables.length === 0) {
      await showToast({
        style: Toast.Style.Animated,
        title: "Keine CSS-Variablen gefunden",
        message: "Die CSS-Datei enthält keine benutzerdefinierten Eigenschaften (--variablen)",
      });
    }
  };

  const loadFromUrl = async () => {
    if (!preferences.cssFileUrl) {
      throw new Error("CSS-URL ist nicht konfiguriert");
    }

    // Validiere URL
    try {
      new URL(preferences.cssFileUrl);
    } catch {
      throw new Error("Ungültige URL-Format");
    }

    // Prüfe Cache (für URLs verwenden wir einen einfachen Cache ohne mtime)
    const cachedEntry = cssCache.get(preferences.cssFileUrl);

    if (cachedEntry && cachedEntry.isUrl) {
      setCssVariables(cachedEntry.variables);
      return;
    }

    // Lade CSS von URL
    const cssContent = await fetchUrl(preferences.cssFileUrl);
    const variables = parseCSSVariables(cssContent);

    // Aktualisiere Cache
    cssCache.set(preferences.cssFileUrl, {
      mtime: Date.now(), // Für URLs verwenden wir aktuelle Zeit
      variables: variables,
      isUrl: true,
      url: preferences.cssFileUrl,
    });

    setCssVariables(variables);

    if (variables.length === 0) {
      await showToast({
        style: Toast.Style.Animated,
        title: "Keine CSS-Variablen gefunden",
        message: "Die CSS-Datei enthält keine benutzerdefinierten Eigenschaften (--variablen)",
      });
    }
  };

  const copyVariableName = async (variableName: string) => {
    try {
      await Clipboard.copy(variableName);
      await showToast({
        style: Toast.Style.Success,
        title: "Variablenname kopiert",
        message: variableName,
      });
    } catch {
      await showToast({
        style: Toast.Style.Failure,
        title: "Fehler beim Kopieren",
        message: "Konnte nicht in die Zwischenablage kopieren",
      });
    }
  };

  const copyVariableNameWithVar = async (variableName: string) => {
    try {
      const varFormat = `var(${variableName})`;
      await Clipboard.copy(varFormat);
      await showToast({
        style: Toast.Style.Success,
        title: "Variablenname mit var() kopiert",
        message: varFormat,
      });
    } catch {
      await showToast({
        style: Toast.Style.Failure,
        title: "Fehler beim Kopieren",
        message: "Konnte nicht in die Zwischenablage kopieren",
      });
    }
  };

  const copyValue = async (value: string, variableName: string) => {
    try {
      await Clipboard.copy(value);
      await showToast({
        style: Toast.Style.Success,
        title: "Wert kopiert",
        message: `${variableName}: ${value}`,
      });
    } catch {
      await showToast({
        style: Toast.Style.Failure,
        title: "Fehler beim Kopieren",
        message: "Konnte nicht in die Zwischenablage kopieren",
      });
    }
  };

  const openSettings = () => {
    openExtensionPreferences();
  };

  // Funktion um verfügbare Kategorien zu extrahieren
  const getAvailableCategories = (variables: CSSVariable[]): string[] => {
    const categories = new Set<string>();
    categories.add("Alle");
    variables.forEach((variable) => {
      if (variable.category && variable.category !== "Alle") {
        categories.add(variable.category);
      }
    });
    return Array.from(categories).sort();
  };

  // Funktion um Variablen nach Kategorie zu filtern
  const filterVariablesByCategory = (variables: CSSVariable[], category: string): CSSVariable[] => {
    if (category === "Alle") {
      return variables;
    }
    return variables.filter((variable) => variable.category === category);
  };

  // Erweiterte Suchfunktion mit mehreren Suchbegriffen
  const advancedSearch = (variables: CSSVariable[], searchQuery: string): CSSVariable[] => {
    if (!searchQuery || searchQuery.trim() === "") {
      return variables;
    }

    // Teile die Suchanfrage in einzelne Wörter auf
    const searchTerms = searchQuery
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term.length > 0);

    return variables.filter((variable) => {
      const searchableText = `${variable.name} ${variable.value}`.toLowerCase();

      // Alle Suchbegriffe müssen gefunden werden (AND-Logik)
      return searchTerms.every((term) => searchableText.includes(term));
    });
  };

  // Entferne Duplikate basierend auf Variablennamen
  const removeDuplicates = (variables: CSSVariable[]): CSSVariable[] => {
    const seen = new Set<string>();
    return variables.filter((variable) => {
      if (seen.has(variable.name)) {
        return false;
      }
      seen.add(variable.name);
      return true;
    });
  };

  // Gruppiere Variablen nach Kategorien für Sektionen
  const groupVariablesByCategory = (variables: CSSVariable[]): { [category: string]: CSSVariable[] } => {
    const grouped: { [category: string]: CSSVariable[] } = {};

    variables.forEach((variable) => {
      const category = variable.category || "Andere";
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(variable);
    });

    return grouped;
  };

  useEffect(() => {
    loadCSSVariables();
  }, []);

  useEffect(() => {
    // Erst nach Kategorie filtern
    const categoryFiltered = filterVariablesByCategory(cssVariables, selectedCategory);
    // Dann nach Suchtext filtern
    const searchFiltered = advancedSearch(categoryFiltered, searchText);
    setFilteredVariables(searchFiltered);
  }, [cssVariables, selectedCategory, searchText]);

  if (error) {
    return (
      <List>
        <List.Item
          icon={Icon.ExclamationMark}
          title="Fehler beim Laden der CSS-Datei"
          subtitle={error}
          actions={
            <ActionPanel>
              <Action title="Open Settings" icon={Icon.Gear} onAction={openSettings} />
              <Action title="Retry" icon={Icon.ArrowClockwise} onAction={loadCSSVariables} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const availableCategories = getAvailableCategories(cssVariables);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="CSS-Variablen durchsuchen... (z.B. 'foreground primary', 'background color')"
      onSearchTextChange={setSearchText}
      searchBarAccessory={
        <List.Dropdown tooltip="Kategorie filtern" value={selectedCategory} onChange={setSelectedCategory}>
          {availableCategories.map((category) => (
            <List.Dropdown.Item key={category} title={category} value={category} />
          ))}
        </List.Dropdown>
      }
    >
      {(() => {
        // Entferne Duplikate
        const uniqueVariables = removeDuplicates(filteredVariables);
        // Gruppiere nach Kategorien
        const grouped = groupVariablesByCategory(uniqueVariables);

        // Sortiere Kategorien alphabetisch, aber "Alle" und "Andere" am Ende
        const sortedCategories = Object.keys(grouped).sort((a, b) => {
          if (a === "Alle") return 1;
          if (b === "Alle") return -1;
          if (a === "Andere") return 1;
          if (b === "Andere") return -1;
          return a.localeCompare(b);
        });

        return sortedCategories.map((category) => (
          <List.Section key={category} title={category}>
            {grouped[category].map((variable, index) => {
              const isColor = isColorValue(variable.value);
              const colorHex = isColor ? colorToHex(variable.value, cssVariables) : null;
              const shouldShowColorPreview = preferences.showColorPreview && isColor;

              return (
                <List.Item
                  key={`${variable.name}-${index}`}
                  icon={shouldShowColorPreview ? { source: Icon.CircleFilled, tintColor: colorHex } : Icon.Code}
                  title={variable.name}
                  subtitle={variable.value}
                  keywords={[variable.name, variable.value]}
                  actions={
                    <ActionPanel>
                      <Action
                        title="Copy Variable Name"
                        icon={Icon.Clipboard}
                        onAction={() => copyVariableName(variable.name)}
                      />
                      <Action
                        title="Copy Variable Name with Var()"
                        icon={Icon.Clipboard}
                        onAction={() => copyVariableNameWithVar(variable.name)}
                        shortcut={{ modifiers: ["shift"], key: "enter" }}
                      />
                      <Action
                        title="Copy Value"
                        icon={Icon.Clipboard}
                        onAction={() => copyValue(variable.value, variable.name)}
                        shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }}
                      />
                      <Action title="Open Settings" icon={Icon.Gear} onAction={openSettings} />
                      <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={loadCSSVariables} />
                    </ActionPanel>
                  }
                />
              );
            })}
          </List.Section>
        ));
      })()}
    </List>
  );
}
