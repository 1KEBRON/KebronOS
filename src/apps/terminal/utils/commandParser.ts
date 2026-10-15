import { ParsedCommand } from "../types";

export const parseCommand = (command: string): ParsedCommand => {
  const trimmedCommand = command.trim();
  if (!trimmedCommand) return { cmd: "", args: [] };

  // Handle quoted arguments
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  const parts: string[] = [];
  let match;

  // Extract all parts including quoted sections
  while ((match = regex.exec(trimmedCommand)) !== null) {
    // If it's a quoted string, use the capture group (without quotes)
    if (match[1]) parts.push(match[1]);
    else if (match[2]) parts.push(match[2]);
    else parts.push(match[0]);
  }

  return {
    cmd: parts[0]?.toLowerCase() || "",
    args: parts.slice(1),
  };
};