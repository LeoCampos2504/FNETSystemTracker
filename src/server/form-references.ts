export function extractFormReferences(value: string | undefined | null): string[] {
  return [...new Set((value ?? "").toUpperCase().match(/FO-\d{2}-\d{6}(?!\d)/g) ?? [])];
}

export function exactFormReference(value: string | undefined | null): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^FO-\d{2}-\d{6}$/.test(normalized) ? normalized : null;
}
