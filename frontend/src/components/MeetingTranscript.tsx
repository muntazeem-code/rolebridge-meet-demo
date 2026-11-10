import { useEffect, useState, useCallback } from "react";
import {
  FileText,
  Download,
  RefreshCw,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Copy,
  Check,
  ListOrdered,
} from "lucide-react";
import type { Transcription, TranscriptSegment } from "../types/transcription";
import {
  fetchMeetingTranscription,
  downloadTranscription,
} from "../services/transcription";
import { getApiError } from "../services/api";

function formatSeconds(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);

  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function MeetingTranscript({
  meetingId,
  meetingTopic,
}: {
  meetingId: string;
  meetingTopic: string;
}) {
  const [transcription, setTranscription] = useState<Transcription | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"text" | "timestamps">("text");
  const [copied, setCopied] = useState(false);
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(
    null,
  );

  const loadData = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) setRefreshing(true);
      setError("");
      try {
        const data = await fetchMeetingTranscription(meetingId);
        setTranscription(data);
      } catch (err) {
        setError(getApiError(err, "Unable to load meeting transcription."));
      } finally {
        setLoading(false);
        if (isManualRefresh) setRefreshing(false);
      }
    },
    [meetingId],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Auto-poll when transcription is pending or actively processing
  useEffect(() => {
    if (
      transcription?.status === "processing" ||
      transcription?.status === "pending"
    ) {
      const interval = setInterval(() => {
        void loadData();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [transcription?.status, loadData]);

  const handleCopy = async () => {
    if (!transcription?.transcriptText) return;
    try {
      await navigator.clipboard.writeText(transcription.transcriptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failure
    }
  };

  const handleDownload = async (format: "txt" | "srt" | "vtt" | "json") => {
    if (!transcription) return;
    setDownloadingFormat(format);
    try {
      const cleanTopic = meetingTopic
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 40);
      await downloadTranscription(
        transcription._id,
        format,
        `${cleanTopic}_transcript.${format}`,
      );
    } catch (err) {
      setError(
        getApiError(err, `Failed to download ${format.toUpperCase()} file.`),
      );
    } finally {
      setDownloadingFormat(null);
    }
  };

  const status = transcription?.status;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-indigo-600" />
          <h3 className="text-sm font-semibold text-slate-800">
            Meeting Transcript
          </h3>
          {/* Status Badge */}
          {status === "completed" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Completed
            </span>
          )}
          {status === "processing" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 animate-pulse">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Processing recording with Whisper...
            </span>
          )}
          {status === "pending" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              <Clock className="h-3.5 w-3.5" />
              Pending
            </span>
          )}
          {status === "failed" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
              <AlertCircle className="h-3.5 w-3.5" />
              Failed
            </span>
          )}
          {!status && !loading && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              Awaiting recording
            </span>
          )}
        </div>

        {/* Refresh button */}
        <button
          type="button"
          onClick={() => void loadData(true)}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          title="Refresh transcript status"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${refreshing || loading ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      {/* Error alert */}
      {error && (
        <div className="mt-3 rounded-md bg-red-50 p-2.5 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Loading placeholder */}
      {loading && !transcription && (
        <div className="flex items-center justify-center py-6 text-xs text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-slate-400" />
          Loading transcript details...
        </div>
      )}

      {/* No recording detected yet */}
      {!loading && !transcription && (
        <div className="py-4 text-center text-xs text-slate-500">
          <p>No Zoom recording has been detected for this meeting yet.</p>
          <p className="mt-1 text-slate-400">
            When the meeting finishes and Zoom saves the local recording,
            Whisper will transcribe it automatically.
          </p>
        </div>
      )}

      {/* Processing State */}
      {status === "processing" && (
        <div className="my-3 rounded-md border border-sky-100 bg-sky-50/50 p-3 text-xs text-sky-800">
          <div className="flex items-center gap-2 font-medium">
            <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
            Transcription is currently running locally
          </div>
          <p className="mt-1 text-sky-700">
            OpenAI Whisper is generating transcripts from the local recording.
            This status will automatically update upon completion.
          </p>
        </div>
      )}

      {/* Failed State */}
      {status === "failed" && (
        <div className="my-3 rounded-md border border-red-100 bg-red-50 p-3 text-xs text-red-800">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4 text-red-600" />
            Transcription failed
          </div>
          <p className="mt-1 text-red-700">
            {transcription.errorMessage ||
              "An unknown error occurred during local transcription."}
          </p>
        </div>
      )}

      {/* Completed State */}
      {status === "completed" && (
        <div className="mt-3 space-y-3">
          {/* Metadata bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            {/* <div className="flex flex-wrap items-center gap-3">
              {transcription.duration !== undefined && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  Processed in {transcription.duration}s
                </span>
              )}
              {transcription.language && (
                <span>Language: <strong className="text-slate-700">{transcription.language}</strong></span>
              )}
              {transcription.model && (
                <span>Model: <strong className="text-slate-700">{transcription.model}</strong></span>
              )}
              {transcription.originalFileName && (
                <span className="truncate max-w-xs text-slate-400" title={transcription.originalFileName}>
                  Source: {transcription.originalFileName}
                </span>
              )}
            </div> */}

            {/* View Mode Toggle & Copy */}
            <div className="flex items-center gap-1">
              <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("text")}
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
                    viewMode === "text"
                      ? "text-slate-100 hover:text-slate-50"
                      : "bg-white text-slate-900 shadow-xs"
                  }`}
                >
                  <FileText className="h-3 w-3" />
                  Text
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("timestamps")}
                  disabled={!transcription.segments?.length}
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium disabled:opacity-40 ${
                    viewMode === "timestamps"
                      ? "text-slate-100 hover:text-slate-50"
                      : "bg-white text-slate-900 shadow-xs"
                  }`}
                >
                  <ListOrdered className="h-3 w-3" />
                  Timestamps ({transcription.segments?.length || 0})
                </button>
              </div>

              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-50 hover:bg-slate-50 hover:text-slate-900"
                title="Copy full transcript"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Transcript Content Container */}
          <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-slate-50/70 p-3 text-xs leading-relaxed text-slate-800">
            {viewMode === "text" ? (
              <p className="whitespace-pre-wrap font-sans">
                {transcription.transcriptText ||
                  "No speech detected in this recording."}
              </p>
            ) : (
              <div className="space-y-2 font-mono">
                {transcription.segments?.map((seg: TranscriptSegment) => (
                  <div key={seg.id} className="flex gap-2">
                    <span className="shrink-0 text-indigo-600 font-semibold select-none">
                      [{formatSeconds(seg.start)} &rarr;{" "}
                      {formatSeconds(seg.end)}]
                    </span>
                    <span className="font-sans text-slate-800">{seg.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Download Transcript Button */}
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              disabled={downloadingFormat !== null}
              onClick={() => handleDownload("txt")}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50"
              title="Download transcript as TXT"
            >
              {downloadingFormat === "txt" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
              ) : (
                <Download className="h-3.5 w-3.5 text-slate-600" />
              )}
              <span>Download Transcript</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
