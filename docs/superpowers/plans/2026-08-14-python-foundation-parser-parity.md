# Python Foundation and Parser Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a readable Python 3.12+ ClassLoop package whose models, transcript/roster parsing, session generation, and draft API match the accepted TypeScript import behavior.

**Architecture:** Pydantic models define camelCase JSON contracts. Pure parsing modules contain no HTTP or persistence code. A small FastAPI route calls `build_session_draft`, while the current React app continues using the TypeScript path until Plan 2.

**Tech Stack:** Python 3.12+, FastAPI, Pydantic 2, Uvicorn, httpx, pytest, pytest-cov, Ruff, mypy.

## Global Constraints

- Preserve the existing React interface and public routes.
- Transcript paste/upload and local desktop use must remain functional without paid services.
- Sample Workspace mutations remain memory-only and never call the draft API.
- Generated content remains a teacher-reviewed draft.
- Python modules stay focused and use plain functions before abstractions.
- Minimum Python line coverage is 80%; parser and boundary modules require direct tests.
- Do not remove TypeScript production parsing in this plan.

---

### Task 1: Python package and domain contracts

**Files:**
- Create: `pyproject.toml`
- Create: `python/classloop_core/__init__.py`
- Create: `python/classloop_core/domain/__init__.py`
- Create: `python/classloop_core/domain/models.py`
- Create: `python/tests/unit/test_models.py`

**Interfaces:**
- Produces: `ImportDraftInput`, `Student`, `TranscriptLine`, `StructuredTranscript`, `Resource`, `ActionItem`, `ParticipationEvent`, `StudentFollowUp`, `ImportQualityWarning`, and `SessionDraft` Pydantic models.
- JSON contract: `model_dump(by_alias=True, exclude_none=True)` uses existing camelCase field names.

- [ ] **Step 1: Write the failing model contract test**

```python
from classloop_core.domain.models import ImportDraftInput


def test_import_input_accepts_existing_camel_case_contract() -> None:
    draft = ImportDraftInput.model_validate({
        "title": "Algorithms",
        "template": "CS workshop",
        "transcript": "Maya: What is an algorithm?",
        "notes": "Review precision",
        "roster": "Maya Chen, maya@example.com",
        "resources": "",
        "captureMode": "transcript",
    })
    assert draft.capture_mode == "transcript"
    assert draft.model_dump(by_alias=True)["captureMode"] == "transcript"
```

- [ ] **Step 2: Run RED**

Run: `PYTHONPATH=python python3 -m pytest python/tests/unit/test_models.py -q`

Expected: FAIL because `classloop_core.domain.models` does not exist.

- [ ] **Step 3: Add package metadata and strict Pydantic base models**

```python
def to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class ContractModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")
```

Define the exact unions from `src/types.ts`, require bounded strings/lists where input enters Python, and keep optional output fields optional for current-state compatibility.

Install the declared development dependencies before running the static tools:

```bash
python3 -m pip install -e '.[dev]'
```

- [ ] **Step 4: Run GREEN and static checks**

Run: `PYTHONPATH=python python3 -m pytest python/tests/unit/test_models.py -q && ruff check python && python3 -m mypy python/classloop_core`

Expected: PASS with no lint or type errors.

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml python/classloop_core python/tests/unit/test_models.py
git commit -m "feat: add Python ClassLoop domain contracts"
```

### Task 2: Structured transcripts and speaker extraction

**Files:**
- Create: `python/classloop_core/parsing/__init__.py`
- Create: `python/classloop_core/parsing/transcript.py`
- Create: `python/tests/unit/test_transcript_parser.py`
- Reuse: `tests/fixtures/noisy-zoom-class.vtt`

**Interfaces:**
- Produces: `format_transcript_time(seconds: float | None) -> str`.
- Produces: `structured_transcript_from_text(text: str, *, title: str, source: TranscriptSource, duration_seconds: float | None = None) -> StructuredTranscript`.
- Produces: `extract_transcript_lines(text: str) -> list[TranscriptLine]`.

- [ ] **Step 1: Write failing tests for paste, VTT, Zoom chat, private chat, and teacher filtering**

```python
def test_extracts_multiline_vtt_without_private_or_teacher_lines() -> None:
    text = """WEBVTT
00:00:01.000 --> 00:00:05.000
<v Maya Chen>Diffusion moves particles
from high to low concentration.</v>
00:00:06 From Ms. Rivera To Everyone: Teacher note
00:00:07 From Maya Chen To Ms. Rivera: private answer
"""
    lines = extract_transcript_lines(text)
    assert [(line.speaker, line.text) for line in lines] == [
        ("Maya Chen", "Diffusion moves particles from high to low concentration.")
    ]
```

- [ ] **Step 2: Run RED**

Run: `PYTHONPATH=python python3 -m pytest python/tests/unit/test_transcript_parser.py -q`

Expected: FAIL because the transcript parser is missing.

- [ ] **Step 3: Implement focused transcript helpers**

Port the accepted regex behavior from `src/transcript.ts` and the transcript-only helpers in `src/data.ts`. Keep normalization, metadata filtering, private-message detection, and noise filtering as named functions. Do not port roster or session generation into this module.

- [ ] **Step 4: Run GREEN against synthetic and noisy fixtures**

Run: `PYTHONPATH=python python3 -m pytest python/tests/unit/test_transcript_parser.py -q`

Expected: PASS for paste, VTT, saved chat, multiline cue, pronoun suffix, private-message, bot, teacher, and metadata cases.

- [ ] **Step 5: Commit**

```bash
git add python/classloop_core/parsing python/tests/unit/test_transcript_parser.py
git commit -m "feat: parse classroom transcripts in Python"
```

### Task 3: Roster parsing and speaker matching

**Files:**
- Create: `python/classloop_core/parsing/roster.py`
- Create: `python/tests/unit/test_roster_parser.py`
- Reuse: roster strings in `tests/import-flow.test.ts`

**Interfaces:**
- Produces: `parse_roster(roster: str, transcript: str) -> list[Student]`.
- Produces: `speaker_matches_student(speaker: str, student: Student) -> bool`.
- Produces: `find_unmatched_participants(lines: Sequence[TranscriptLine], roster: Sequence[Student], *, has_explicit_roster: bool) -> list[UnmatchedParticipant]`.

- [ ] **Step 1: Write failing tests for CSV, pipe, numbered, glued, alias, duplicate, blank-email, and transcript-only rosters**

```python
def test_parses_glued_numbered_roster_without_inventing_email() -> None:
    roster = "1Aaliyah Carteracarter@cs4all.nyc2Danny Reyesdreyes@cs4all.nyc3Guest Student"
    students = parse_roster(roster, "")
    assert [(student.name, student.email) for student in students] == [
        ("Aaliyah Carter", "acarter@cs4all.nyc"),
        ("Danny Reyes", "dreyes@cs4all.nyc"),
        ("Guest Student", ""),
    ]
```

- [ ] **Step 2: Run RED**

Run: `PYTHONPATH=python python3 -m pytest python/tests/unit/test_roster_parser.py -q`

Expected: FAIL because roster parsing is missing.

- [ ] **Step 3: Implement roster parsing as small pure functions**

Translate `parseDelimitedRosterRows`, `parseEmailRosterEntries`, glued-name splitting, ID de-duplication, alias cleanup, and transcript-only estimation. Never synthesize an email for a name-only record.

- [ ] **Step 4: Run GREEN and the existing TypeScript import test**

Run: `PYTHONPATH=python python3 -m pytest python/tests/unit/test_roster_parser.py -q && npm run test:import`

Expected: both suites pass.

- [ ] **Step 5: Commit**

```bash
git add python/classloop_core/parsing/roster.py python/tests/unit/test_roster_parser.py
git commit -m "feat: parse classroom rosters in Python"
```

### Task 4: Resources, warnings, and session generation

**Files:**
- Create: `python/classloop_core/parsing/resources.py`
- Create: `python/classloop_core/parsing/session_builder.py`
- Create: `python/tests/contract/test_session_generation.py`
- Create: `python/tests/fixtures/import_cases.json`

**Interfaces:**
- Produces: `parse_resources(explicit_text: str, session_text: str, related_topic: str) -> list[Resource]`.
- Produces: `build_session_draft(input_data: ImportDraftInput, *, clock: Clock = system_clock, id_source: IdSource = random_ids) -> SessionDraft`.
- Determinism boundary: tests inject `clock` and `id_source`; production defaults use UTC time and random IDs.

- [ ] **Step 1: Export deterministic accepted fixtures from current TypeScript behavior**

Add a test-only TypeScript command that replaces generated IDs/timestamps with `<dynamic>`, runs representative CS4All, noisy VTT, empty-input, duplicate-name, transcript-only, and private-chat cases, and writes `python/tests/fixtures/import_cases.json`.

- [ ] **Step 2: Write the failing Python contract test**

```python
@pytest.mark.parametrize("case", load_cases(), ids=lambda case: case["name"])
def test_generated_session_matches_accepted_contract(case: dict[str, object]) -> None:
    actual = normalize_dynamic_fields(build_session_draft(ImportDraftInput.model_validate(case["input"])))
    assert actual == case["expected"]
```

- [ ] **Step 3: Run RED**

Run: `PYTHONPATH=python python3 -m pytest python/tests/contract/test_session_generation.py -q`

Expected: FAIL because resource and session builders are missing.

- [ ] **Step 4: Port the current rules without UI concerns**

Implement topic, assignment, recap, essential-question, attendance, participation, follow-up, action-item, resource, warning, readiness, and unmatched-participant behavior. Split helpers when a function has more than one reason to change. Preserve current safety filters and teacher-review defaults.

- [ ] **Step 5: Run GREEN and focused coverage**

Run: `PYTHONPATH=python python3 -m pytest python/tests/unit python/tests/contract -q --cov=classloop_core.parsing --cov-report=term-missing --cov-fail-under=90`

Expected: all contract cases pass and parsing coverage is at least 90%.

- [ ] **Step 6: Commit**

```bash
git add python/classloop_core/parsing python/tests/contract python/tests/fixtures tests/export-python-import-fixtures.mjs package.json
git commit -m "feat: generate ClassLoop drafts in Python"
```

### Task 5: FastAPI draft boundary and project commands

**Files:**
- Create: `python/classloop_core/api/__init__.py`
- Create: `python/classloop_core/api/app.py`
- Create: `python/classloop_core/api/errors.py`
- Create: `python/classloop_core/api/routes/__init__.py`
- Create: `python/classloop_core/api/routes/drafts.py`
- Create: `python/tests/integration/test_drafts_api.py`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Produces: `create_app() -> FastAPI` and module-level `app`.
- Route: `POST /api/drafts/generate` accepts `ImportDraftInput` and returns `SessionDraft`.
- Error response: `{"error":{"code":str,"message":str,"field":str|null,"retryable":bool}}`.

- [ ] **Step 1: Write failing HTTP tests**

```python
def test_generate_draft_returns_camel_case_contract(client: TestClient) -> None:
    response = client.post("/api/drafts/generate", json=valid_import_payload())
    assert response.status_code == 200
    assert response.json()["status"] == "draft"
    assert "participationEvents" in response.json()


def test_generate_draft_rejects_oversized_transcript(client: TestClient) -> None:
    payload = valid_import_payload() | {"transcript": "x" * 2_000_001}
    response = client.post("/api/drafts/generate", json=payload)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "request_invalid"
```

- [ ] **Step 2: Run RED**

Run: `PYTHONPATH=python python3 -m pytest python/tests/integration/test_drafts_api.py -q`

Expected: FAIL because the FastAPI application is missing.

- [ ] **Step 3: Implement the app, error handler, route, and commands**

Add `test:python`, `test:python:coverage`, and `dev:python` scripts. Keep `npm run dev` unchanged until Plan 2 wires both processes. Document `python3 -m venv .venv`, `.venv/bin/python -m pip install -e '.[dev]'`, and the test command.

- [ ] **Step 4: Run GREEN and the full pre-cutover gate**

Run: `npm run test:python && npm run test:import && npm run build && git diff --check`

Expected: Python tests, current TypeScript import tests, and production build pass.

- [ ] **Step 5: Commit**

```bash
git add python/classloop_core/api python/tests/integration pyproject.toml package.json README.md
git commit -m "feat: expose Python draft generation API"
```
