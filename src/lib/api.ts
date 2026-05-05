export function getApiHostLabel(apiUrl: string) {
  try {
    return new URL(apiUrl).host;
  } catch {
    return apiUrl;
  }
}
