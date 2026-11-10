import { api } from "./api";
import type { Transcription } from "../types/transcription";

export async function fetchMeetingTranscription(
  meetingId: string,
): Promise<Transcription | null> {
  const { data } = await api.get<{
    success: boolean;
    data: Transcription | null;
  }>(`/meetings/${meetingId}/transcription`);
  return data.data;
}

export async function downloadTranscription(
  transcriptionId: string,
  format: "txt" | "srt" | "vtt" | "json",
  defaultFileName?: string,
): Promise<void> {
  const response = await api.get(
    `/transcriptions/${transcriptionId}/download/${format}`,
    {
      responseType: "blob",
    },
  );

  let filename = defaultFileName || `transcript.${format}`;
  const disposition = response.headers["content-disposition"];
  if (disposition) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match && match[1]) {
      filename = match[1];
    }
  }

  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
