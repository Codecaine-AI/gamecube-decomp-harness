import fs from "node:fs/promises";
import path from "node:path";

import type { TailerConfig } from "./config.js";

export class CursorStore {
  private cursors: Map<string, number> = new Map();
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;
  private readonly config: Pick<TailerConfig, "snapshotPath" | "snapshotIntervalMs"> &
    Partial<Pick<TailerConfig, "watchDir">>;

  constructor(
    config: Pick<TailerConfig, "snapshotPath" | "snapshotIntervalMs"> &
      Partial<Pick<TailerConfig, "watchDir">>,
  ) {
    this.config = config;
  }

  get(filePath: string): number {
    return this.cursors.get(this.cursorKey(filePath)) ?? 0;
  }

  set(filePath: string, offset: number): void {
    this.cursors.set(this.cursorKey(filePath), offset);
  }

  entries(): [string, number][] {
    return Array.from(this.cursors.entries());
  }

  getCount(): number {
    return this.cursors.size;
  }

  hasFile(filePath: string): boolean {
    return this.cursors.has(this.cursorKey(filePath));
  }

  async saveSnapshot(): Promise<void> {
    const data = Object.fromEntries(this.cursors);
    const tmpPath = this.config.snapshotPath + ".tmp";

    await fs.mkdir(path.dirname(this.config.snapshotPath), { recursive: true });
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2));
    await fs.rename(tmpPath, this.config.snapshotPath);
  }

  async loadSnapshot(): Promise<void> {
    try {
      const raw = await fs.readFile(this.config.snapshotPath, "utf-8");
      const data = JSON.parse(raw) as Record<string, number>;
      for (const [filePath, offset] of Object.entries(data)) {
        const key = this.cursorKey(filePath);
        const previous = this.cursors.get(key) ?? 0;
        this.cursors.set(key, Math.max(previous, offset));
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }

  startPeriodicSave(): void {
    this.snapshotTimer = setInterval(() => {
      this.saveSnapshot().catch((error) => {
        console.error("Cursor snapshot failed:", error);
      });
    }, this.config.snapshotIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    await this.saveSnapshot();
  }

  private cursorKey(filePath: string): string {
    if (!this.config.watchDir) return filePath;

    const watchDir = path.resolve(this.config.watchDir);
    const absolutePath = path.isAbsolute(filePath) ? path.normalize(filePath) : filePath;

    if (!path.isAbsolute(absolutePath)) return path.normalize(absolutePath);

    const relativePath = path.relative(watchDir, absolutePath);
    if (relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
      return path.normalize(relativePath);
    }

    const anchor = `${path.sep}${path.basename(watchDir)}${path.sep}`;
    const anchorIndex = absolutePath.lastIndexOf(anchor);
    if (anchorIndex >= 0) {
      return path.normalize(absolutePath.slice(anchorIndex + anchor.length));
    }

    return absolutePath;
  }
}
