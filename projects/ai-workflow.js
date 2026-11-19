(() => {
  const STORAGE_KEY = "mp-ai-workflow-v1";
  const NODE_W = 220;
  const NODE_H = 116;
  const CANVAS_W = 1200;
  const CANVAS_H = 760;

  const nodeDefaults = {
    goal: { title: "Define the goal", instructions: "State the outcome the AI should achieve and what a successful result looks like." },
    context: { title: "Provide context", instructions: "Give the background, audience, constraints, and relevant environment before the task begins." },
    input: { title: "Collect the input", instructions: "Identify the information the AI must receive. Ask for missing details instead of guessing." },
    analyze: { title: "Analyze the evidence", instructions: "Review the supplied information, identify patterns or gaps, and reason through the task step by step." },
    generate: { title: "Create the draft", instructions: "Produce the requested result using the context, evidence, and constraints from the earlier steps." },
    validate: { title: "Validate the result", instructions: "Check accuracy, completeness, clarity, safety, and compliance with the requested format." },
    decision: { title: "Choose the next path", instructions: "Compare the available options against the goal and explain the selected path before continuing." },
    output: { title: "Format the final output", instructions: "Return the approved result in a concise, usable format with clear headings and next actions." }
  };

  const templates = {
    support: {
      name: "Support triage workflow",
      nodes: [
        ["goal", "Resolve the support request", "Identify the most likely issue, provide safe troubleshooting steps, and produce a useful ticket summary.", "success_criteria"],
        ["input", "Collect device details", "Gather the device type, operating system, symptoms, error messages, recent changes, urgency, and steps already attempted.", "device_type\noperating_system\nsymptoms\nerror_messages"],
        ["analyze", "Triage the symptoms", "Separate confirmed facts from assumptions. Rank likely causes and identify any safety, data-loss, or access risks.", ""],
        ["validate", "Check the plan", "Confirm that each step is reversible, appropriate for the user's skill level, and avoids unsupported claims.", ""],
        ["output", "Create the support response", "Return a short diagnosis, numbered troubleshooting plan, escalation trigger, and ITSM-ready summary.", "output_format"]
      ]
    },
    research: {
      name: "Research brief workflow",
      nodes: [
        ["goal", "Define the research question", "Convert the request into a focused question with a clear decision or deliverable.", "research_question"],
        ["context", "Set scope and standards", "Define the audience, date range, region, source quality requirements, and exclusions.", "audience\ndate_range\nregion"],
        ["input", "Review the source material", "Use the supplied sources and identify missing evidence that requires verification.", "sources"],
        ["analyze", "Compare the evidence", "Group areas of agreement, conflict, uncertainty, and practical significance.", ""],
        ["validate", "Audit the claims", "Check that important factual claims are traceable to credible sources and label any inference.", ""],
        ["output", "Write the research brief", "Return an executive summary, key findings, limitations, and recommended next steps.", "output_length"]
      ]
    },
    content: {
      name: "Content workflow",
      nodes: [
        ["goal", "Define the message", "State what the content should communicate and the action the audience should take.", "topic\ncall_to_action"],
        ["context", "Set voice and audience", "Describe the audience, tone, channel, brand style, and words or claims to avoid.", "audience\ntone\nchannel"],
        ["input", "Collect source points", "Use the supplied facts, examples, links, and required messages. Do not invent unsupported details.", "source_points"],
        ["generate", "Draft the content", "Create a strong opening, organized body, and natural closing appropriate to the channel.", ""],
        ["validate", "Edit for quality", "Remove repetition, vague language, filler, and unsupported claims. Preserve the requested voice.", ""],
        ["output", "Deliver the final copy", "Return the polished copy first, followed by two optional headline alternatives.", "word_limit"]
      ]
    },
    troubleshoot: {
      name: "Technical troubleshooting workflow",
      nodes: [
        ["goal", "Define the failure", "Describe the expected behavior, actual behavior, scope, impact, and success condition.", "expected_behavior\nactual_behavior"],
        ["input", "Collect evidence", "Gather exact errors, logs, versions, recent changes, reproduction steps, and environmental details.", "errors\nlogs\nversions\nrecent_changes"],
        ["analyze", "Build hypotheses", "Rank likely causes by evidence, impact, and ease of safe verification. Distinguish correlation from cause.", ""],
        ["decision", "Choose a test", "Select the lowest-risk test that best separates the leading hypotheses. State the expected result for each outcome.", ""],
        ["validate", "Verify the fix", "Confirm the original failure is resolved, check for side effects, and identify rollback or escalation conditions.", ""],
        ["output", "Document the resolution", "Return root cause, evidence, actions taken, validation, prevention, and an ITSM-ready closure note.", "ticket_number"]
      ]
    }
  };

  const els = {
    canvas: document.querySelector("[data-workflow-canvas]"),
    nodeLayer: document.querySelector("[data-node-layer]"),
    connections: document.querySelector("[data-connections]"),
    empty: document.querySelector("[data-empty-state]"),
    name: document.querySelector("[data-workflow-name]"),
    count: document.querySelector("[data-node-count]"),
    form: document.querySelector("[data-inspector-form]"),
    inspectorEmpty: document.querySelector("[data-inspector-empty]"),
    type: document.querySelector("[data-node-type]"),
    title: document.querySelector("[data-node-title]"),
    instructions: document.querySelector("[data-node-instructions]"),
    variables: document.querySelector("[data-node-variables]"),
    output: document.querySelector("[data-prompt-output]"),
    stats: document.querySelector("[data-prompt-stats]"),
    saveStatus: document.querySelector("[data-save-status]"),
    template: document.querySelector("#template-select"),
    importInput: document.querySelector("#workflow-import"),
    toast: document.querySelector("[data-toast]")
  };

  let workflow = loadSavedWorkflow() || makeTemplate("support");
  let selectedId = workflow.nodes[0]?.id || null;
  let toastTimer;

  function makeId() {
    return `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function makeTemplate(key) {
    const template = templates[key] || templates.support;
    return {
      name: template.name,
      nodes: template.nodes.map((entry, index) => {
        const position = defaultPosition(index);
        return {
          id: makeId(),
          type: entry[0],
          title: entry[1],
          instructions: entry[2],
          variables: entry[3],
          x: position.x,
          y: position.y
        };
      })
    };
  }

  function defaultPosition(index) {
    const row = Math.floor(index / 3);
    const offset = index % 3;
    const column = row % 2 === 0 ? offset : 2 - offset;
    return { x: 55 + column * 285, y: 55 + row * 190 };
  }

  function loadSavedWorkflow() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || !Array.isArray(saved.nodes)) return null;
      return sanitizeWorkflow(saved);
    } catch {
      return null;
    }
  }

  function sanitizeWorkflow(candidate) {
    const nodes = (candidate.nodes || []).slice(0, 30).map((node, index) => {
      const type = nodeDefaults[node.type] ? node.type : "analyze";
      const position = defaultPosition(index);
      return {
        id: String(node.id || makeId()),
        type,
        title: String(node.title || nodeDefaults[type].title).slice(0, 70),
        instructions: String(node.instructions || nodeDefaults[type].instructions).slice(0, 900),
        variables: String(node.variables || "").slice(0, 300),
        x: clamp(Number(node.x) || position.x, 12, CANVAS_W - NODE_W - 12),
        y: clamp(Number(node.y) || position.y, 12, CANVAS_H - NODE_H - 12)
      };
    });
    return { name: String(candidate.name || "AI workflow").slice(0, 80), nodes };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workflow));
    els.saveStatus.textContent = "Saved locally";
  }

  function render() {
    els.name.textContent = workflow.name;
    els.count.textContent = `${workflow.nodes.length} ${workflow.nodes.length === 1 ? "step" : "steps"}`;
    els.empty.hidden = workflow.nodes.length > 0;
    els.nodeLayer.innerHTML = workflow.nodes.map((node, index) => nodeMarkup(node, index)).join("");
    els.nodeLayer.querySelectorAll(".workflow-node").forEach(bindNode);
    renderInspector();
    requestAnimationFrame(renderConnections);
  }

  function nodeMarkup(node, index) {
    const letter = node.type === "generate" ? "W" : node.type.charAt(0).toUpperCase();
    return `<button class="workflow-node${node.id === selectedId ? " is-selected" : ""}" type="button" data-node-id="${escapeHtml(node.id)}" style="left:${node.x}px;top:${node.y}px" aria-label="Step ${index + 1}: ${escapeHtml(node.title)}">
      <span class="node-port in" aria-hidden="true"></span>
      <span class="node-top"><span class="node-icon ${escapeHtml(node.type)}">${letter}</span><span class="node-order">STEP ${String(index + 1).padStart(2, "0")}</span></span>
      <h3>${escapeHtml(node.title)}</h3><p>${escapeHtml(node.instructions)}</p>
      <span class="node-port out" aria-hidden="true"></span>
    </button>`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
  }

  function bindNode(element) {
    const id = element.dataset.nodeId;
    let drag = null;

    element.addEventListener("click", () => selectNode(id));
    element.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      const node = workflow.nodes.find(item => item.id === id);
      if (!node) return;
      selectNode(id);
      drag = { startX: event.clientX, startY: event.clientY, nodeX: node.x, nodeY: node.y, moved: false };
      element.setPointerCapture(event.pointerId);
      element.classList.add("is-dragging");
    });
    element.addEventListener("pointermove", event => {
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      const node = workflow.nodes.find(item => item.id === id);
      node.x = clamp(drag.nodeX + dx, 12, CANVAS_W - NODE_W - 12);
      node.y = clamp(drag.nodeY + dy, 12, CANVAS_H - NODE_H - 12);
      element.style.left = `${node.x}px`;
      element.style.top = `${node.y}px`;
      renderConnections();
    });
    element.addEventListener("pointerup", event => {
      if (!drag) return;
      element.releasePointerCapture(event.pointerId);
      element.classList.remove("is-dragging");
      if (drag.moved) save();
      drag = null;
    });
  }

  function renderConnections() {
    const paths = [];
    workflow.nodes.slice(0, -1).forEach((node, index) => {
      const next = workflow.nodes[index + 1];
      const x1 = node.x + NODE_W;
      const y1 = node.y + NODE_H / 2;
      const x2 = next.x;
      const y2 = next.y + NODE_H / 2;
      const bend = Math.max(55, Math.abs(x2 - x1) * .45);
      paths.push(`<path class="connection-path" d="M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}"></path><circle class="connection-dot" cx="${x2}" cy="${y2}" r="6"></circle>`);
    });
    els.connections.setAttribute("viewBox", `0 0 ${CANVAS_W} ${CANVAS_H}`);
    els.connections.innerHTML = paths.join("");
  }

  function selectNode(id) {
    selectedId = id;
    els.nodeLayer.querySelectorAll(".workflow-node").forEach(node => node.classList.toggle("is-selected", node.dataset.nodeId === id));
    renderInspector();
  }

  function selectedNode() {
    return workflow.nodes.find(node => node.id === selectedId) || null;
  }

  function renderInspector() {
    const node = selectedNode();
    els.form.hidden = !node;
    els.inspectorEmpty.hidden = Boolean(node);
    if (!node) return;
    els.type.value = node.type;
    els.title.value = node.title;
    els.instructions.value = node.instructions;
    els.variables.value = node.variables;
    const index = workflow.nodes.indexOf(node);
    document.querySelector("[data-move-earlier]").disabled = index <= 0;
    document.querySelector("[data-move-later]").disabled = index >= workflow.nodes.length - 1;
  }

  function updateSelected(field, value) {
    const node = selectedNode();
    if (!node) return;
    node[field] = value;
    save();
    const element = els.nodeLayer.querySelector(`[data-node-id="${CSS.escape(node.id)}"]`);
    if (!element) return;
    if (field === "title") {
      element.querySelector("h3").textContent = value || "Untitled step";
      const index = workflow.nodes.indexOf(node);
      element.setAttribute("aria-label", `Step ${index + 1}: ${value || "Untitled step"}`);
    }
    if (field === "instructions") element.querySelector("p").textContent = value || "No instructions yet.";
  }

  function addNode(type) {
    const defaults = nodeDefaults[type] || nodeDefaults.analyze;
    const index = workflow.nodes.length;
    const position = defaultPosition(index);
    const node = {
      id: makeId(), type,
      title: defaults.title,
      instructions: defaults.instructions,
      variables: "",
      x: position.x,
      y: position.y
    };
    node.x = clamp(node.x, 12, CANVAS_W - NODE_W - 12);
    node.y = clamp(node.y, 12, CANVAS_H - NODE_H - 12);
    workflow.nodes.push(node);
    selectedId = node.id;
    save();
    render();
    showToast(`${node.title} added`);
  }

  function moveSelected(direction) {
    const index = workflow.nodes.findIndex(node => node.id === selectedId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= workflow.nodes.length) return;
    [workflow.nodes[index], workflow.nodes[target]] = [workflow.nodes[target], workflow.nodes[index]];
    save();
    render();
  }

  function deleteSelected() {
    const index = workflow.nodes.findIndex(node => node.id === selectedId);
    if (index < 0) return;
    const removed = workflow.nodes[index];
    workflow.nodes.splice(index, 1);
    selectedId = workflow.nodes[Math.min(index, workflow.nodes.length - 1)]?.id || null;
    save();
    render();
    showToast(`${removed.title} removed`);
  }

  function generatePrompt() {
    if (!workflow.nodes.length) {
      showToast("Add at least one workflow step first");
      return "";
    }
    const variableSet = new Set();
    workflow.nodes.forEach(node => node.variables.split(/\r?\n|,/).map(item => item.trim()).filter(Boolean).forEach(item => variableSet.add(item)));
    const variables = [...variableSet];
    const steps = workflow.nodes.map((node, index) => {
      const vars = node.variables.split(/\r?\n|,/).map(item => item.trim()).filter(Boolean);
      return `STEP ${index + 1} — ${node.title.toUpperCase()}\n${node.instructions.trim()}${vars.length ? `\nUse these inputs: ${vars.map(item => `{{${item.replace(/[{}]/g, "")}}}`).join(", ")}.` : ""}`;
    }).join("\n\n");
    const prompt = `# ${workflow.name}\n\n## ROLE AND OBJECTIVE\nFollow the workflow below in order. Complete each step before moving to the next. If essential information is missing, ask focused questions instead of inventing details.\n\n## WORKFLOW\n${steps}\n\n## WORKING RULES\n- Separate confirmed facts from assumptions.\n- Preserve the user's constraints and requested tone.\n- Explain uncertainty when it affects the result.\n- Do not expose private reasoning; provide concise conclusions and useful supporting evidence.\n- Stop and flag safety, privacy, authorization, or data-loss risks before recommending an irreversible action.\n${variables.length ? `\n## INPUT VARIABLES\n${variables.map(item => `- {{${item.replace(/[{}]/g, "")}}}: [enter value]`).join("\n")}\n` : ""}\n## FINAL RESPONSE\nReturn the final result only after the workflow and validation steps are complete. Make the response easy to scan and ready to use.`;
    els.output.value = prompt;
    updatePromptStats();
    localStorage.setItem(`${STORAGE_KEY}-prompt`, prompt);
    showToast("Prompt generated from the visual workflow");
    return prompt;
  }

  function updatePromptStats() {
    const words = (els.output.value.trim().match(/\S+/g) || []).length;
    els.stats.textContent = `${workflow.nodes.length} ${workflow.nodes.length === 1 ? "step" : "steps"} · ${words} ${words === 1 ? "word" : "words"}`;
  }

  async function copyPrompt() {
    const value = els.output.value || generatePrompt();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      els.output.focus();
      els.output.select();
      document.execCommand("copy");
    }
    showToast("Prompt copied to clipboard");
  }

  function download(filename, content, type) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([content], { type }));
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 500);
  }

  function exportWorkflow() {
    download("ai-workflow.json", JSON.stringify(workflow, null, 2), "application/json");
    showToast("Workflow JSON exported");
  }

  function importWorkflow(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        workflow = sanitizeWorkflow(JSON.parse(reader.result));
        selectedId = workflow.nodes[0]?.id || null;
        save();
        render();
        generatePrompt();
        showToast("Workflow imported");
      } catch {
        showToast("That file is not a valid workflow JSON file");
      }
      els.importInput.value = "";
    };
    reader.readAsText(file);
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    toastTimer = setTimeout(() => els.toast.classList.remove("is-visible"), 2400);
  }

  document.querySelectorAll("[data-add-node]").forEach(button => button.addEventListener("click", () => addNode(button.dataset.addNode)));
  document.querySelector("[data-load-template]").addEventListener("click", () => {
    workflow = makeTemplate(els.template.value);
    selectedId = workflow.nodes[0]?.id || null;
    els.canvas.scrollTo({ left: 0, top: 0 });
    save(); render(); generatePrompt(); showToast(`${workflow.name} loaded`);
  });
  document.querySelector("[data-new-workflow]").addEventListener("click", () => {
    workflow = { name: "Untitled AI workflow", nodes: [] };
    selectedId = null;
    els.canvas.scrollTo({ left: 0, top: 0 });
    els.output.value = "";
    save(); render(); updatePromptStats(); showToast("New workflow ready");
  });
  document.querySelector("[data-move-earlier]").addEventListener("click", () => moveSelected(-1));
  document.querySelector("[data-move-later]").addEventListener("click", () => moveSelected(1));
  document.querySelector("[data-delete-node]").addEventListener("click", deleteSelected);
  document.querySelector("[data-generate]").addEventListener("click", generatePrompt);
  document.querySelector("[data-copy]").addEventListener("click", copyPrompt);
  document.querySelector("[data-download]").addEventListener("click", () => {
    const value = els.output.value || generatePrompt();
    if (value) download("ai-workflow-prompt.txt", value, "text/plain");
  });
  document.querySelector("[data-export]").addEventListener("click", exportWorkflow);
  document.querySelector("[data-import]").addEventListener("click", () => els.importInput.click());
  els.importInput.addEventListener("change", () => importWorkflow(els.importInput.files[0]));
  els.title.addEventListener("input", event => updateSelected("title", event.target.value));
  els.instructions.addEventListener("input", event => updateSelected("instructions", event.target.value));
  els.variables.addEventListener("input", event => updateSelected("variables", event.target.value));
  els.output.addEventListener("input", updatePromptStats);
  window.addEventListener("resize", renderConnections);

  const savedPrompt = localStorage.getItem(`${STORAGE_KEY}-prompt`);
  if (savedPrompt) els.output.value = savedPrompt;
  render();
  if (!savedPrompt) generatePrompt();
  else updatePromptStats();
})();
