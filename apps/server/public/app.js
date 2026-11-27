"use strict";

const state = {
  token: sessionStorage.getItem("latent.token") || "",
  fragmentId: null,
  ideaId: null,
  brief: null,
};

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

function setStatus(message, kind = "info") {
  const status = $("status");
  status.textContent = message;
  status.dataset.kind = kind;
}

async function api(path, options = {}) {
  const headers = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const error = body && body.error ? body.error : {
      code: `HTTP_${response.status}`,
      message: text || response.statusText,
    };
    const failure = new Error(error.message || "request failed");
    failure.code = error.code;
    failure.details = error.details;
    failure.status = response.status;
    throw failure;
  }
  return body;
}

function report(error) {
  const details = error && error.details ? ` ${JSON.stringify(error.details)}` : "";
  setStatus(`${(error && error.code) || "ERROR"}: ${(error && error.message) || error}${details}`, "error");
}

function withAction(action) {
  return async (event) => {
    if (event) event.preventDefault();
    try {
      await action(event);
    } catch (error) {
      report(error);
    }
  };
}

$("token").value = state.token;
if (state.token) setStatus("Token loaded for this tab.");

$("token-form").addEventListener("submit", (event) => {
  event.preventDefault();
  state.token = $("token").value.trim();
  if (state.token) {
    sessionStorage.setItem("latent.token", state.token);
    setStatus("Token stored for this tab.", "ok");
  } else {
    sessionStorage.removeItem("latent.token");
    setStatus("Token cleared.");
  }
});

$("clear-token").addEventListener("click", () => {
  state.token = "";
  $("token").value = "";
  sessionStorage.removeItem("latent.token");
  setStatus("Token cleared.");
});

$("capture-form").addEventListener(
  "submit",
  withAction(async () => {
    if (!state.token) {
      throw Object.assign(new Error("set the bearer token first"), { code: "NO_TOKEN" });
    }
    const content = $("fragment").value.trim();
    if (!content) {
      throw Object.assign(new Error("write a fragment first"), { code: "EMPTY_FRAGMENT" });
    }
    setStatus("Capturing...");
    const fragment = await api("/v1/fragments", {
      method: "POST",
      body: JSON.stringify({ content, privacy: "private" }),
    });
    state.fragmentId = fragment.id;
    $("capture-state").textContent = `Fragment ${fragment.id}`;
    setStatus("Developing...");
    const developed = await api("/v1/ideas", {
      method: "POST",
      body: JSON.stringify({ fragment_id: fragment.id, vertical: "igem" }),
    });
    state.ideaId = developed.idea.id;
    setStatus(`Idea ${developed.idea.id} developed.`, "ok");
    await loadIdea();
  }),
);

async function loadIdea() {
  if (!state.ideaId) return;
  const bundle = await api(`/v1/ideas/${encodeURIComponent(state.ideaId)}`);
  renderIdea(bundle);
}

function renderIdea(bundle) {
  $("capture-state").textContent =
    `${bundle.idea.title} · ${bundle.idea.status} · v${bundle.idea.version}`;

  $("assumptions").innerHTML = (bundle.idea.assumptions || [])
    .map((assumption) => {
      const statusClass =
        assumption.status === "confirmed"
          ? "pass"
          : assumption.status === "refuted"
            ? "fail"
            : "unknown";
      return `<li class="card">
        <div>${escapeHtml(assumption.statement)}</div>
        <div class="meta">risk: ${escapeHtml(assumption.risk)} · status: <strong class="status-${statusClass}">${escapeHtml(assumption.status)}</strong></div>
        <div class="actions">
          <button type="button" data-assumption="${escapeHtml(assumption.id)}" data-status="confirmed">Confirm</button>
          <button type="button" class="secondary" data-assumption="${escapeHtml(assumption.id)}" data-status="refuted">Refute</button>
        </div>
      </li>`;
    })
    .join("");

  $("hypotheses").innerHTML = (bundle.idea.hypotheses || [])
    .map(
      (hypothesis) => `<li class="card">
        <strong>${escapeHtml(hypothesis.variant)}</strong>
        <div>${escapeHtml(hypothesis.statement)}</div>
        <div class="meta">confidence ${Number(hypothesis.confidence).toFixed(2)} · basis ${escapeHtml(hypothesis.confidence_basis)}</div>
      </li>`,
    )
    .join("");

  $("gates").innerHTML = (bundle.gates || [])
    .map(
      (gate) => `<div class="card">
        <strong>${escapeHtml(gate.name)}</strong>
        <div class="meta">${escapeHtml(gate.criteria)}</div>
        <div class="meta">falsifier: ${escapeHtml(gate.falsifier)}</div>
        <div class="meta">status: <strong class="status-${escapeHtml(gate.status)}">${escapeHtml(gate.status)}</strong> · ${escapeHtml(gate.fallback)}</div>
        <div class="actions">
          ${["pass", "fail", "unknown", "waive"]
            .map(
              (status) =>
                `<button type="button" class="${status === "pass" ? "" : "secondary"}" data-gate="${escapeHtml(gate.id)}" data-status="${status}">${status}</button>`,
            )
            .join("")}
        </div>
      </div>`,
    )
    .join("");

  renderQuestion(bundle.next_question, bundle.blocking || []);
}

function renderQuestion(question, blocking) {
  $("constraint-summary").textContent =
    blocking.length > 0
      ? `Blocking: ${blocking.join(", ")}`
      : "No blocking constraints.";
  if (!question) {
    $("question").innerHTML =
      '<p class="status-pass">Ready for verification. Confirm the ledger, then decide the gates.</p>';
    return;
  }
  const options = Array.isArray(question.options) ? question.options : [];
  const control = options.length
    ? `<select id="answer-value">${options
        .map(
          (option) =>
            `<option value="${escapeHtml(JSON.stringify(option.value))}">${escapeHtml(option.label)}</option>`,
        )
        .join("")}</select>`
    : '<input id="answer-value" type="text" required>';
  $("question").innerHTML = `<form id="answer-form">
    <p><strong>${escapeHtml(question.prompt)}</strong>${question.blocking ? ' <span class="status-unknown">(blocking)</span>' : ""}</p>
    <label for="answer-value">Answer</label>
    ${control}
    <div class="stack"><button type="submit">Answer</button></div>
  </form>`;

  $("answer-form").addEventListener(
    "submit",
    withAction(async () => {
      const raw = $("answer-value").value;
      let value = raw;
      try {
        value = JSON.parse(raw);
      } catch {
        value = raw;
      }
      setStatus(`Answering ${question.variable}...`);
      await api(`/v1/ideas/${encodeURIComponent(state.ideaId)}/constraints/answer`, {
        method: "POST",
        body: JSON.stringify({ variable: question.variable, value, confidence: 1 }),
      });
      setStatus("Answer recorded as a new version.", "ok");
      await loadIdea();
    }),
  );
}

$("assumptions").addEventListener(
  "click",
  withAction(async (event) => {
    const button = event.target.closest("button[data-assumption]");
    if (!button) return;
    await api(
      `/v1/ideas/${encodeURIComponent(state.ideaId)}/assumptions/${encodeURIComponent(button.dataset.assumption)}/decide`,
      { method: "POST", body: JSON.stringify({ status: button.dataset.status }) },
    );
    setStatus("Assumption decided.", "ok");
    await loadIdea();
  }),
);

$("gates").addEventListener(
  "click",
  withAction(async (event) => {
    const button = event.target.closest("button[data-gate]");
    if (!button) return;
    const status = button.dataset.status;
    let reason = null;
    if (status === "waive") {
      reason = window.prompt("Why is this gate waived? This is recorded.");
      if (!reason) {
        setStatus("A waiver needs a reason.", "error");
        return;
      }
    }
    await api(
      `/v1/ideas/${encodeURIComponent(state.ideaId)}/gates/${encodeURIComponent(button.dataset.gate)}/decide`,
      { method: "POST", body: JSON.stringify({ status, reason }) },
    );
    setStatus("Gate decided.", "ok");
    await loadIdea();
  }),
);

$("compile-brief").addEventListener(
  "click",
  withAction(async () => {
    if (!state.ideaId) {
      throw Object.assign(new Error("develop an idea first"), { code: "NO_IDEA" });
    }
    setStatus("Compiling the brief...");
    state.brief = await api(
      `/v1/ideas/${encodeURIComponent(state.ideaId)}/brief`,
      { method: "POST" },
    );
    renderBrief(state.brief);
    setStatus("Brief compiled.", "ok");
  }),
);

function renderBrief(brief) {
  const list = (items) =>
    items && items.length
      ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : "<p class='hint'>none</p>";
  const risks = (brief.risks || [])
    .map(
      (risk) =>
        `<li><strong>${escapeHtml(risk.risk)}</strong> — trigger: ${escapeHtml(risk.trigger)} · fallback: ${escapeHtml(risk.fallback)}</li>`,
    )
    .join("");
  const collisionCheck = brief.collision_check || {
    status: "not_checked",
    note: "The novelty check did not run; this is not a clean result.",
  };
  const collisions = (brief.collisions || [])
    .map(
      (collision) =>
        `<li>${escapeHtml(collision.kind)}: ${escapeHtml(collision.prior_label)} (${escapeHtml(collision.severity)}) — ${escapeHtml(collision.note)}${collision.source_url ? ` — <a href="${escapeHtml(collision.source_url)}" rel="noreferrer">source</a>` : ""}${collision.claim_ids && collision.claim_ids.length ? ` — claims: ${escapeHtml(collision.claim_ids.join(", "))}` : ""}</li>`,
    )
    .join("");
  const sections = (brief.sections || [])
    .map(
      (section) =>
        `<h3>${escapeHtml(section.title)}</h3><p class="pre">${escapeHtml(section.text)}</p>`,
    )
    .join("");
  const validators = (brief.validators || [])
    .map(
      (validator) =>
        `<li>${escapeHtml(validator.name)}: <strong class="status-${escapeHtml(validator.status)}">${escapeHtml(validator.status)}</strong>${validator.detail ? ` — ${escapeHtml(validator.detail)}` : ""}</li>`,
    )
    .join("");

  $("brief").innerHTML = `
    <h3>${escapeHtml(brief.one_liner)}</h3>
    <p><strong>Problem.</strong> ${escapeHtml(brief.problem?.text || "")}</p>
    <p><strong>Approach.</strong></p>
    <p class="pre">${escapeHtml(brief.approach?.text || "")}</p>
    <h3>Evidence</h3>${list(brief.evidence)}
    <h3>Novelty and collisions</h3>
    <p>Status: <strong class="status-${collisionCheck.status === "checked" ? "pass" : "unknown"}">${escapeHtml(collisionCheck.status)}</strong> — ${escapeHtml(collisionCheck.note)}</p>
    ${collisions ? `<ul>${collisions}</ul>` : ""}
    <h3>Risks</h3>${risks ? `<ul>${risks}</ul>` : "<p class='hint'>none</p>"}
    ${sections}
    <h3>Next steps</h3>${list(brief.next_steps)}
    <h3>Still unknown</h3>${list(brief.unknowns)}
    <h3>Validators</h3>${validators ? `<ul>${validators}</ul>` : "<p class='hint'>none</p>"}
  `;
  $("download-json").disabled = false;
  $("download-md").disabled = false;
}

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function briefToMarkdown(brief) {
  const lines = [];
  lines.push(`# ${brief.one_liner}`, "");
  lines.push("## Problem", "", brief.problem?.text || "", "");
  lines.push("## Approach", "", brief.approach?.text || "", "");
  lines.push("## Evidence", "");
  for (const item of brief.evidence || []) lines.push(`- ${item}`);
  lines.push("", "## Risks", "");
  for (const risk of brief.risks || []) {
    lines.push(`- **${risk.risk}** — trigger: ${risk.trigger} · fallback: ${risk.fallback}`);
  }
  for (const section of brief.sections || []) {
    lines.push("", `## ${section.title}`, "", section.text);
  }
  const collisionCheck = brief.collision_check || {
    status: "not_checked",
    note: "The novelty check did not run; this is not a clean result.",
  };
  lines.push("", "## Novelty and collisions", "", `Status: **${collisionCheck.status}** — ${collisionCheck.note}`);
  for (const collision of brief.collisions || []) {
    lines.push(
      `- ${collision.kind}: ${collision.prior_label} (${collision.severity}) — ${collision.note}${collision.source_url ? ` — ${collision.source_url}` : ""}`,
    );
  }
  lines.push("", "## Next steps", "");
  for (const item of brief.next_steps || []) lines.push(`- ${item}`);
  lines.push("", "## Still unknown", "");
  for (const item of brief.unknowns || []) lines.push(`- ${item}`);
  lines.push("", "## Validators", "");
  for (const validator of brief.validators || []) {
    lines.push(`- ${validator.name}: ${validator.status}${validator.detail ? ` — ${validator.detail}` : ""}`);
  }
  return lines.join("\n") + "\n";
}

$("download-json").addEventListener("click", () => {
  if (!state.brief) return;
  download(`latent-brief-${state.ideaId}.json`, JSON.stringify(state.brief, null, 2), "application/json");
});

$("download-md").addEventListener("click", () => {
  if (!state.brief) return;
  download(`latent-brief-${state.ideaId}.md`, briefToMarkdown(state.brief), "text/markdown");
});
