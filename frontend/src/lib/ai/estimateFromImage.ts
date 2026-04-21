/**
 * Reserved for future vision models (e.g. Gemini). Not used in production yet.
 * Returns null so callers can fall back to manual entry.
 */
export async function estimateFromImage(_image: Blob): Promise<{ length: number; width: number } | null> {
  void _image;
  return null;
}
