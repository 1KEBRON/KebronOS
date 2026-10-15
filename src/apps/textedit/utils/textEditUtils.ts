import { Editor } from "@tiptap/core";

export const removeFileExtension = (filename: string): string => {
  return filename.replace(/\.[^/.]+$/, "");
};

export const getContentAsString = async (
  content: string | Blob | undefined
): Promise<string> => {
  if (!content) return "";
  if (content instanceof Blob) {
    return await content.text();
  }
  return content;
};

export const generateSuggestedFilename = (
  customTitle: string | undefined,
  editor: Editor | null
): string => {
  // First priority: use custom title if provided
  if (customTitle && customTitle.trim() && customTitle !== "Untitled") {
    return (
      customTitle
        .split(/\s+/) // Split into words
        .filter(Boolean)
        .slice(0, 7) // Keep at most 7 words
        .join("-") // Join with hyphens
        .replace(/[^a-zA-Z0-9-]/g, "") // Remove non-alphanumeric (except hyphen)
        .substring(0, 50) || "Untitled"
    ); // Cap to 50 characters, fallback to Untitled
  }

  // Second priority: extract from first line of content
  if (editor) {
    const content = editor.getHTML();
    const firstLineText = content
      .split("\n")[0] // Get first line
      .replace(/<[^>]+>/g, "") // Remove HTML tags
      .trim(); // Remove leading/trailing whitespace

    // Take the first 7 words, sanitise, join with hyphens, and cap length
    const firstLine = firstLineText
      .split(/\s+/) // Split into words
      .filter(Boolean)
      .slice(0, 7) // Keep at most 7 words
      .join("-") // Join with hyphens
      .replace(/[^a-zA-Z0-9-]/g, "") // Remove non-alphanumeric (except hyphen)
      .substring(0, 50); // Cap to 50 characters

    return firstLine || "Untitled";
  }

  return "Untitled";
};

export interface TextEditInitialData {
  path?: string;
  content?: string;
}