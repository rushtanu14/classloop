import { ShieldCheck, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { cloudRequest } from "../cloud";
import type { Resource } from "../types";

const LOCAL_MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".txt", ".md"]);
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "text/plain", "text/markdown", ""]);
const HANDLE_PATTERN = /^[A-Za-z0-9_-]{10,64}$/;

type UploadSession = {
  apiKey: string;
  policy: string;
  signature: string;
  maxSizeBytes: number;
  allowedExtensions: string[];
  allowedMimeTypes: string[];
  filenamePrefix: string;
  uploadReceipt: string;
};

type ScanReceipt = {
  verdict: "clean";
  threats: [];
  engine: "ClamAV";
  engineVersion: string;
  signatureUpdatedAt: string;
  scannedAt: string;
};

type FinalizedResource = Omit<Resource, "id"> & { expiresAt: string; scan: ScanReceipt };

function extensionFor(filename: string) {
  const index = filename.lastIndexOf(".");
  return index >= 0 ? filename.slice(index).toLowerCase() : "";
}

function validateLocalFile(file: File) {
  if (!file.name || file.name.length > 140 || /[\\/\u0000-\u001f]/.test(file.name)) {
    throw new Error("Use a simple file name without folders or control characters.");
  }
  if (!ALLOWED_EXTENSIONS.has(extensionFor(file.name)) || !ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
    throw new Error("Choose a PDF, TXT, or Markdown resource.");
  }
  if (file.size <= 0 || file.size > LOCAL_MAX_FILE_BYTES) {
    throw new Error("Choose a resource between 1 byte and 10 MB.");
  }
}

function parseUploadSession(value: unknown): UploadSession {
  if (!value || typeof value !== "object") throw new Error("Secure file upload is unavailable right now.");
  const candidate = value as Record<string, unknown>;
  if (
    ![candidate.apiKey, candidate.policy, candidate.signature, candidate.filenamePrefix, candidate.uploadReceipt].every(
      (item) => typeof item === "string" && item.length > 0 && item.length <= 2_000,
    ) ||
    !Number.isFinite(candidate.maxSizeBytes) ||
    Number(candidate.maxSizeBytes) <= 0 ||
    Number(candidate.maxSizeBytes) > LOCAL_MAX_FILE_BYTES ||
    !Array.isArray(candidate.allowedExtensions) ||
    !Array.isArray(candidate.allowedMimeTypes)
  ) {
    throw new Error("Secure file upload is unavailable right now.");
  }
  return candidate as unknown as UploadSession;
}

function parseFilestackHandle(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Filestack returned an invalid upload response.");
  const handle = (value as Record<string, unknown>).handle;
  if (typeof handle !== "string" || !HANDLE_PATTERN.test(handle)) {
    throw new Error("Filestack returned an invalid upload response.");
  }
  return handle;
}

function parseFinalizedResource(value: unknown): FinalizedResource {
  if (!value || typeof value !== "object") throw new Error("Filestack returned an invalid resource.");
  const candidate = value as Record<string, unknown>;
  const scan = candidate.scan as Record<string, unknown> | undefined;
  if (
    typeof candidate.title !== "string" ||
    !candidate.title.trim() ||
    candidate.type !== "worksheet" ||
    typeof candidate.relatedTopic !== "string" ||
    typeof candidate.expiresAt !== "string" ||
    typeof candidate.url !== "string" ||
    !scan ||
    scan.verdict !== "clean" ||
    scan.engine !== "ClamAV" ||
    !Array.isArray(scan.threats) ||
    scan.threats.length !== 0 ||
    typeof scan.engineVersion !== "string" ||
    !scan.engineVersion ||
    typeof scan.signatureUpdatedAt !== "string" ||
    !Number.isFinite(Date.parse(scan.signatureUpdatedAt)) ||
    typeof scan.scannedAt !== "string" ||
    !Number.isFinite(Date.parse(scan.scannedAt))
  ) {
    throw new Error("Filestack returned an invalid resource.");
  }
  const url = new URL(candidate.url);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "cdn.filestackcontent.com" ||
    url.username ||
    url.password ||
    url.port ||
    !HANDLE_PATTERN.test(url.pathname.slice(1)) ||
    !url.searchParams.get("policy") ||
    !url.searchParams.get("signature")
  ) {
    throw new Error("Filestack returned an unsafe resource link.");
  }
  return {
    title: candidate.title.trim().slice(0, 120),
    url: url.toString(),
    type: "worksheet",
    relatedTopic: candidate.relatedTopic.trim().slice(0, 120),
    expiresAt: candidate.expiresAt,
    scan: scan as ScanReceipt,
  };
}

export function FilestackResourceUpload({
  ownerEmail,
  onAdd,
}: {
  ownerEmail: string;
  onAdd: (resource: Omit<Resource, "id">) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [approved, setApproved] = useState(false);
  const [phase, setPhase] = useState<"idle" | "uploading" | "scanning">("idle");
  const [message, setMessage] = useState("");

  const uploadFile = async (file?: File) => {
    if (!file) return;
    setMessage("");
    setPhase("uploading");
    try {
      if (!approved) throw new Error("Confirm that this resource is already approved to share with students.");
      validateLocalFile(file);
      const session = parseUploadSession(
        await cloudRequest<unknown>("/api/file-uploads/session", { method: "POST" }, ownerEmail),
      );
      const extension = extensionFor(file.name);
      if (
        file.size > session.maxSizeBytes ||
        !session.allowedExtensions.includes(extension) ||
        (file.type && !session.allowedMimeTypes.includes(file.type.toLowerCase()))
      ) {
        throw new Error("That file does not meet the secure upload rules.");
      }

      const uploadUrl = new URL("https://www.filestackapi.com/api/store/S3");
      uploadUrl.searchParams.set("key", session.apiKey);
      uploadUrl.searchParams.set("policy", session.policy);
      uploadUrl.searchParams.set("signature", session.signature);
      uploadUrl.searchParams.set("filename", `${session.filenamePrefix}${file.name}`);
      if (file.type) uploadUrl.searchParams.set("mimetype", file.type);
      const form = new FormData();
      form.append("file", file, file.name);
      const uploadResponse = await fetch(uploadUrl, { method: "POST", body: form, redirect: "error" });
      const uploaded = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok) throw new Error("Filestack could not upload that resource. Try again.");
      const handle = parseFilestackHandle(uploaded);

      setPhase("scanning");
      setMessage("Scanning with ClamAV…");
      const finalized = parseFinalizedResource(
        await cloudRequest<unknown>(
          "/api/file-uploads/finalize",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ handle, uploadReceipt: session.uploadReceipt, originalFilename: file.name }),
          },
          ownerEmail,
        ),
      );
      onAdd({
        title: finalized.title,
        url: finalized.url,
        type: finalized.type,
        relatedTopic: finalized.relatedTopic,
      });
      setMessage(
        `No malware was detected by ClamAV at ${new Date(finalized.scan.scannedAt).toLocaleString()}; ${file.name} was added as a shareable class resource.`,
      );
      setApproved(false);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Secure file upload is unavailable right now.";
      setMessage(/sign in|session expired|cloud account/i.test(detail) ? detail : detail.replace(/FILESTACK[^.]*\.?/gi, "Secure file upload is unavailable."));
    } finally {
      setPhase("idle");
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <section className="filestack-resource-upload" aria-labelledby="filestack-resource-upload-title">
      <div className="filestack-resource-upload-heading">
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          <strong id="filestack-resource-upload-title">Upload a shareable resource</strong>
          <small>PDF, TXT, or Markdown · 10 MB maximum · stored by Filestack · scanned by ClamAV</small>
        </div>
      </div>
      <p>
        Never upload transcripts, rosters, private notes, or student work. Use this only for a file already intended
        for the whole class.
      </p>
      <label className="filestack-resource-consent">
        <input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} />
        <span>This file is already intended for students and contains no personal or private classroom data.</span>
      </label>
      <input
        ref={inputRef}
        aria-label="Choose shareable resource file"
        type="file"
        accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
        onChange={(event) => uploadFile(event.target.files?.[0])}
        hidden
      />
      <button
        className="ghost-button"
        type="button"
        disabled={!approved || phase !== "idle"}
        onClick={() => inputRef.current?.click()}
      >
        <UploadCloud size={16} />
        {phase === "uploading" ? "Uploading…" : phase === "scanning" ? "Scanning…" : "Upload shareable resource"}
      </button>
      {message && (
        <p className="settings-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
