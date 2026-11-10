export type TranscriptionStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionOutputFiles {
  txt?: string;
  srt?: string;
  vtt?: string;
  json?: string;
  tsv?: string;
}

export interface Transcription {
  _id: string;
  meetingId: string;
  originalFileName: string;
  recordingPath?: string;
  transcriptText: string;
  segments: TranscriptSegment[];
  outputFiles: TranscriptionOutputFiles;
  language: string;
  model: string;
  status: TranscriptionStatus;
  errorMessage?: string;
  duration?: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}
