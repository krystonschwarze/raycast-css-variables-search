import { ActionPanel, List, Action, Icon, showToast, Toast, getPreferenceValues, openExtensionPreferences, Clipboard } from "@raycast/api";
import { useState, useEffect } from "react";
import * as fs from "fs";
import * as path from "path";

interface CSSVariable {
  name: string;
  value: string;
}

interface Preferences {
  cssFilePath: string;
}

interface CacheEntry {
  mtime: number;
  variables: CSSVariable[];
}

// Einfacher Cache für die CSS-Variablen
let cssCache: Map<string, CacheEntry> = new Map();

export default function Command() {
  const [cssVariables, setCssVariables] = useState<CSSVariable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const preferences = getPreferenceValues<Preferences>();

  const parseCSSVariables = (cssContent: string): CSSVariable[] => {
    const variables: CSSVariable[] = [];
    const regex = /(?:(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);?)/g;
    let match;

    while ((match = regex.exec(cssContent)) !== null) {
      const name = match[1].trim();
      const value = match[2].trim();
      variables.push({ name, value });
    }

    return variables;
  };

  const loadCSSVariables = async () => {
    try {
      setIsLoading(true);
      setError(null);

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
      
      if (cachedEntry && cachedEntry.mtime === stats.mtime.getTime()) {
        setCssVariables(cachedEntry.variables);
        setIsLoading(false);
        return;
      }

      // Lese CSS-Datei
      const cssContent = fs.readFileSync(preferences.cssFilePath, "utf-8");
      const variables = parseCSSVariables(cssContent);

      // Aktualisiere Cache
      cssCache.set(preferences.cssFilePath, {
        mtime: stats.mtime.getTime(),
        variables: variables
      });

      setCssVariables(variables);

      if (variables.length === 0) {
        await showToast({
          style: Toast.Style.Animated,
          title: "Keine CSS-Variablen gefunden",
          message: "Die CSS-Datei enthält keine benutzerdefinierten Eigenschaften (--variablen)"
        });
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

  const copyToClipboard = async (value: string, variableName: string) => {
    try {
      await Clipboard.copy(value);
      await showToast({
        style: Toast.Style.Success,
        title: "In Zwischenablage kopiert",
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

  useEffect(() => {
    loadCSSVariables();
  }, []);

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

  return (
    <List isLoading={isLoading} searchBarPlaceholder="CSS-Variablen durchsuchen...">
      {cssVariables.map((variable, index) => (
        <List.Item
          key={`${variable.name}-${index}`}
          icon={Icon.Code}
          title={variable.name}
          subtitle={variable.value}
          keywords={[variable.name, variable.value]}
          actions={
            <ActionPanel>
              <Action
                title="Wert kopieren"
                icon={Icon.Clipboard}
                onAction={() => copyToClipboard(variable.value, variable.name)}
              />
              <Action
                title="Variablenname kopieren"
                icon={Icon.Clipboard}
                onAction={() => copyToClipboard(variable.name, "Variablenname")}
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
      ))}
    </List>
  );
}
