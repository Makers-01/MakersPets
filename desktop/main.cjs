const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, Menu, ipcMain, shell, screen } = require("electron");
const { loadEnvConfig } = require("@next/env");

loadEnvConfig(process.cwd());

const desktopBaseUrl = process.env.MAKERPET_DESKTOP_URL || "http://127.0.0.1:3001";
const desktopLang = process.env.MAKERPET_DESKTOP_LANG === "en" ? "en" : "zh";

let petWindow = null;
let dragState = null;
const PET_TOP_LEVEL = "screen-saver";

function getDesktopStatePath() {
  return path.join(app.getPath("userData"), "makerspet-desktop-state.json");
}

function clampBoundsToWorkArea(bounds, workArea) {
  return {
    x: Math.max(workArea.x + 8, Math.min(bounds.x, workArea.x + workArea.width - bounds.width - 8)),
    y: Math.max(workArea.y + 8, Math.min(bounds.y, workArea.y + workArea.height - bounds.height - 8)),
    width: bounds.width,
    height: bounds.height
  };
}

function readDesktopState() {
  try {
    const filePath = getDesktopStatePath();
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const candidate = payload.bounds;
    if (
      !candidate ||
      typeof candidate !== "object" ||
      !Number.isFinite(candidate.x) ||
      !Number.isFinite(candidate.y)
    ) {
      return null;
    }

    return {
      bounds: {
        x: Math.round(candidate.x),
        y: Math.round(candidate.y)
      },
      pinned: payload.pinned !== false
    };
  } catch {
    return null;
  }
}

function persistDesktopState() {
  if (!petWindow) return;

  try {
    const bounds = petWindow.getBounds();
    fs.writeFileSync(
      getDesktopStatePath(),
      JSON.stringify(
        {
          bounds: {
            x: bounds.x,
            y: bounds.y
          },
          pinned: petWindow.isAlwaysOnTop()
        },
        null,
        2
      )
    );
  } catch {}
}

function applyPinnedState(pinned) {
  if (!petWindow) return;

  petWindow.setAlwaysOnTop(Boolean(pinned), PET_TOP_LEVEL);

  if (pinned) {
    petWindow.moveTop();
    petWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: false
    });
  }
}

function buildUrl(routePath) {
  const normalizedPath = routePath.startsWith("/") ? routePath : `/${routePath}`;
  return new URL(normalizedPath, desktopBaseUrl).toString();
}

function createCompanionWindow(routePath) {
  const childWindow = new BrowserWindow({
    width: 1120,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    autoHideMenuBar: true,
    backgroundColor: "#f7f7f3",
    title: "MakersPet"
  });

  void childWindow.loadURL(buildUrl(routePath));
  return childWindow;
}

function createPetWindow() {
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  const width = 236;
  const height = 252;
  const savedState = readDesktopState();
  const defaultBounds = {
    width,
    height,
    x: Math.max(workArea.x + 16, workArea.x + workArea.width - width - 24),
    y: Math.max(workArea.y + 16, workArea.y + workArea.height - height - 32)
  };
  const initialBounds = savedState?.bounds
    ? clampBoundsToWorkArea(
        {
          ...defaultBounds,
          x: savedState.bounds.x,
          y: savedState.bounds.y
        },
        workArea
      )
    : defaultBounds;

  petWindow = new BrowserWindow({
    width,
    height,
    minWidth: 180,
    minHeight: 180,
    autoHideMenuBar: true,
    backgroundColor: "#00000000",
    title: "MakersPet",
    alwaysOnTop: true,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    x: initialBounds.x,
    y: initialBounds.y,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  applyPinnedState(savedState?.pinned !== false);

  petWindow.on("closed", () => {
    dragState = null;
    petWindow = null;
  });

  petWindow.on("move", () => {
    if (!dragState) {
      persistDesktopState();
    }
  });

  void petWindow.loadURL(buildUrl(`/desktop?lang=${desktopLang}`));
}

ipcMain.handle("desktop:get-state", () => {
  return {
    ok: true,
    pinned: petWindow?.isAlwaysOnTop() ?? false,
    baseUrl: desktopBaseUrl
  };
});

ipcMain.handle("desktop:toggle-pin", () => {
  const nextPinned = !(petWindow?.isAlwaysOnTop() ?? false);
  applyPinnedState(nextPinned);
  persistDesktopState();

  return {
    ok: true,
    pinned: nextPinned
  };
});

ipcMain.handle("desktop:fit-window", (_event, payload) => {
  if (!petWindow) {
    return {
      ok: false
    };
  }

  const requestedWidth =
    typeof payload?.width === "number" && Number.isFinite(payload.width) ? payload.width : petWindow.getBounds().width;
  const requestedHeight =
    typeof payload?.height === "number" && Number.isFinite(payload.height)
      ? payload.height
      : petWindow.getBounds().height;
  const nextWidth = Math.max(180, Math.min(Math.round(requestedWidth), 420));
  const nextHeight = Math.max(180, Math.min(Math.round(requestedHeight), 520));
  const currentBounds = petWindow.getBounds();
  const display = screen.getDisplayMatching(currentBounds);
  const workArea = display.workArea;
  const nextBounds = clampBoundsToWorkArea(
    {
      width: nextWidth,
      height: nextHeight,
      x: currentBounds.x,
      y: currentBounds.y
    },
    workArea
  );

  petWindow.setBounds(nextBounds, true);
  persistDesktopState();

  return {
    ok: true
  };
});

ipcMain.handle("desktop:minimize", () => {
  petWindow?.minimize();

  return {
    ok: true
  };
});

ipcMain.handle("desktop:drag-window", (_event, payload) => {
  if (!petWindow) {
    return {
      ok: false
    };
  }

  const phase = payload?.phase;
  const pointerX = Number(payload?.pointerX);
  const pointerY = Number(payload?.pointerY);

  if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) {
    return {
      ok: false
    };
  }

  if (phase === "start") {
    const bounds = petWindow.getBounds();
    dragState = {
      offsetX: pointerX - bounds.x,
      offsetY: pointerY - bounds.y
    };

    return {
      ok: true
    };
  }

  if (!dragState) {
    return {
      ok: false
    };
  }

  const pointDisplay = screen.getDisplayNearestPoint({
    x: Math.round(pointerX),
    y: Math.round(pointerY)
  });
  const workArea = pointDisplay.workArea;
  const bounds = petWindow.getBounds();
  const nextBounds = clampBoundsToWorkArea(
    {
      x: Math.round(pointerX - dragState.offsetX),
      y: Math.round(pointerY - dragState.offsetY),
      width: bounds.width,
      height: bounds.height
    },
    workArea
  );

  petWindow.setBounds(nextBounds, true);

  if (phase === "end") {
    dragState = null;
    persistDesktopState();
  }

  return {
    ok: true
  };
});

ipcMain.on("desktop:drag-window-event", (_event, payload) => {
  if (!petWindow) {
    return;
  }

  const phase = payload?.phase;
  const pointerX = Number(payload?.pointerX);
  const pointerY = Number(payload?.pointerY);

  if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) {
    return;
  }

  if (phase === "start") {
    const bounds = petWindow.getBounds();
    dragState = {
      offsetX: pointerX - bounds.x,
      offsetY: pointerY - bounds.y
    };
    return;
  }

  if (!dragState) {
    return;
  }

  const pointDisplay = screen.getDisplayNearestPoint({
    x: Math.round(pointerX),
    y: Math.round(pointerY)
  });
  const workArea = pointDisplay.workArea;
  const bounds = petWindow.getBounds();
  const nextBounds = clampBoundsToWorkArea(
    {
      x: Math.round(pointerX - dragState.offsetX),
      y: Math.round(pointerY - dragState.offsetY),
      width: bounds.width,
      height: bounds.height
    },
    workArea
  );

  petWindow.setBounds(nextBounds, true);

  if (phase === "end") {
    dragState = null;
    persistDesktopState();
  }
});

ipcMain.handle("desktop:open-route", (_event, routePath) => {
  const safeRoute = typeof routePath === "string" && routePath.startsWith("/") ? routePath : "/";
  createCompanionWindow(safeRoute);

  return {
    ok: true
  };
});

ipcMain.handle("desktop:show-context-menu", (event, labels) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender);

  if (!targetWindow) {
    return {
      ok: false
    };
  }

  const pinned = petWindow?.isAlwaysOnTop() ?? false;
  const menu = Menu.buildFromTemplate([
    {
      label: labels?.openChat || "Open Chat",
      click: () => {
        createCompanionWindow(`/chat?lang=${desktopLang}`);
      }
    },
    {
      label: labels?.openAdmin || "Open Admin",
      click: () => {
        createCompanionWindow(`/admin?lang=${desktopLang}`);
      }
    },
    { type: "separator" },
    {
      label: pinned ? labels?.unpin || "Unpin" : labels?.pin || "Pin",
      click: () => {
        applyPinnedState(!pinned);
        persistDesktopState();
      }
    },
    {
      label: labels?.minimize || "Minimize",
      click: () => {
        petWindow?.minimize();
      }
    },
    { type: "separator" },
    {
      label: labels?.quit || "Quit",
      click: () => {
        app.quit();
      }
    }
  ]);

  menu.popup({
    window: targetWindow
  });

  return {
    ok: true
  };
});

ipcMain.handle("desktop:open-external", async (_event, target) => {
  if (typeof target !== "string") {
    return {
      ok: false
    };
  }

  await shell.openExternal(target);
  return {
    ok: true
  };
});

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    try {
      if (typeof app.setActivationPolicy === "function") {
        app.setActivationPolicy("accessory");
      } else if (app.dock?.hide) {
        app.dock.hide();
      }
    } catch {}
  }

  createPetWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
