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
import { useState, useEffect, useMemo } from "react";
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
  isUrl: boolean;
}

// Simple cache for CSS variables
const cssCache: Map<string, CacheEntry> = new Map();

// Helper function to detect categories based on prefix
const detectCategory = (variableName: string, filterPrefix: string): string => {
  if (!filterPrefix || filterPrefix.trim() === "") {
    return "All";
  }

  const prefix = filterPrefix.trim();

  // Check if the variable name starts with the prefix
  if (variableName.startsWith(prefix)) {
    // Extract the part after the prefix
    const afterPrefix = variableName.substring(prefix.length);

    // Find the first word after the prefix (until the first dash or end)
    const firstWordMatch = afterPrefix.match(/^([a-zA-Z0-9]+)/);
    if (firstWordMatch) {
      const category = firstWordMatch[1];
      return category.charAt(0).toUpperCase() + category.slice(1);
    }
  }

  return "Other";
};

// Helper function to check if a value is a color
const isColorValue = (value: string): boolean => {
  const trimmedValue = value.trim();

  // Hex colors (#fff, #ffffff)
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmedValue)) return true;

  // RGB/RGBA colors
  if (/^rgba?\(/.test(trimmedValue)) return true;

  // HSL/HSLA colors
  if (/^hsla?\(/.test(trimmedValue)) return true;

  // Named colors (only basic colors)
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

  // CSS variables that reference colors (aliases)
  if (/^var\(--/.test(trimmedValue)) return true;

  return false;
};

// Named colors to hex mapping (outside function for better performance)
const COLOR_MAP: { [key: string]: string } = {
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
  currentcolor: "currentColor",
};

// Helper function to convert a color to a hex value
const colorToHex = (value: string, cssVariables?: CSSVariable[]): string => {
  const trimmedValue = value.trim();

  // CSS variable alias (var(--variable-name))
  if (/^var\(--/.test(trimmedValue)) {
    const varMatch = trimmedValue.match(/var\(--([^)]+)\)/);
    if (varMatch && cssVariables) {
      const varName = `--${varMatch[1]}`;
      const referencedVar = cssVariables.find((v) => v.name === varName);
      if (referencedVar) {
        return colorToHex(referencedVar.value, cssVariables);
      }
    }
    return "#000000";
  }

  // Already hex color
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmedValue)) {
    // Convert 3-digit hex to 6-digit
    if (trimmedValue.length === 4) {
      return `#${trimmedValue[1]}${trimmedValue[1]}${trimmedValue[2]}${trimmedValue[2]}${trimmedValue[3]}${trimmedValue[3]}`;
    }
    return trimmedValue.toLowerCase();
  }

  // RGB to hex
  const rgbMatch = trimmedValue.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]);
    const g = parseInt(rgbMatch[2]);
    const b = parseInt(rgbMatch[3]);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  // HSL to hex
  const hslMatch = trimmedValue.match(/^hsla?\((\d+),\s*(\d+)%,\s*(\d+)%/);
  if (hslMatch) {
    const h = parseInt(hslMatch[1]);
    const s = parseInt(hslMatch[2]);
    const l = parseInt(hslMatch[3]);
    const c = ((1 - Math.abs((2 * l) / 100 - 1)) * s) / 100;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l / 100 - c / 2;
    let r, g, b;

    if (h < 60) {
      [r, g, b] = [c, x, 0];
    } else if (h < 120) {
      [r, g, b] = [x, c, 0];
    } else if (h < 180) {
      [r, g, b] = [0, c, x];
    } else if (h < 240) {
      [r, g, b] = [0, x, c];
    } else if (h < 300) {
      [r, g, b] = [x, 0, c];
    } else {
      [r, g, b] = [c, 0, x];
    }

    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);

    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  // Named colors
  return COLOR_MAP[trimmedValue.toLowerCase()] || "#000000";
};

// Helper function to load URLs
const fetchUrl = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === "https:";
      const client = isHttps ? https : http;

      const options: https.RequestOptions | http.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: "GET",
        headers: {
          "User-Agent": "CSS Variables Searcher/1.0",
          Accept: "text/css,text/plain,*/*",
        },
      };

      // For HTTPS, add SSL options
      if (isHttps) {
        (options as https.RequestOptions).rejectUnauthorized = true;
      }

      const req = client.request(options, (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            if (data.length === 0) {
              reject(new Error("Empty response from server"));
            } else {
              resolve(data);
            }
          });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage || "Unknown error"}`));
        }
      });

      req.on("error", (err) => {
        const errorMsg = err instanceof Error ? err.message : String(err);
        reject(new Error(`Network error: ${errorMsg}`));
      });

      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error("Request timeout after 15 seconds"));
      });

      req.end();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      reject(new Error(`Invalid URL or connection error: ${errorMsg}`));
    }
  });
};

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();

  const [cssVariables, setCssVariables] = useState<CSSVariable[]>([]);
  const [filteredVariables, setFilteredVariables] = useState<CSSVariable[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchText, setSearchText] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Determine onboarding state immediately (synchronously)
  const hasPreferences = Boolean(preferences.cssFilePath || preferences.cssFileUrl);

  const parseCSSVariables = (cssContent: string): CSSVariable[] => {
    const variables: CSSVariable[] = [];

    // Parse CSS variables
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

      // Check if at least one source is configured
      if (!preferences.cssFilePath && !preferences.cssFileUrl) {
        throw new Error("Please configure either a CSS file path or a CSS URL in the settings");
      }

      // Prioritize local file over URL
      const useLocalFile = preferences.cssFilePath && preferences.cssFilePath.trim() !== "";
      const useUrl = !useLocalFile && preferences.cssFileUrl && preferences.cssFileUrl.trim() !== "";

      if (useLocalFile) {
        await loadFromLocalFile();
      } else if (useUrl) {
        await loadFromUrl();
      } else {
        throw new Error("Please configure either a CSS file path or a CSS URL in the settings");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);

      await showToast({
        style: Toast.Style.Failure,
        title: "Error loading CSS file",
        message: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadFromLocalFile = async () => {
    if (!preferences.cssFilePath) {
      throw new Error("CSS file path is not configured");
    }

    // Check if the path exists
    if (!fs.existsSync(preferences.cssFilePath)) {
      throw new Error(`CSS file not found: ${preferences.cssFilePath}`);
    }

    const stats = fs.statSync(preferences.cssFilePath);
    const cachedEntry = cssCache.get(preferences.cssFilePath);

    // Check if cached version is still valid
    if (cachedEntry && !cachedEntry.isUrl && cachedEntry.mtime === stats.mtime.getTime()) {
      setCssVariables(cachedEntry.variables);
      return;
    }

    // Read and parse CSS file
    const cssContent = fs.readFileSync(preferences.cssFilePath, "utf-8");
    const variables = parseCSSVariables(cssContent);

    // Update cache
    cssCache.set(preferences.cssFilePath, {
      mtime: stats.mtime.getTime(),
      variables,
      isUrl: false,
    });

    setCssVariables(variables);

    if (variables.length === 0) {
      await showToast({
        style: Toast.Style.Animated,
        title: "No CSS variables found",
        message: "The CSS file does not contain any custom properties (--variables)",
      });
    }
  };

  const loadFromUrl = async () => {
    if (!preferences.cssFileUrl) {
      throw new Error("CSS URL is not configured");
    }

    // Validate URL format
    try {
      new URL(preferences.cssFileUrl);
    } catch {
      throw new Error("Invalid URL format");
    }

    // Check cache
    const cachedEntry = cssCache.get(preferences.cssFileUrl);
    if (cachedEntry && cachedEntry.isUrl) {
      setCssVariables(cachedEntry.variables);
      return;
    }

    // Load and parse CSS from URL
    const cssContent = await fetchUrl(preferences.cssFileUrl);
    const variables = parseCSSVariables(cssContent);

    // Update cache
    cssCache.set(preferences.cssFileUrl, {
      mtime: Date.now(),
      variables,
      isUrl: true,
    });

    setCssVariables(variables);

    if (variables.length === 0) {
      await showToast({
        style: Toast.Style.Animated,
        title: "No CSS variables found",
        message: "The CSS file does not contain any custom properties (--variables)",
      });
    }
  };

  const copyToClipboard = async (text: string, successTitle: string, successMessage: string) => {
    try {
      await Clipboard.copy(text);
      await showToast({
        style: Toast.Style.Success,
        title: successTitle,
        message: successMessage,
      });
    } catch {
      await showToast({
        style: Toast.Style.Failure,
        title: "Error copying",
        message: "Could not copy to clipboard",
      });
    }
  };

  const copyVariableName = (variableName: string) =>
    copyToClipboard(variableName, "Variable name copied", variableName);

  const copyVariableNameWithVar = (variableName: string) =>
    copyToClipboard(`var(${variableName})`, "Variable name with var() copied", `var(${variableName})`);

  const copyValue = (value: string, variableName: string) =>
    copyToClipboard(value, "Value copied", `${variableName}: ${value}`);

  // Function to extract available categories
  const getAvailableCategories = (variables: CSSVariable[]): string[] => {
    const categories = new Set<string>();
    categories.add("All");
    variables.forEach((variable) => {
      if (variable.category && variable.category !== "All") {
        categories.add(variable.category);
      }
    });
    return Array.from(categories).sort();
  };

  // Function to filter variables by category
  const filterVariablesByCategory = (variables: CSSVariable[], category: string): CSSVariable[] => {
    if (category === "All") {
      return variables;
    }
    return variables.filter((variable) => variable.category === category);
  };

  // Advanced search function with multiple search terms
  const advancedSearch = (variables: CSSVariable[], searchQuery: string): CSSVariable[] => {
    if (!searchQuery || searchQuery.trim() === "") {
      return variables;
    }

    // Split the search query into individual words
    const searchTerms = searchQuery
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term.length > 0);

    return variables.filter((variable) => {
      const searchableText = `${variable.name} ${variable.value}`.toLowerCase();

      // All search terms must be found (AND logic)
      return searchTerms.every((term) => searchableText.includes(term));
    });
  };

  // Remove duplicates based on variable names
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

  // Group variables by categories for sections
  const groupVariablesByCategory = (variables: CSSVariable[]): { [category: string]: CSSVariable[] } => {
    const grouped: { [category: string]: CSSVariable[] } = {};

    variables.forEach((variable) => {
      const category = variable.category || "Other";
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(variable);
    });

    return grouped;
  };

  // Load CSS variables on mount if preferences are configured
  useEffect(() => {
    if (hasPreferences) {
      loadCSSVariables().finally(() => setInitialized(true));
    } else {
      setIsLoading(false);
      setInitialized(true);
    }
  }, []);

  // Filter variables by category and search text
  useEffect(() => {
    const categoryFiltered = filterVariablesByCategory(cssVariables, selectedCategory);
    const searchFiltered = advancedSearch(categoryFiltered, searchText);
    setFilteredVariables(searchFiltered);
  }, [cssVariables, selectedCategory, searchText]);

  // Memoize available categories to avoid recalculation
  const availableCategories = useMemo(() => getAvailableCategories(cssVariables), [cssVariables]);

  // Memoize grouped variables to avoid recalculation on every render
  const groupedVariables = useMemo(() => {
    const uniqueVariables = removeDuplicates(filteredVariables);
    const grouped = groupVariablesByCategory(uniqueVariables);

    // Sort categories alphabetically, but "All" and "Other" at the end
    const sortedCategories = Object.keys(grouped).sort((a, b) => {
      if (a === "All") return 1;
      if (b === "All") return -1;
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    });

    return { grouped, sortedCategories };
  }, [filteredVariables]);

  // Show loading until initialized
  if (!initialized) {
    return <List isLoading={true} />;
  }

  // Show onboarding screen if no configuration
  if (!hasPreferences) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Document}
          title="Welcome to CSS Variables Searcher"
          description="Configure your CSS file source to get started. After saving the settings, reopen the extension."
          actions={
            <ActionPanel>
              <Action
                title="Open Settings"
                icon={Icon.Gear}
                onAction={() => {
                  openExtensionPreferences();
                }}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  if (error) {
    return (
      <List>
        <List.Item
          icon={Icon.ExclamationMark}
          title="Error loading CSS file"
          subtitle={error}
          actions={
            <ActionPanel>
              <Action title="Open Settings" icon={Icon.Gear} onAction={openExtensionPreferences} />
              <Action title="Retry" icon={Icon.ArrowClockwise} onAction={loadCSSVariables} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List
      isLoading={isLoading || !initialized}
      searchBarPlaceholder="Search CSS variables... (e.g. 'foreground primary', 'background color')"
      onSearchTextChange={setSearchText}
      searchBarAccessory={
        <List.Dropdown tooltip="Filter by category" value={selectedCategory} onChange={setSelectedCategory}>
          {availableCategories.map((category) => (
            <List.Dropdown.Item key={category} title={category} value={category} />
          ))}
        </List.Dropdown>
      }
    >
      {groupedVariables.sortedCategories.map((category) => (
        <List.Section key={category} title={category}>
          {groupedVariables.grouped[category].map((variable, index) => {
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
                    <Action title="Open Settings" icon={Icon.Gear} onAction={openExtensionPreferences} />
                    <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={loadCSSVariables} />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      ))}
    </List>
  );
}
