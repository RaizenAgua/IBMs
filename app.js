(() => {
  "use strict";

  // Depois de publicar o Worker, substitua o endereço abaixo pelo URL recebido.
  const API_BASE_URL = "https://companhias-aereas-api.almoxagua.workers.dev";
  const TOKEN_KEY = "companhias-aereas-session-token-v2";
  const LEGACY_DATA_KEY = "companhias-aereas-tabelas-v1";
  const MIGRATION_DISMISSED_KEY = "companhias-aereas-migracao-dispensada-v2";

  const emptyState = () => ({
    version: 0,
    internacional: [],
    nacional: []
  });

  const elements = {
    loginScreen: document.getElementById("loginScreen"),
    loginForm: document.getElementById("loginForm"),
    loginUsername: document.getElementById("loginUsername"),
    loginPassword: document.getElementById("loginPassword"),
    loginRemember: document.getElementById("loginRemember"),
    loginMessage: document.getElementById("loginMessage"),
    app: document.getElementById("app"),
    editButton: document.getElementById("editButton"),
    cancelButton: document.getElementById("cancelButton"),
    pencilIcon: document.getElementById("pencilIcon"),
    checkIcon: document.getElementById("checkIcon"),
    syncStatus: document.getElementById("syncStatus"),
    settingsButton: document.getElementById("settingsButton"),
    settingsDialog: document.getElementById("settingsDialog"),
    settingsForm: document.getElementById("settingsForm"),
    settingsUsername: document.getElementById("settingsUsername"),
    currentPassword: document.getElementById("currentPassword"),
    settingsPassword: document.getElementById("settingsPassword"),
    settingsPasswordConfirm: document.getElementById("settingsPasswordConfirm"),
    settingsMessage: document.getElementById("settingsMessage"),
    closeSettingsButton: document.getElementById("closeSettingsButton"),
    logoutButton: document.getElementById("logoutButton"),
    migrationBanner: document.getElementById("migrationBanner"),
    importLocalButton: document.getElementById("importLocalButton"),
    dismissMigrationButton: document.getElementById("dismissMigrationButton"),
    toast: document.getElementById("toast")
  };

  let state = emptyState();
  let backup = null;
  let isEditing = false;
  let currentUsername = "";
  let toastTimer = null;

  function configuredApiUrl() {
    return !API_BASE_URL.includes("SEU-WORKER") && API_BASE_URL.startsWith("https://");
  }

  function getStoredToken() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
  }

  function storeToken(token, remember) {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(TOKEN_KEY, token);
  }

  function clearStoredToken() {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }

  async function api(path, options = {}) {
    if (!configuredApiUrl()) {
      throw new Error("O endereço do servidor ainda não foi configurado no arquivo app.js.");
    }

    const headers = new Headers(options.headers || {});
    const token = getStoredToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      cache: "no-store"
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const error = new Error(payload?.error || "Não foi possível concluir a operação.");
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  function showLogin(message = "") {
    clearStoredToken();
    elements.app.hidden = true;
    elements.loginScreen.hidden = false;
    elements.loginMessage.textContent = message;
    elements.loginPassword.value = "";
    setTimeout(() => elements.loginUsername.focus(), 0);
  }

  async function showApp(username) {
    currentUsername = username;
    elements.loginScreen.hidden = true;
    elements.app.hidden = false;
    await loadSharedData();
    checkLegacyData();
  }

  function setSyncStatus(text, type = "ok") {
    elements.syncStatus.textContent = text;
    elements.syncStatus.classList.toggle("is-working", type === "working");
    elements.syncStatus.classList.toggle("is-error", type === "error");
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    toastTimer = setTimeout(() => {
      elements.toast.hidden = true;
    }, 3500);
  }

  async function loadSharedData(silent = false) {
    if (!silent) {
      setSyncStatus("Carregando…", "working");
    }

    try {
      const payload = await api("/api/airlines");
      state = {
        version: payload.version,
        internacional: payload.internacional,
        nacional: payload.nacional
      };
      renderAll();
      setSyncStatus("Dados compartilhados", "ok");
    } catch (error) {
      if (error.status === 401) {
        showLogin("Sua sessão terminou. Entre novamente.");
        return;
      }
      setSyncStatus("Falha de conexão", "error");
      if (!silent) {
        showToast(error.message);
      }
    }
  }

  function renderAll() {
    document.querySelectorAll("[data-table]").forEach((section) => {
      renderTable(section.dataset.table);
    });
  }

  function renderTable(tableName) {
    const section = document.querySelector(`[data-table="${tableName}"]`);
    const tbody = section.querySelector("tbody");
    const emptyNote = section.querySelector(".empty-note");
    tbody.replaceChildren();

    state[tableName].forEach((row, rowIndex) => {
      const tr = document.createElement("tr");
      const values = [row.sigla834, row.ibm, row.ciaAerea];
      const fields = ["sigla834", "ibm", "ciaAerea"];

      values.forEach((value, columnIndex) => {
        const td = document.createElement("td");
        td.textContent = value || "";
        td.contentEditable = String(isEditing);
        td.spellcheck = false;
        td.addEventListener("input", () => {
          state[tableName][rowIndex][fields[columnIndex]] = td.textContent.trim();
        });
        td.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            td.blur();
          }
        });
        tr.appendChild(td);
      });

      const deleteCell = document.createElement("td");
      deleteCell.className = "delete-cell";
      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-row";
      deleteButton.type = "button";
      deleteButton.setAttribute("aria-label", `Excluir linha ${rowIndex + 1}`);
      deleteButton.title = "Excluir linha";
      deleteButton.textContent = "×";
      deleteButton.addEventListener("click", () => {
        state[tableName].splice(rowIndex, 1);
        renderTable(tableName);
      });
      deleteCell.appendChild(deleteButton);
      tr.appendChild(deleteCell);
      tbody.appendChild(tr);
    });

    emptyNote.classList.toggle("is-visible", state[tableName].length === 0);
  }

  function setEditing(value) {
    isEditing = value;
    document.body.classList.toggle("is-editing", value);
    elements.cancelButton.hidden = !value;
    elements.settingsButton.hidden = value;
    elements.pencilIcon.hidden = value;
    elements.checkIcon.hidden = !value;
    elements.editButton.setAttribute("aria-label", value ? "Salvar alterações" : "Editar tabelas");
    elements.editButton.title = value ? "Salvar alterações" : "Editar tabelas";
    renderAll();
  }

  async function saveSharedData() {
    setSyncStatus("Salvando…", "working");
    elements.editButton.disabled = true;
    elements.cancelButton.disabled = true;

    try {
      const payload = await api("/api/airlines", {
        method: "PUT",
        body: JSON.stringify({
          version: state.version,
          internacional: state.internacional,
          nacional: state.nacional
        })
      });

      state = payload;
      backup = null;
      setEditing(false);
      setSyncStatus("Alterações salvas", "ok");
      showToast("Alterações disponíveis em todos os dispositivos.");
      return true;
    } catch (error) {
      if (error.status === 409) {
        setSyncStatus("Dados atualizados por outra pessoa", "error");
        showToast("Outra pessoa alterou a tabela. Os dados serão recarregados.");
        backup = null;
        setEditing(false);
        await loadSharedData();
        return false;
      }
      if (error.status === 401) {
        showLogin("Sua sessão terminou. Entre novamente.");
        return false;
      }
      setSyncStatus("Erro ao salvar", "error");
      showToast(error.message);
      return false;
    } finally {
      elements.editButton.disabled = false;
      elements.cancelButton.disabled = false;
    }
  }

  function readLegacyData() {
    try {
      const saved = JSON.parse(localStorage.getItem(LEGACY_DATA_KEY));
      if (!saved || !Array.isArray(saved.internacional) || !Array.isArray(saved.nacional)) {
        return null;
      }

      const convert = (rows) => rows
        .filter((row) => Array.isArray(row))
        .map((row) => ({
          sigla834: String(row[0] || "").trim(),
          ibm: String(row[1] || "").trim(),
          ciaAerea: String(row[2] || "").trim()
        }))
        .filter((row) => row.sigla834 || row.ibm || row.ciaAerea);

      const legacy = {
        internacional: convert(saved.internacional),
        nacional: convert(saved.nacional)
      };

      return legacy.internacional.length || legacy.nacional.length ? legacy : null;
    } catch {
      return null;
    }
  }

  function checkLegacyData() {
    const dismissed = localStorage.getItem(MIGRATION_DISMISSED_KEY) === "yes";
    elements.migrationBanner.hidden = dismissed || !readLegacyData();
  }

  function rowKey(row) {
    return [row.sigla834, row.ibm, row.ciaAerea]
      .map((value) => String(value || "").trim().toLocaleLowerCase("pt-BR"))
      .join("\u0000");
  }

  function mergeRows(currentRows, importedRows) {
    const result = currentRows.map((row) => ({ ...row }));
    const existing = new Set(result.map(rowKey));
    importedRows.forEach((row) => {
      const key = rowKey(row);
      if (!existing.has(key)) {
        existing.add(key);
        result.push({ ...row });
      }
    });
    return result;
  }

  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    elements.loginMessage.textContent = "";
    const submitButton = elements.loginForm.querySelector("button[type='submit']");
    submitButton.disabled = true;

    try {
      const payload = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({
          username: elements.loginUsername.value.trim(),
          password: elements.loginPassword.value,
          remember: elements.loginRemember.checked
        })
      });
      storeToken(payload.token, elements.loginRemember.checked);
      elements.loginPassword.value = "";
      await showApp(payload.username);
    } catch (error) {
      elements.loginMessage.textContent = error.message;
      elements.loginPassword.value = "";
      elements.loginPassword.focus();
    } finally {
      submitButton.disabled = false;
    }
  });

  elements.editButton.addEventListener("click", async () => {
    if (!isEditing) {
      backup = structuredClone(state);
      setEditing(true);
      return;
    }
    await saveSharedData();
  });

  elements.cancelButton.addEventListener("click", () => {
    if (backup) {
      state = backup;
    }
    backup = null;
    setEditing(false);
    setSyncStatus("Edição cancelada", "ok");
  });

  document.querySelectorAll(".add-row").forEach((button) => {
    button.addEventListener("click", () => {
      const tableName = button.closest("[data-table]").dataset.table;
      state[tableName].push({ sigla834: "", ibm: "", ciaAerea: "" });
      renderTable(tableName);
      const newRow = button.closest("[data-table]").querySelector("tbody tr:last-child td");
      newRow?.focus();
    });
  });

  elements.settingsButton.addEventListener("click", () => {
    elements.settingsUsername.value = currentUsername;
    elements.currentPassword.value = "";
    elements.settingsPassword.value = "";
    elements.settingsPasswordConfirm.value = "";
    elements.settingsMessage.textContent = "";
    elements.settingsDialog.showModal();
    elements.settingsUsername.focus();
  });

  elements.closeSettingsButton.addEventListener("click", () => {
    elements.settingsDialog.close();
  });

  elements.settingsDialog.addEventListener("click", (event) => {
    if (event.target === elements.settingsDialog) {
      elements.settingsDialog.close();
    }
  });

  elements.settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    elements.settingsMessage.textContent = "";

    if (elements.settingsPassword.value !== elements.settingsPasswordConfirm.value) {
      elements.settingsMessage.textContent = "As duas senhas novas não são iguais.";
      elements.settingsPasswordConfirm.focus();
      return;
    }

    const submitButton = elements.settingsForm.querySelector("button[type='submit']");
    submitButton.disabled = true;

    try {
      await api("/api/change-credentials", {
        method: "POST",
        body: JSON.stringify({
          username: elements.settingsUsername.value.trim(),
          currentPassword: elements.currentPassword.value,
          newPassword: elements.settingsPassword.value
        })
      });
      elements.settingsDialog.close();
      showLogin("Dados de acesso alterados. Entre novamente com as novas credenciais.");
    } catch (error) {
      elements.settingsMessage.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  elements.logoutButton.addEventListener("click", async () => {
    try {
      await api("/api/logout", { method: "POST" });
    } catch {
      // Mesmo sem conexão, o token local é removido abaixo.
    }
    elements.settingsDialog.close();
    showLogin();
  });

  elements.dismissMigrationButton.addEventListener("click", () => {
    localStorage.setItem(MIGRATION_DISMISSED_KEY, "yes");
    elements.migrationBanner.hidden = true;
  });

  elements.importLocalButton.addEventListener("click", async () => {
    const legacy = readLegacyData();
    if (!legacy) {
      elements.migrationBanner.hidden = true;
      return;
    }

    elements.importLocalButton.disabled = true;
    const originalState = structuredClone(state);
    state.internacional = mergeRows(state.internacional, legacy.internacional);
    state.nacional = mergeRows(state.nacional, legacy.nacional);

    const saved = await saveSharedData();
    if (saved) {
      localStorage.removeItem(LEGACY_DATA_KEY);
      localStorage.setItem(MIGRATION_DISMISSED_KEY, "yes");
      elements.migrationBanner.hidden = true;
      showToast("Dados antigos importados para a base compartilhada.");
    } else {
      state = originalState;
    }
    elements.importLocalButton.disabled = false;
  });

  setInterval(() => {
    const authenticated = Boolean(getStoredToken());
    if (authenticated && !isEditing && !elements.app.hidden) {
      loadSharedData(true);
    }
  }, 30000);

  async function initialize() {
    if (!configuredApiUrl()) {
      elements.loginMessage.textContent = "O servidor ainda não foi configurado. Consulte o arquivo LEIA-ME.md.";
      return;
    }

    const token = getStoredToken();
    if (!token) {
      showLogin();
      return;
    }

    try {
      const payload = await api("/api/session");
      await showApp(payload.username);
    } catch {
      showLogin();
    }
  }

  initialize();
})();
