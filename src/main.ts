import type { Moment, WeekSpec } from "moment";
import { App, Notice, Plugin, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";

import { VIEW_TYPE_CALENDAR } from "./constants";
import { dateNotesIndex, settings } from "./ui/stores";
import {
  appHasPeriodicNotesPluginLoaded,
  CalendarSettingsTab,
  ISettings,
} from "./settings";
import CalendarView from "./view";

declare global {
  interface Window {
    app: App;
    moment: () => Moment;
    _bundledLocaleWeekSpec: WeekSpec;
  }
}

export default class CalendarPlugin extends Plugin {
  public options: ISettings;
  /** 日期笔记索引（一天可以有多篇） */
  public dateNotesIndex = dateNotesIndex;

  /** 日历视图不在 registerView 里缓存实例（官方审核要求），需要时从 leaf 取 */
  private get view(): CalendarView | null {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR)[0];
    return leaf ? (leaf.view as CalendarView) : null;
  }

  onunload(): void {
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_CALENDAR)
      .forEach((leaf) => leaf.detach());
  }

  async onload(): Promise<void> {
    this.register(
      settings.subscribe((value) => {
        this.options = value;
      })
    );

    this.registerView(
      VIEW_TYPE_CALENDAR,
      (leaf: WorkspaceLeaf) => new CalendarView(leaf)
    );

    this.addCommand({
      id: "show-calendar-view",
      name: "Open view",
      checkCallback: (checking: boolean) => {
        if (checking) {
          return (
            this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR).length === 0
          );
        }
        this.initLeaf();
      },
    });

    this.addCommand({
      id: "open-weekly-note",
      name: "Open Weekly Note",
      checkCallback: (checking) => {
        if (checking) {
          return !appHasPeriodicNotesPluginLoaded();
        }
        this.view?.openOrCreateWeeklyNote(window.moment(), false);
      },
    });

    this.addCommand({
      id: "reveal-active-note",
      name: "Reveal active note",
      callback: () => this.view?.revealActiveNote(),
    });

    this.addCommand({
      id: "rebuild-date-notes-index",
      name: "Rebuild date notes index",
      callback: () => {
        this.rebuildIndex();
        new Notice(`Indexed ${this.indexedNoteCount()} date note(s).`);
      },
    });

    await this.loadOptions();

    this.addSettingTab(new CalendarSettingsTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.rebuildIndex();
    });

    // 文件增删改名会影响索引；modify 不影响（文件名没变）
    this.registerEvent(
      this.app.vault.on("create", (file: TAbstractFile) =>
        this.onVaultChange(file)
      )
    );
    this.registerEvent(
      this.app.vault.on("delete", (file: TAbstractFile) =>
        this.onVaultChange(file)
      )
    );
    this.registerEvent(
      this.app.vault.on("rename", (file: TAbstractFile) =>
        this.onVaultChange(file)
      )
    );

    if (this.app.workspace.layoutReady) {
      this.initLeaf();
    } else {
      this.registerEvent(
        this.app.workspace.on("layout-ready", this.initLeaf.bind(this))
      );
    }
  }

  initLeaf(): void {
    if (this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR).length) {
      return;
    }
    void this.app.workspace.getRightLeaf(false)?.setViewState({
      type: VIEW_TYPE_CALENDAR,
    });
  }

  /** 重建索引，并让已经打开的日历立即重绘 */
  public rebuildIndex(): void {
    if (!this.options) return;
    this.dateNotesIndex.build(this.options);
    if (this.view) {
      this.view.refreshDateNotes();
    }
  }

  private indexedNoteCount(): number {
    const all = this.dateNotesIndex.snapshot();
    return Object.keys(all).reduce((sum, uid) => sum + all[uid].length, 0);
  }

  private rebuildTimer: number | null = null;

  private onVaultChange(file: TAbstractFile): void {
    if (!(file instanceof TFile) || file.extension !== "md") return;
    this.scheduleRebuild();
  }

  /** 同步/批量操作会连续触发 create 事件，合并成一次重建 */
  private scheduleRebuild(): void {
    if (this.rebuildTimer !== null) {
      window.clearTimeout(this.rebuildTimer);
    }
    this.rebuildTimer = window.setTimeout(() => {
      this.rebuildTimer = null;
      this.rebuildIndex();
    }, 500);
  }

  async loadOptions(): Promise<void> {
    const options = (await this.loadData()) as Partial<ISettings> | null;
    settings.update((old) => {
      return {
        ...old,
        ...(options || {}),
      };
    });

    await this.saveData(this.options);
  }

  async writeOptions(
    changeOpts: (settings: ISettings) => Partial<ISettings>
  ): Promise<void> {
    settings.update((old) => ({ ...old, ...changeOpts(old) }));
    await this.saveData(this.options);
    this.rebuildIndex();
  }
}
