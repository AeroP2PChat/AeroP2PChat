const {
  bumpVersion,
  compareVersions,
  downloadStoreAppx,
  executeRelease,
  findWindowsWorkflowRun,
  getReleaseState,
  parseVersion,
  watchWindowsWorkflow,
} = require("./release-help.cjs");

function formatMinimumVersion(value) {
  return value || "keine";
}

function formatFileSize(bytes) {
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? megabytes.toFixed(1) : megabytes.toFixed(2)} MB`;
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("npm run release benötigt ein interaktives Terminal.");
  }

  const clack = await import("@clack/prompts");
  const {
    cancel,
    confirm,
    intro,
    isCancel,
    log,
    multiline,
    note,
    outro,
    select,
    spinner,
    text,
  } = clack;
  const state = getReleaseState();

  function unwrap(value) {
    if (isCancel(value)) {
      cancel("Release abgebrochen. Es wurde nichts verändert.");
      process.exit(0);
    }
    return value;
  }

  intro(`Aero P2P Chat · Release ${state.currentVersion}`);

  const bump = unwrap(
    await select({
      message: "Welche Version möchtest du veröffentlichen?",
      initialValue: "patch",
      options: [
        {
          value: "patch",
          label: `${bumpVersion(state.currentVersion, "patch")} · Patch`,
          hint: "Fixes und kleine Änderungen",
        },
        {
          value: "minor",
          label: `${bumpVersion(state.currentVersion, "minor")} · Minor`,
          hint: "neue Funktionen",
        },
        {
          value: "major",
          label: `${bumpVersion(state.currentVersion, "major")} · Major`,
          hint: "große oder inkompatible Änderungen",
        },
        {
          value: "custom",
          label: "Eigene Version",
          hint: "x.y.z manuell eingeben",
        },
      ],
    }),
  );

  const nextVersion =
    bump === "custom"
      ? unwrap(
          await text({
            message: "Release-Version eingeben",
            placeholder: bumpVersion(state.currentVersion, "patch"),
            validate(value) {
              const normalized = String(value || "").replace(/^v/, "");
              if (!parseVersion(normalized)) return "Benutze das Format x.y.z.";
              if (compareVersions(normalized, state.currentVersion) <= 0) {
                return `Die Version muss neuer als ${state.currentVersion} sein.`;
              }
            },
          }),
        ).replace(/^v/, "")
      : bumpVersion(state.currentVersion, bump);

  const updatePolicy = unwrap(
    await select({
      message: "Wie soll die Mindestversion behandelt werden?",
      initialValue: "keep",
      options: [
        {
          value: "keep",
          label: "Normales Update",
          hint: `${formatMinimumVersion(state.minimumVersion)} beibehalten`,
        },
        {
          value: "important",
          label: "Wichtiges Update",
          hint: `mindestens ${nextVersion} verlangen`,
        },
        {
          value: "clear",
          label: "Mindestversion löschen",
          hint: "bestehende Sperre aufheben",
        },
      ],
    }),
  );

  const chromeMode = unwrap(
    await select({
      message: "Was soll mit der Chrome-Erweiterung passieren?",
      initialValue: "build",
      options: [
        {
          value: "build",
          label: "ZIP bauen und anhängen",
          hint: "empfohlen",
        },
        {
          value: "publish",
          label: "Bauen und veröffentlichen",
          hint: "in den Chrome Web Store hochladen",
        },
        {
          value: "skip",
          label: "Browser-Build überspringen",
          hint: "nur Desktop-Release",
        },
      ],
    }),
  );

  const publishRelease = unwrap(
    await select({
      message: "Was soll nach dem Windows-Build passieren?",
      initialValue: true,
      options: [
        {
          value: true,
          label: "Automatisch veröffentlichen",
          hint: "als neuestes Release markieren",
        },
        {
          value: false,
          label: "Als Entwurf behalten",
          hint: "zuerst alles auf GitHub prüfen",
        },
      ],
    }),
  );

  const addHighlights = unwrap(
    await confirm({
      message: "Eigene Release-Highlights hinzufügen?",
      active: "Ja",
      inactive: "Nein",
      initialValue: false,
    }),
  );
  const highlights = addHighlights
    ? unwrap(
        await multiline({
          message: "Release-Highlights (zum Beenden zweimal Enter)",
          placeholder: "- Neu: ...\n- Behoben: ...",
          validate(value) {
            if (!String(value || "").trim()) return "Gib mindestens eine Zeile ein.";
          },
        }),
      ).trim()
    : "";

  const minimumVersion =
    updatePolicy === "important"
      ? nextVersion
      : updatePolicy === "clear"
        ? "keine"
        : formatMinimumVersion(state.minimumVersion);
  const chromeLabel = {
    build: "ZIP bauen und anhängen",
    publish: "Bauen, anhängen und im Chrome Web Store veröffentlichen",
    skip: "Überspringen",
  }[chromeMode];

  note(
    [
      `Version       ${state.currentVersion} → ${nextVersion}`,
      `Mindestversion ${minimumVersion}`,
      "Linux         AppImage + RPM + DEB (local)",
      "Windows       NSIS + APPX (GitHub Actions)",
      `Chrome        ${chromeLabel}`,
      `GitHub        ${publishRelease ? "Automatisch veröffentlichen" : "Als Entwurf behalten"}`,
    ].join("\n"),
    "Release-Plan",
  );

  const approved = unwrap(
    await confirm({
      message: "Dieses Release jetzt starten?",
      active: "Ja",
      inactive: "Nein",
      initialValue: false,
    }),
  );
  if (!approved) {
    cancel("Release abgebrochen. Es wurde nichts verändert.");
    return;
  }

  let uploadSpinner = null;
  const result = await executeRelease(
    {
      nextVersion,
      updatePolicy,
      chromeMode,
      publishRelease,
      highlights,
    },
    {
      step: (message) => log.step(message),
      info: (message) => log.info(message),
      uploadStart: ({ index, total, name, size }) => {
        uploadSpinner = spinner();
        uploadSpinner.start(
          `[${index}/${total}] ${name} wird hochgeladen · ${formatFileSize(size)}`,
        );
      },
      uploadSuccess: ({ index, total, name, size }) => {
        uploadSpinner?.stop(
          `[${index}/${total}] ${name} hochgeladen · ${formatFileSize(size)}`,
        );
        uploadSpinner = null;
      },
      uploadError: ({ index, total, name }) => {
        uploadSpinner?.error(
          `[${index}/${total}] Upload fehlgeschlagen · ${name}`,
        );
        uploadSpinner = null;
      },
    },
  );

  log.step("Warte auf den Windows-Workflow");
  const workflowRun = findWindowsWorkflowRun(result);
  log.info(`Windows-Workflow: ${workflowRun.url}`);
  watchWindowsWorkflow(workflowRun.databaseId);
  log.success("Windows-Setup und Microsoft-Store-APPX wurden erfolgreich gebaut.");

  const downloadAppx = unwrap(
    await confirm({
      message: "Microsoft-Store-APPX jetzt herunterladen?",
      active: "Ja",
      inactive: "Nein",
      initialValue: true,
    }),
  );
  let appxPath = "";
  if (downloadAppx) {
    const downloadSpinner = spinner();
    downloadSpinner.start("Microsoft-Store-APPX wird heruntergeladen …");
    try {
      const downloadedAppx = await downloadStoreAppx(
        workflowRun.databaseId,
        result.tag,
      );
      appxPath = downloadedAppx.path;
      downloadSpinner.stop(
        `APPX heruntergeladen · ${formatFileSize(downloadedAppx.size)}`,
      );
      log.info(`Datei: ${appxPath}`);
    } catch (error) {
      downloadSpinner.error("APPX-Download fehlgeschlagen.");
      throw error;
    }
  }

  outro(
    appxPath
      ? `${result.tag} fertig · APPX wurde lokal gespeichert.`
      : `${result.tag} fertig · APPX bleibt als GitHub-Artefakt verfügbar.`,
  );
}

main().catch(async (error) => {
  try {
    const { log, outro } = await import("@clack/prompts");
    log.error(error.message || String(error));
    outro("Release fehlgeschlagen.");
  } catch {
    console.error(`Release fehlgeschlagen: ${error.message || error}`);
  }
  process.exitCode = 1;
});
