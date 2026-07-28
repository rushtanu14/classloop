import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const setupGuide = readFileSync(new URL("../supabase/README.md", import.meta.url), "utf8");
const sql = schema
  .replace(/--.*$/gm, " ")
  .replace(/\s+/g, " ")
  .trim();

function policy(name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = sql.match(new RegExp(`create policy "${escapedName}" (.*?);`, "i"));
  assert.ok(match, `Expected ${name} policy to exist`);
  return match[1];
}

function occurrences(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

assert.match(
  sql,
  /revoke update on table public\.classloop_profiles from anon, authenticated;/i,
  "Authenticated clients must not retain table-level profile update privileges",
);
assert.match(
  sql,
  /revoke insert on table public\.classloop_profiles from anon, authenticated;/i,
  "Profile creation must remain on the service-role API path",
);
assert.doesNotMatch(
  sql,
  /create policy "[^"]*" on public\.classloop_profiles for insert/i,
  "Authenticated clients must not have a profile insert policy",
);
assert.doesNotMatch(
  sql,
  /grant update on (?:table )?public\.classloop_profiles to authenticated;/i,
  "A table-level update grant would bypass the profile column boundary",
);

const profileColumnGrants = [...sql.matchAll(
  /grant update \(([^)]*)\) on public\.classloop_profiles to authenticated;/gi,
)].map((match) => match[1].split(",").map((column) => column.trim()).filter(Boolean));
assert.deepEqual(
  profileColumnGrants,
  [["no_training_on_student_data"]],
  "Authenticated profile updates must be limited to the supported privacy preference",
);
for (const serverOwnedColumn of [
  "role",
  "plan_tier",
  "subscription_status",
  "stripe_customer_id",
  "subscription_id",
  "current_period_end",
  "email_delivery_enabled",
]) {
  assert.match(
    sql,
    new RegExp(`revoke update \\([^;]*\\b${serverOwnedColumn}\\b[^;]*\\) on public\\.classloop_profiles from anon, authenticated;`, "i"),
    `${serverOwnedColumn} must remain server-owned`,
  );
}

assert.match(
  sql,
  /add constraint classloop_workspace_state_no_local_identity_check check \(not \(state \? 'accounts'\) and not \(state \? 'billingProfile'\)\);/i,
  "The workspace table must reject local accounts and billing profiles at the database boundary",
);
assert.match(
  sql,
  /revoke insert, update on table public\.classloop_workspace_state from anon, authenticated;/i,
  "Workspace writes must remain on the validated service-role API path",
);
assert.doesNotMatch(
  sql,
  /create policy "[^"]*" on public\.classloop_workspace_state for (?:insert|update)/i,
  "Authenticated clients must not retain a direct workspace write policy",
);

assert.match(
  sql,
  /revoke update on table public\.classloop_submissions from anon, authenticated;/i,
  "Submission identity columns must not retain table-level update privileges",
);
const submissionColumnGrants = [...sql.matchAll(
  /grant update \(([^)]*)\) on public\.classloop_submissions to authenticated;/gi,
)].map((match) => match[1].split(",").map((column) => column.trim()).filter(Boolean));
assert.deepEqual(
  submissionColumnGrants,
  [["status", "note", "submitted_at", "reviewed_at"]],
  "Direct submission updates must not allow publication or student reassignment",
);

const publicationTeacherPolicy = policy("publications_teacher_manage");
assert.match(
  publicationTeacherPolicy,
  /teacher_id = auth\.uid\(\) and public\.classloop_is_class_teacher\(class_id\)/i,
  "A publication must belong to a class the authenticated teacher owns",
);

assert.doesNotMatch(
  sql,
  /create policy "submissions_student_manage"/i,
  "The former unrestricted student submission policy must stay removed",
);

const studentSelectPolicy = policy("submissions_student_select");
assert.match(studentSelectPolicy, /student_id = auth\.uid\(\)/i);
assert.match(studentSelectPolicy, /membership\.user_id = auth\.uid\(\)/i);
assert.match(studentSelectPolicy, /membership\.role = 'student'/i);

const studentInsertPolicy = policy("submissions_student_insert");
assert.match(studentInsertPolicy, /student_id = auth\.uid\(\)/i);
assert.match(studentInsertPolicy, /status in \('todo', 'working', 'submitted'\)/i);
assert.match(studentInsertPolicy, /reviewed_at is null/i);
assert.match(studentInsertPolicy, /membership\.user_id = auth\.uid\(\)/i);
assert.match(studentInsertPolicy, /membership\.role = 'student'/i);

const studentUpdatePolicy = policy("submissions_student_update");
assert.match(studentUpdatePolicy, /using \(/i);
assert.match(studentUpdatePolicy, /with check \(/i);
assert.equal(
  occurrences(studentUpdatePolicy, /status in \('todo', 'working', 'submitted'\)/gi),
  2,
  "Both the existing and replacement submission rows must exclude the teacher-only reviewed status",
);
assert.equal(
  occurrences(studentUpdatePolicy, /reviewed_at is null/gi),
  2,
  "Students must not set or rewrite the teacher-owned review timestamp",
);
assert.equal(
  occurrences(studentUpdatePolicy, /membership\.role = 'student'/gi),
  2,
  "Student membership must be checked before and after an update",
);

const teacherUpdatePolicy = policy("submissions_teacher_update");
assert.match(teacherUpdatePolicy, /publication\.teacher_id = auth\.uid\(\)/i);
assert.match(teacherUpdatePolicy, /public\.classloop_is_class_teacher\(publication\.class_id\)/i);
assert.match(teacherUpdatePolicy, /membership\.user_id = student_id/i);
assert.match(teacherUpdatePolicy, /membership\.role = 'student'/i);

for (const origin of [
  "https://classloop-followup.vercel.app",
  "http://127.0.0.1:5177",
  "http://localhost:5177",
]) {
  assert.ok(
    setupGuide.includes(`${origin}/#/billing?cloud=confirmed`),
    `Expected the billing confirmation redirect for ${origin}`,
  );
  assert.ok(
    setupGuide.includes(`${origin}/#/dashboard?cloud=confirmed`),
    `Expected the account confirmation redirect for ${origin}`,
  );
}
assert.match(setupGuide, /VITE_CLASSLOOP_PUBLIC_URL/);
assert.match(setupGuide, /add both of\s+those exact hash routes/i);

console.log("Supabase profile, workspace, submission, and redirect policies passed.");
