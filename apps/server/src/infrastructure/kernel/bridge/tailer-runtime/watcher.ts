import fs from "node:fs";
import path from "node:path";

import type { TailerConfig } from "./config.js";
import { CursorStore } from "./cursor.js";
import { FileReader } from "./reader.js";
import type { PiEvent } from "./types.js";

export type OnEventsCallback = (filePath: string, events: PiEvent[]) => void;

function scanJsonlRecursive(dir: string): string[] {
  const results: string[] = [];
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        results.push(absolutePath);
      }
    }
  }
  return results;
}

export class DirectoryWatcher {
  private readers: Map<string, FileReader> = new Map();
  private watcher: fs.FSWatcher | null = null;
  private readonly onEvents: OnEventsCallback;
  private readonly cursorStore: CursorStore;
  private paused = false;
  private readonly config: Pick<TailerConfig, "watchDir">;

  constructor(
    onEvents: OnEventsCallback,
    cursorStore: CursorStore,
    config: Pick<TailerConfig, "watchDir">,
  ) {
    this.onEvents = onEvents;
    this.cursorStore = cursorStore;
    this.config = config;
  }

  start(): void {
    if (!fs.existsSync(this.config.watchDir)) {
      fs.mkdirSync(this.config.watchDir, { recursive: true });
    }

    const existing = scanJsonlRecursive(this.config.watchDir);
    for (const filePath of existing) this.createReader(filePath);
    console.log(`Watcher: found ${existing.length} existing JSONL files`);

    this.watcher = fs.watch(
      this.config.watchDir,
      { recursive: true },
      (eventType, filename) => this.handleFileEvent(eventType, filename),
    );

    console.log(`Watcher: watching ${this.config.watchDir} (recursive)`);

    for (const reader of this.readers.values()) reader.readNew();
  }

  handleFileEvent(eventType: string, filename: string | null): void {
    if (this.paused) return;
    if (!filename || !filename.endsWith(".jsonl")) return;

    const filePath = path.join(this.config.watchDir, filename);

    if (eventType === "rename") {
      if (fs.existsSync(filePath)) {
        if (!this.readers.has(filePath)) this.createReader(filePath);
        this.readers.get(filePath)!.readNew();
      }
    } else if (eventType === "change") {
      const reader = this.readers.get(filePath);
      if (reader) {
        reader.readNew();
      } else {
        this.createReader(filePath);
        this.readers.get(filePath)!.readNew();
      }
    }
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.readers.clear();
    console.log("Watcher: stopped");
  }

  pause(): void {
    this.paused = true;
    console.warn(`Watcher: paused (${this.readers.size} readers suspended)`);
  }

  resume(): void {
    this.paused = false;
    console.log(`Watcher: resumed - catching up ${this.readers.size} readers`);
    for (const reader of this.readers.values()) reader.readNew();
  }

  getReaderCount(): number {
    return this.readers.size;
  }

  getSnapshotStats(): { fromSnapshot: number; newFiles: number } {
    let fromSnapshot = 0;
    let newFiles = 0;
    for (const filePath of this.readers.keys()) {
      if (this.cursorStore.hasFile(filePath)) fromSnapshot++;
      else newFiles++;
    }
    return { fromSnapshot, newFiles };
  }

  private createReader(filePath: string): void {
    const initialOffset = this.cursorStore.get(filePath);
    const reader = new FileReader(filePath, initialOffset, (pathFromReader, events) => {
      this.cursorStore.set(pathFromReader, reader.getOffset());
      this.onEvents(pathFromReader, events);
    });
    this.readers.set(filePath, reader);
  }
}
