// Single source of truth for IPC channel names. Imported by both the
// preload bridge and the main-process handlers so they can never drift.

export const IPC = {
  // renderer -> main (invoke / send)
  sessionPrepare: 'session:prepare',
  sessionSpawn: 'session:spawn',
  sessionWrite: 'session:write',
  sessionResize: 'session:resize',
  sessionKill: 'session:kill',
  // plain project shells (P007) — parallel to session:* by design (ADR-002)
  terminalSpawn: 'terminal:spawn',
  terminalWrite: 'terminal:write',
  terminalResize: 'terminal:resize',
  terminalKill: 'terminal:kill',
  storeLoad: 'store:load',
  storeSave: 'store:save',
  dialogPickDirectory: 'dialog:pickDirectory',
  dialogConfirmDelete: 'dialog:confirmDelete',
  dialogConfirmTrashTerminal: 'dialog:confirmTrashTerminal',
  dialogConfirmTrashTerminals: 'dialog:confirmTrashTerminals',
  terminalBgCopyUpload: 'terminalBg:copyUpload',
  terminalBgDelete: 'terminalBg:delete',
  transcriptDeriveTitle: 'transcript:deriveTitle',
  gitInfo: 'git:info',
  gitStatus: 'git:status',
  gitDiffFiles: 'git:diffFiles',
  gitFileDiff: 'git:fileDiff',
  gitCheckout: 'git:checkout',
  gitWorktreeAdd: 'git:worktreeAdd',
  gitWorktreeRemove: 'git:worktreeRemove',
  systemAgents: 'system:agents',
  systemHomeDir: 'system:homeDir',
  // main -> renderer (webContents.send)
  sessionData: 'session:data',
  sessionExit: 'session:exit',
  terminalData: 'terminal:data',
  terminalExit: 'terminal:exit'
} as const
