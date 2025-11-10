import { ActionPanel, List, Action, Icon, showToast, Toast, getPreferenceValues, openExtensionPreferences, Clipboard } from "@raycast/api";
import { useState, useEffect } from "react";
import * as fs from "fs";
import * as path from "path";
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
let cssCache: Map<string, CacheEntry> = new Map();

// Hilfsfunktion um Kategorien basierend auf Präfix zu erkennen
const detectCategory = (variableName: string, filterPrefix: string): string => {
  if (!filterPrefix || filterPrefix.trim() === '') {
    return 'Alle';
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
  
  return 'Andere';
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
  
  // Named colors (erweiterte Liste)
  const namedColors = [
    'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'brown',
    'black', 'white', 'gray', 'grey', 'transparent', 'currentColor',
    'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige',
    'bisque', 'blanchedalmond', 'blueviolet', 'burlywood', 'cadetblue',
    'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk',
    'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray',
    'darkgreen', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange',
    'darkorchid', 'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue',
    'darkslategray', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue',
    'dimgray', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen',
    'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'greenyellow',
    'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender',
    'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral',
    'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightpink',
    'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
    'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta',
    'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple',
    'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise',
    'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin',
    'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orangered',
    'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred',
    'papayawhip', 'peachpuff', 'peru', 'plum', 'powderblue', 'rosybrown',
    'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell',
    'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'snow',
    'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato',
    'turquoise', 'violet', 'wheat', 'whitesmoke', 'yellowgreen'
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
      const referencedVar = cssVariables.find(v => v.name === varName);
      if (referencedVar) {
        return colorToHex(referencedVar.value, cssVariables);
      }
    }
    return '#000000'; // Fallback für unbekannte Variablen
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
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  
  // HSL zu Hex (vereinfacht)
  const hslMatch = trimmedValue.match(/^hsla?\((\d+),\s*(\d+)%,\s*(\d+)%/);
  if (hslMatch) {
    const h = parseInt(hslMatch[1]);
    const s = parseInt(hslMatch[2]);
    const l = parseInt(hslMatch[3]);
    // Vereinfachte HSL zu RGB Konvertierung
    const c = (1 - Math.abs(2 * l / 100 - 1)) * s / 100;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l / 100 - c / 2;
    let r, g, b;
    
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  
  // Named colors zu Hex (erweiterte Liste)
  const colorMap: { [key: string]: string } = {
    'red': '#ff0000', 'green': '#008000', 'blue': '#0000ff', 'yellow': '#ffff00',
    'orange': '#ffa500', 'purple': '#800080', 'pink': '#ffc0cb', 'brown': '#a52a2a',
    'black': '#000000', 'white': '#ffffff', 'gray': '#808080', 'grey': '#808080',
    'transparent': 'transparent', 'currentColor': 'currentColor',
    'aliceblue': '#f0f8ff', 'antiquewhite': '#faebd7', 'aqua': '#00ffff', 'aquamarine': '#7fffd4',
    'azure': '#f0ffff', 'beige': '#f5f5dc', 'bisque': '#ffe4c4', 'blanchedalmond': '#ffebcd',
    'blueviolet': '#8a2be2', 'burlywood': '#deb887', 'cadetblue': '#5f9ea0', 'chartreuse': '#7fff00',
    'chocolate': '#d2691e', 'coral': '#ff7f50', 'cornflowerblue': '#6495ed', 'cornsilk': '#fff8dc',
    'crimson': '#dc143c', 'cyan': '#00ffff', 'darkblue': '#00008b', 'darkcyan': '#008b8b',
    'darkgoldenrod': '#b8860b', 'darkgray': '#a9a9a9', 'darkgreen': '#006400', 'darkkhaki': '#bdb76b',
    'darkmagenta': '#8b008b', 'darkolivegreen': '#556b2f', 'darkorange': '#ff8c00', 'darkorchid': '#9932cc',
    'darkred': '#8b0000', 'darksalmon': '#e9967a', 'darkseagreen': '#8fbc8f', 'darkslateblue': '#483d8b',
    'darkslategray': '#2f4f4f', 'darkturquoise': '#00ced1', 'darkviolet': '#9400d3', 'deeppink': '#ff1493',
    'deepskyblue': '#00bfff', 'dimgray': '#696969', 'dodgerblue': '#1e90ff', 'firebrick': '#b22222',
    'floralwhite': '#fffaf0', 'forestgreen': '#228b22', 'fuchsia': '#ff00ff', 'gainsboro': '#dcdcdc',
    'ghostwhite': '#f8f8ff', 'gold': '#ffd700', 'goldenrod': '#daa520', 'greenyellow': '#adff2f',
    'honeydew': '#f0fff0', 'hotpink': '#ff69b4', 'indianred': '#cd5c5c', 'indigo': '#4b0082',
    'ivory': '#fffff0', 'khaki': '#f0e68c', 'lavender': '#e6e6fa', 'lavenderblush': '#fff0f5',
    'lawngreen': '#7cfc00', 'lemonchiffon': '#fffacd', 'lightblue': '#add8e6', 'lightcoral': '#f08080',
    'lightcyan': '#e0ffff', 'lightgoldenrodyellow': '#fafad2', 'lightgray': '#d3d3d3', 'lightgreen': '#90ee90',
    'lightpink': '#ffb6c1', 'lightsalmon': '#ffa07a', 'lightseagreen': '#20b2aa', 'lightskyblue': '#87cefa',
    'lightslategray': '#778899', 'lightsteelblue': '#b0c4de', 'lightyellow': '#ffffe0', 'lime': '#00ff00',
    'limegreen': '#32cd32', 'linen': '#faf0e6', 'magenta': '#ff00ff', 'maroon': '#800000',
    'mediumaquamarine': '#66cdaa', 'mediumblue': '#0000cd', 'mediumorchid': '#ba55d3', 'mediumpurple': '#9370db',
    'mediumseagreen': '#3cb371', 'mediumslateblue': '#7b68ee', 'mediumspringgreen': '#00fa9a', 'mediumturquoise': '#48d1cc',
    'mediumvioletred': '#c71585', 'midnightblue': '#191970', 'mintcream': '#f5fffa', 'mistyrose': '#ffe4e1',
    'moccasin': '#ffe4b5', 'navajowhite': '#ffdead', 'navy': '#000080', 'oldlace': '#fdf5e6',
    'olive': '#808000', 'olivedrab': '#6b8e23', 'orangered': '#ff4500', 'orchid': '#da70d6',
    'palegoldenrod': '#eee8aa', 'palegreen': '#98fb98', 'paleturquoise': '#afeeee', 'palevioletred': '#db7093',
    'papayawhip': '#ffefd5', 'peachpuff': '#ffdab9', 'peru': '#cd853f', 'plum': '#dda0dd',
    'powderblue': '#b0e0e6', 'rosybrown': '#bc8f8f', 'royalblue': '#4169e1', 'saddlebrown': '#8b4513',
    'salmon': '#fa8072', 'sandybrown': '#f4a460', 'seagreen': '#2e8b57', 'seashell': '#fff5ee',
    'sienna': '#a0522d', 'silver': '#c0c0c0', 'skyblue': '#87ceeb', 'slateblue': '#6a5acd',
    'slategray': '#708090', 'snow': '#fffafa', 'springgreen': '#00ff7f', 'steelblue': '#4682b4',
    'tan': '#d2b48c', 'teal': '#008080', 'thistle': '#d8bfd8', 'tomato': '#ff6347',
    'turquoise': '#40e0d0', 'violet': '#ee82ee', 'wheat': '#f5deb3', 'whitesmoke': '#f5f5f5',
    'yellowgreen': '#9acd32'
  };
  
  return colorMap[trimmedValue.toLowerCase()] || '#000000';
};

// Hilfsfunktion zum Laden von URLs
const fetchUrl = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'CSS Variables Searcher/1.0'
      }
    };

    const req = client.request(options, (res) => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve(data);
        });
      } else {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
      }
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
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
        message: errorMessage
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
      isUrl: false
    });

    setCssVariables(variables);

    if (variables.length === 0) {
      await showToast({
        style: Toast.Style.Animated,
        title: "Keine CSS-Variablen gefunden",
        message: "Die CSS-Datei enthält keine benutzerdefinierten Eigenschaften (--variablen)"
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
      url: preferences.cssFileUrl
    });

    setCssVariables(variables);

    if (variables.length === 0) {
      await showToast({
        style: Toast.Style.Animated,
        title: "Keine CSS-Variablen gefunden",
        message: "Die CSS-Datei enthält keine benutzerdefinierten Eigenschaften (--variablen)"
      });
    }
  };

  const copyVariableName = async (variableName: string) => {
    try {
      await Clipboard.copy(variableName);
      await showToast({
        style: Toast.Style.Success,
        title: "Variablenname kopiert",
        message: variableName
      });
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Fehler beim Kopieren",
        message: "Konnte nicht in die Zwischenablage kopieren"
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
        message: varFormat
      });
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Fehler beim Kopieren",
        message: "Konnte nicht in die Zwischenablage kopieren"
      });
    }
  };

  const copyValue = async (value: string, variableName: string) => {
    try {
      await Clipboard.copy(value);
      await showToast({
        style: Toast.Style.Success,
        title: "Wert kopiert",
        message: `${variableName}: ${value}`
      });
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Fehler beim Kopieren",
        message: "Konnte nicht in die Zwischenablage kopieren"
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
    variables.forEach(variable => {
      if (variable.category && variable.category !== 'Alle') {
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
    return variables.filter(variable => variable.category === category);
  };

  // Erweiterte Suchfunktion mit mehreren Suchbegriffen
  const advancedSearch = (variables: CSSVariable[], searchQuery: string): CSSVariable[] => {
    if (!searchQuery || searchQuery.trim() === '') {
      return variables;
    }

    // Teile die Suchanfrage in einzelne Wörter auf
    const searchTerms = searchQuery
      .toLowerCase()
      .split(/\s+/)
      .filter(term => term.length > 0);

    return variables.filter(variable => {
      const searchableText = `${variable.name} ${variable.value}`.toLowerCase();
      
      // Alle Suchbegriffe müssen gefunden werden (AND-Logik)
      return searchTerms.every(term => searchableText.includes(term));
    });
  };

  // Gruppiere Variablen nach Kategorien für Sektionen
  const groupVariablesByCategory = (variables: CSSVariable[]): { [category: string]: CSSVariable[] } => {
    const grouped: { [category: string]: CSSVariable[] } = {};
    
    variables.forEach(variable => {
      const category = variable.category || 'Andere';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(variable);
    });
    
    return grouped;
  };

  // Erstelle Sektionen mit Trennstrichen
  const createSectionsWithSeparators = (variables: CSSVariable[]): (CSSVariable | { type: 'separator', category: string })[] => {
    const grouped = groupVariablesByCategory(variables);
    const sections: (CSSVariable | { type: 'separator', category: string })[] = [];
    
    // Sortiere Kategorien alphabetisch, aber "Alle" und "Andere" am Ende
    const sortedCategories = Object.keys(grouped).sort((a, b) => {
      if (a === 'Alle') return 1;
      if (b === 'Alle') return -1;
      if (a === 'Andere') return 1;
      if (b === 'Andere') return -1;
      return a.localeCompare(b);
    });
    
    sortedCategories.forEach((category, index) => {
      // Füge Trennstrich vor jeder Kategorie hinzu (außer der ersten)
      if (index > 0) {
        sections.push({ type: 'separator', category });
      }
      
      // Füge alle Variablen dieser Kategorie hinzu
      sections.push(...grouped[category]);
    });
    
    return sections;
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
              <Action
                title="Einstellungen öffnen"
                icon={Icon.Gear}
                onAction={openSettings}
              />
              <Action
                title="Erneut versuchen"
                icon={Icon.ArrowClockwise}
                onAction={loadCSSVariables}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const getSourceInfo = () => {
    if (preferences.cssFilePath && preferences.cssFilePath.trim() !== "") {
      return `Lokale Datei: ${path.basename(preferences.cssFilePath)}`;
    } else if (preferences.cssFileUrl && preferences.cssFileUrl.trim() !== "") {
      try {
        const url = new URL(preferences.cssFileUrl);
        return `URL: ${url.hostname}${url.pathname}`;
      } catch {
        return `URL: ${preferences.cssFileUrl}`;
      }
    }
    return "Keine Quelle konfiguriert";
  };

  const availableCategories = getAvailableCategories(cssVariables);

  return (
    <List 
      isLoading={isLoading} 
      searchBarPlaceholder="CSS-Variablen durchsuchen... (z.B. 'foreground primary', 'background color')"
      onSearchTextChange={setSearchText}
      searchBarAccessory={
        <List.Dropdown 
          tooltip="Kategorie filtern" 
          value={selectedCategory}
          onChange={setSelectedCategory}
        >
          {availableCategories.map((category) => (
            <List.Dropdown.Item 
              key={category}
              title={category} 
              value={category} 
            />
          ))}
        </List.Dropdown>
      }
    >
      {createSectionsWithSeparators(filteredVariables).map((item, index) => {
        // Prüfe ob es ein Trennstrich ist
        if ('type' in item && item.type === 'separator') {
          return (
            <List.Section
              key={`separator-${item.category}-${index}`}
              title={item.category}
            />
          );
        }
        
        // Normale Variable
        const variable = item as CSSVariable;
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
                  title="Variablenname kopieren"
                  icon={Icon.Clipboard}
                  onAction={() => copyVariableName(variable.name)}
                  shortcut={{ modifiers: [], key: "enter" }}
                />
                <Action
                  title="Variablenname mit var() kopieren"
                  icon={Icon.Clipboard}
                  onAction={() => copyVariableNameWithVar(variable.name)}
                  shortcut={{ modifiers: ["cmd"], key: "enter" }}
                />
                <Action
                  title="Wert kopieren"
                  icon={Icon.Clipboard}
                  onAction={() => copyValue(variable.value, variable.name)}
                />
                <Action
                  title="Einstellungen öffnen"
                  icon={Icon.Gear}
                  onAction={openSettings}
                />
                <Action
                  title="Aktualisieren"
                  icon={Icon.ArrowClockwise}
                  onAction={loadCSSVariables}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

