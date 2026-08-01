import { CheckCircle2, ChevronRight, CircleAlert, Link2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cloudRequest } from "../cloud";
import {
  createDefaultIntegrationFieldDecisions,
  type IntegrationDraftPatch,
  type IntegrationFieldDecision,
  type IntegrationFieldDecisions,
  type IntegrationImportField,
  type IntegrationRecordCandidate,
} from "../integration-imports";

export type IntegrationWizardToolkit = {
  id: string;
  label: string;
  purpose?: string;
  authConfigured: boolean;
  authConfigEnv: string;
  authProvisioning?: string;
  allowedTools: string[];
};

export type IntegrationWizardConnection = {
  integrationId: string;
  connectionStatus: string;
  connected: boolean;
};

export type IntegrationWizardQueryField = {
  label: string;
  placeholder: string;
  required: boolean;
};

type IntegrationRecordsResponse = {
  integrationId: string;
  records: IntegrationRecordCandidate[];
  truncated?: boolean;
};

type IntegrationImportPreviewResponse = {
  patch: IntegrationDraftPatch;
};

export type PreparedIntegrationImport = {
  patch: IntegrationDraftPatch;
  decisions: IntegrationFieldDecisions;
};

type IntegrationImportWizardProps = {
  toolkit: IntegrationWizardToolkit;
  connection?: IntegrationWizardConnection;
  authEmail: string;
  queryField?: IntegrationWizardQueryField;
  connecting: boolean;
  onConnect: () => Promise<void>;
  onRefresh: () => void;
  onClose: () => void;
  onManualImport: () => void;
  onPrepared: (prepared: PreparedIntegrationImport) => void;
};

type WizardStep = "connect" | "choose" | "review" | "import";

const wizardSteps: Array<{ id: WizardStep; label: string }> = [
  { id: "connect", label: "Connect" },
  { id: "choose", label: "Choose" },
  { id: "review", label: "Review" },
  { id: "import", label: "Import" },
];

const fieldLabels: Record<IntegrationImportField, string> = {
  title: "Session title",
  transcript: "Transcript",
  notes: "Teacher notes",
  roster: "Roster",
  resources: "Resources",
};

function customSetupInstructions(toolkit: IntegrationWizardToolkit) {
  if (toolkit.id === "google_classroom" || toolkit.id === "googleforms") {
    return "An administrator must add a custom Google OAuth app with the required school scopes. Secrets stay on the server.";
  }
  if (toolkit.id === "canvas") {
    return "Your school administrator must provide the Canvas institution URL and approved OAuth or API credentials on the server.";
  }
  if (toolkit.id === "blackboard") {
    return "Your institution must approve Blackboard OAuth and configure it on the server.";
  }
  return `An administrator must configure ${toolkit.authConfigEnv} on the ClassLoop server.`;
}

function patchFieldSummary(patch: IntegrationDraftPatch, field: IntegrationImportField) {
  const value = patch.fields[field];
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return "No content";
    return normalized.length > 420 ? `${normalized.slice(0, 420)}…` : normalized;
  }
  if (Array.isArray(value)) {
    if (!value.length) return "No content";
    if (field === "notes") {
      const joined = value.filter((item): item is string => typeof item === "string").join("\n\n");
      return joined.length > 420 ? `${joined.slice(0, 420)}…` : joined;
    }
    if (field === "roster") {
      return `${value.length} student${value.length === 1 ? "" : "s"} ready to review`;
    }
    if (field === "resources") {
      return `${value.length} resource${value.length === 1 ? "" : "s"} ready to review`;
    }
  }
  return "No content";
}

function stepIndex(step: WizardStep) {
  return wizardSteps.findIndex((candidate) => candidate.id === step);
}

export function IntegrationImportWizard({
  toolkit,
  connection,
  authEmail,
  queryField,
  connecting,
  onConnect,
  onRefresh,
  onClose,
  onManualImport,
  onPrepared,
}: IntegrationImportWizardProps) {
  const [step, setStep] = useState<WizardStep>(connection?.connected ? "choose" : "connect");
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<IntegrationRecordCandidate[]>([]);
  const [selectedRecordKey, setSelectedRecordKey] = useState("");
  const [patch, setPatch] = useState<IntegrationDraftPatch | null>(null);
  const [decisions, setDecisions] = useState<IntegrationFieldDecisions | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [truncated, setTruncated] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const requestInFlightRef = useRef(false);
  const activeStepIndex = stepIndex(step);
  const connected = Boolean(connection?.connected);
  const queryReady = !queryField?.required || Boolean(query.trim());
  const selectedRecord = records.find((record) => record.selectionKey === selectedRecordKey);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (connected && step === "connect") setStep("choose");
  }, [connected, step]);

  useEffect(() => {
    setStep(connection?.connected ? "choose" : "connect");
    setQuery("");
    setRecords([]);
    setSelectedRecordKey("");
    setPatch(null);
    setDecisions(null);
    setError("");
    setStatus("");
    setTruncated(false);
  }, [toolkit.id]);

  const availableFields = useMemo(
    () =>
      patch
        ? (Object.keys(patch.fields) as IntegrationImportField[]).filter((field) => {
            const value = patch.fields[field];
            return typeof value === "string" ? Boolean(value.trim()) : Array.isArray(value) && value.length > 0;
          })
        : [],
    [patch],
  );

  const loadRecords = async () => {
    if (!connected || requestInFlightRef.current || !queryReady) return;
    requestInFlightRef.current = true;
    setBusy(true);
    setError("");
    setStatus(`Loading ${toolkit.label} sources…`);
    setPatch(null);
    setDecisions(null);
    try {
      const response = await cloudRequest<IntegrationRecordsResponse>(
        "/api/integrations/records",
        {
          method: "POST",
          body: JSON.stringify({
            integrationId: toolkit.id,
            ...(query.trim() ? { query: query.trim().slice(0, 240) } : {}),
          }),
        },
        authEmail,
      );
      if (response.integrationId !== toolkit.id || !Array.isArray(response.records)) {
        throw new Error("The provider returned an invalid source list.");
      }
      setRecords(response.records);
      setSelectedRecordKey(response.records.length === 1 ? response.records[0].selectionKey : "");
      setTruncated(Boolean(response.truncated));
      setStatus(
        response.records.length
          ? `${response.records.length} source${response.records.length === 1 ? "" : "s"} ready to choose.`
          : `No ${toolkit.label} sources matched this request.`,
      );
    } catch (loadError) {
      setRecords([]);
      setSelectedRecordKey("");
      setError(loadError instanceof Error ? loadError.message : `Unable to load ${toolkit.label} sources.`);
      setStatus("");
    } finally {
      requestInFlightRef.current = false;
      setBusy(false);
    }
  };

  const reviewSelectedRecord = async () => {
    if (!selectedRecordKey || requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setBusy(true);
    setError("");
    setStatus("Building a normalized ClassLoop preview…");
    try {
      const response = await cloudRequest<IntegrationImportPreviewResponse>(
        "/api/integrations/import-preview",
        {
          method: "POST",
          body: JSON.stringify({
            integrationId: toolkit.id,
            ...(query.trim() ? { query: query.trim().slice(0, 240) } : {}),
            selectionKey: selectedRecordKey,
          }),
        },
        authEmail,
      );
      if (
        response.patch?.schemaVersion !== 1 ||
        response.patch.integrationId !== toolkit.id ||
        !response.patch.fields
      ) {
        throw new Error("The provider returned an invalid import preview.");
      }
      setPatch(response.patch);
      setDecisions(createDefaultIntegrationFieldDecisions(response.patch));
      setStep("review");
      setStatus("Review each field before it enters ClassLoop.");
    } catch (reviewError) {
      setPatch(null);
      setDecisions(null);
      setError(reviewError instanceof Error ? reviewError.message : "Unable to build the import preview.");
      setStatus("");
    } finally {
      requestInFlightRef.current = false;
      setBusy(false);
    }
  };

  const prepareImport = () => {
    if (!patch || !decisions) return;
    setStep("import");
    onPrepared({ patch, decisions });
  };

  return (
    <section
      className="integration-import-flow"
      data-testid="integration-flow"
      aria-label={`${toolkit.label} connection and import`}
      aria-busy={busy}
    >
      <div className="integration-flow-heading">
        <div>
          <span className="eyebrow">Guided connection</span>
          <h3 ref={headingRef} tabIndex={-1}>
            {toolkit.label}: {wizardSteps[activeStepIndex]?.label}
          </h3>
          <p>{toolkit.purpose || `Connect and review ${toolkit.label} records before importing.`}</p>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label={`Close ${toolkit.label} setup`}>
          <X size={18} />
        </button>
      </div>

      <ol className="integration-step-list" aria-label={`${toolkit.label} setup steps`}>
        {wizardSteps.map((candidate, index) => {
          const complete = index < activeStepIndex;
          const current = candidate.id === step;
          return (
            <li
              key={candidate.id}
              data-flow-step={candidate.id}
              aria-current={current ? "step" : undefined}
              className={complete ? "complete" : current ? "current" : ""}
            >
              <span>{complete ? <CheckCircle2 size={16} /> : index + 1}</span>
              {candidate.label}
            </li>
          );
        })}
      </ol>

      {step === "connect" && (
        <div className="integration-flow-body">
          {!toolkit.authConfigured ? (
            <div className="integration-admin-setup" data-testid="integration-admin-setup">
              <CircleAlert size={20} />
              <div>
                <strong>Administrator setup required</strong>
                <p>{customSetupInstructions(toolkit)}</p>
                <small>Do not paste OAuth secrets, institution tokens, or app passwords into this page.</small>
              </div>
            </div>
          ) : (
            <div className="integration-connection-check">
              <ShieldCheck size={22} />
              <div>
                <strong>{connected ? `${toolkit.label} is connected` : `Authorize ${toolkit.label}`}</strong>
                <p>
                  {connected
                    ? "ClassLoop can make the allowlisted read-only requests shown below."
                    : "A trusted Composio page will handle provider consent. Provider credentials never pass through ClassLoop."}
                </p>
              </div>
            </div>
          )}
          <div className="button-row">
            {toolkit.authConfigured && !connected && (
              <button className="primary-button" type="button" onClick={() => void onConnect()} disabled={connecting}>
                <Link2 size={17} />
                {connecting ? "Opening provider…" : `Connect ${toolkit.label}`}
              </button>
            )}
            {toolkit.authConfigured && (
              <button className="ghost-button" type="button" onClick={onRefresh}>
                <RefreshCw size={16} />
                Check {toolkit.label} connection
              </button>
            )}
            <button className="text-button" type="button" onClick={onManualImport}>
              Continue with manual import
            </button>
          </div>
        </div>
      )}

      {step === "choose" && connected && (
        <div className="integration-flow-body">
          {queryField && (
            <label className="field compact">
              <span>{queryField.label}</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value.slice(0, 240))}
                maxLength={240}
                placeholder={queryField.placeholder}
              />
              <small>
                {queryField.required ? "Required. " : "Optional. "}
                ClassLoop sends this reference only when you request the source list.
              </small>
            </label>
          )}
          <div className="button-row">
            <button className="primary-button" type="button" onClick={() => void loadRecords()} disabled={busy || !queryReady}>
              {busy ? "Loading sources…" : `Load ${toolkit.label} sources`}
            </button>
            <button className="text-button" type="button" onClick={onManualImport}>
              Use manual import
            </button>
          </div>

          {records.length > 0 && (
            <fieldset className="integration-source-list" aria-label={`${toolkit.label} sources`}>
              <legend>Choose one source</legend>
              {records.map((record) => (
                <label key={record.selectionKey} className="integration-source-option">
                  <input
                    type="radio"
                    name={`${toolkit.id}-source`}
                    value={record.selectionKey}
                    checked={selectedRecordKey === record.selectionKey}
                    onChange={() => setSelectedRecordKey(record.selectionKey)}
                  />
                  <span>
                    <strong>{record.title}</strong>
                    {record.subtitle && <small>{record.subtitle}</small>}
                    <small>{record.availableFields.map((field) => fieldLabels[field]).join(" · ")}</small>
                  </span>
                  <ChevronRight size={17} />
                </label>
              ))}
            </fieldset>
          )}
          {truncated && (
            <p className="settings-message warning" role="status">
              The provider had more records than this bounded page. Narrow the search to find a different source.
            </p>
          )}
          {records.length > 0 && (
            <button
              className="primary-button"
              type="button"
              onClick={() => void reviewSelectedRecord()}
              disabled={!selectedRecordKey || busy}
            >
              Review selected source
            </button>
          )}
        </div>
      )}

      {step === "review" && patch && decisions && (
        <div
          className="integration-flow-body"
          role="region"
          aria-label={`${toolkit.label} import review`}
          data-testid="integration-import-review"
        >
          <div className="integration-source-summary">
            <strong>{patch.sourceLabel || selectedRecord?.title || `${toolkit.label} source`}</strong>
            <small>Normalized by ClassLoop. Raw provider JSON and provider identifiers are not kept.</small>
          </div>
          <div className="integration-field-review">
            {availableFields.map((field) => {
              const decision = decisions[field];
              return (
                <div className="integration-field-row" key={field}>
                  <label>
                    <input
                      type="checkbox"
                      checked={decision.include}
                      onChange={(event) =>
                        setDecisions((current) =>
                          current
                            ? {
                                ...current,
                                [field]: { ...current[field], include: event.target.checked },
                              }
                            : current,
                        )
                      }
                    />
                    <span>
                      <strong>{fieldLabels[field]}</strong>
                      <small>{patchFieldSummary(patch, field)}</small>
                    </span>
                  </label>
                  <label className="field compact">
                    <span>When ClassLoop already has content</span>
                    <select
                      value={decision.mode}
                      disabled={!decision.include}
                      onChange={(event) =>
                        setDecisions((current) =>
                          current
                            ? {
                                ...current,
                                [field]: {
                                  ...current[field],
                                  mode: event.target.value as IntegrationFieldDecision["mode"],
                                },
                              }
                            : current,
                        )
                      }
                    >
                      <option value="fill-empty">Fill only if empty</option>
                      <option value="append">Append and deduplicate</option>
                      <option value="replace">Replace existing content</option>
                    </select>
                  </label>
                </div>
              );
            })}
          </div>
          {patch.warnings.map((warning) => (
            <p className="settings-message warning" role="status" key={`${warning.code}-${warning.message}`}>
              {warning.message}
            </p>
          ))}
          <div className="integration-read-only-receipt">
            <ShieldCheck size={18} />
            <span>
              <strong>Read-only provider access</strong>
              <small>Nothing will be sent, posted, edited, shared, or deleted in {toolkit.label}.</small>
            </span>
          </div>
          <div className="button-row">
            <button className="primary-button" type="button" onClick={prepareImport}>
              Continue to New Session
            </button>
            <button className="ghost-button" type="button" onClick={() => setStep("choose")}>
              Choose another source
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="settings-message danger" role="alert" data-testid="integration-flow-error">
          {error}
        </p>
      )}
      {status && (
        <p className="settings-message" role="status">
          {status}
        </p>
      )}
    </section>
  );
}
