import type { Moment } from "moment";
import {
  getDateFromFile,
  getWeeklyNote,
  getWeeklyNoteSettings,
} from "obsidian-daily-notes-interface";
import {
  FileView,
  ItemView,
  Menu,
  Notice,
  normalizePath,
  TFile,
  Vault,
  WorkspaceLeaf,
} from "obsidian";
import type { ICalendarSource } from "obsidian-calendar-ui";
import { get } from "svelte/store";

import { TRIGGER_ON_OPEN, VIEW_TYPE_CALENDAR } from "src/constants";
import { t } from "src/i18n";
import type { IDateNote } from "src/io/dateNotesIndex";
import { tryToCreateDailyNote } from "src/io/dailyNotes";
import { tryToCreateWeeklyNote } from "src/io/weeklyNotes";
import { defaultSettings } from "src/settings";
import type { ISettings } from "src/settings";

import Calendar from "./ui/Calendar.svelte";
import { showFileMenu } from "./ui/fileMenu";
import {
  activeFile,
  dailyNotes,
  dateNotesIndex,
  weeklyNotes,
  settings,
} from "./ui/stores";
import { customTagsSource, streakSource, tasksSource } from "./ui/sources";

export default class CalendarView extends ItemView {
  private calendar: Calendar | null = null;
  private settings: ISettings = { ...defaultSettings };

  /** 日历挂载点 */
  private calendarEl: HTMLElement | null = null;
  /** 日历下方的「当天笔记列表」容器 */
  private listEl: HTMLElement | null = null;
  /** 列表当前展示的日期 */
  private selectedDate: Moment | null = null;

  /** 缓存的 sources，保证 refresh 时不会重复向外部插件广播 calendar:open */
  private sources: ICalendarSource[] | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);

    this.registerEvent(
      // periodic-notes 插件的自定义事件未包含在 obsidian 类型定义里，用最小类型接入
      (this.app.workspace as Workspace & {
        on(
          name: "periodic-notes:settings-updated",
          callback: () => void
        ): import("obsidian").EventRef;
      }).on("periodic-notes:settings-updated", () =>
        this.onNoteSettingsUpdate()
      )
    );
    this.registerEvent(this.app.vault.on("create", (file) => this.onFileCreated(file)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.onFileDeleted(file)));
    this.registerEvent(this.app.vault.on("modify", (file) => this.onFileModified(file)));
    this.registerEvent(this.app.workspace.on("file-open", (file) => this.onFileOpen(file)));

    settings.subscribe((val) => {
      this.settings = val;

      // Refresh the calendar if settings change
      if (this.calendar) {
        this.calendar.tick();
      }
    });
  }

  getViewType(): string {
    return VIEW_TYPE_CALENDAR;
  }

  getDisplayText(): string {
    return "Calendar";
  }

  getIcon(): string {
    return "calendar-with-checkmark";
  }

  onClose(): Promise<void> {
    if (this.calendar) {
      this.calendar.$destroy();
      this.calendar = null;
    }
    return Promise.resolve();
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("ahui-calendar-root");

    this.calendarEl = root.createDiv({ cls: "ahui-calendar-calendar" });
    this.listEl = root.createDiv({ cls: "ahui-calendar-notes" });

    this.mountCalendar();
    this.renderNotesFor(this.initialDate());
  }

  /** 打开视图时默认展示哪一天：优先当前笔记所属的日期 */
  private initialDate(): Moment {
    const active = this.app.workspace.getActiveFile();
    const fromActive = dateNotesIndex.getDateForFile(active);
    return fromActive || window.moment();
  }

  /** 供外部插件在 `calendar:open` 时注入额外 source（上游行为，保持不变） */
  private getSources(): ICalendarSource[] {
    if (!this.sources) {
      // 圆点用于表示「当天有几篇日期笔记」，不再使用 wordCountSource 的字数圆点
      this.sources = [customTagsSource, streakSource, tasksSource];
      this.app.workspace.trigger(TRIGGER_ON_OPEN, this.sources);
    }
    return this.sources;
  }

  private mountCalendar(): void {
    if (!this.calendarEl) return;
    this.calendar = new Calendar({
      target: this.calendarEl,
      props: {
        onClickDay: this.openOrCreateDailyNote,
        onClickWeek: this.openOrCreateWeeklyNote,
        onHoverDay: this.onHoverDay,
        onHoverWeek: this.onHoverWeek,
        onContextMenuDay: this.onContextMenuDay,
        onContextMenuWeek: this.onContextMenuWeek,
        sources: this.getSources(),
      },
    });
  }

  /**
   * 日期笔记索引变化后重绘。
   *
   * calendar-ui 的日历格只在挂载时求值一次 metadata，改数据后需要
   * 重新挂载才能刷新角标；格子数量很小（约 42 个），成本可忽略。
   */
  public refreshDateNotes(): void {
    if (!this.calendar) return;
    this.calendar.$destroy();
    this.calendar = null;
    this.mountCalendar();

    if (this.selectedDate) {
      this.renderNotesFor(this.selectedDate);
    }
  }

  // ==========================================================================
  // 日历下方的「当天笔记列表」
  // ==========================================================================

  private groupNameFor(groupId: string | null): string {
    if (!groupId) return t.view.ungrouped;
    const group = (this.settings?.groups || []).find((g) => g.id === groupId);
    if (!group) return t.view.ungrouped;
    return group.name || group.folder || t.view.ungrouped;
  }

  /** 渲染某一天的笔记列表（按分组分节） */
  private renderNotesFor(date: Moment): void {
    this.selectedDate = date.clone();

    const el = this.listEl;
    if (!el) return;

    el.empty();
    el.scrollTop = 0;

    const notes = dateNotesIndex.getNotes(date);

    const header = el.createDiv({ cls: "ahui-calendar-notes-header" });
    header.createSpan({
      cls: "ahui-calendar-notes-date",
      text: date.format("YYYY-MM-DD"),
    });
    if (notes.length > 0) {
      header.createSpan({
        cls: "ahui-calendar-notes-count",
        text: t.view.count(notes.length),
      });
    }

    if (notes.length === 0) {
      const empty = el.createDiv({ cls: "ahui-calendar-notes-empty" });
      empty.createSpan({ text: t.view.noNotes });

      const button = empty.createEl("button", { text: t.view.create });
      button.addEventListener("click", () => {
        void this.createDateNote(date, false);
      });
      return;
    }

    const activePath = this.app.workspace.getActiveFile()?.path;
    let currentGroup: string | null | undefined = undefined;
    let section: HTMLElement = el;

    for (const note of notes) {
      if (note.groupId !== currentGroup) {
        currentGroup = note.groupId;
        el.createDiv({
          cls: "ahui-calendar-notes-group",
          text: this.groupNameFor(note.groupId),
        });
        section = el.createDiv({ cls: "ahui-calendar-notes-section" });
      }
      this.renderNoteItem(section, note, activePath);
    }

    if (notes.length > 1) {
      el.createDiv({
        cls: "ahui-calendar-notes-hint",
        text: t.view.openInNewSplitHint,
      });
    }
  }

  private renderNoteItem(
    parent: HTMLElement,
    note: IDateNote,
    activePath?: string
  ): void {
    const item = parent.createDiv({ cls: "ahui-calendar-note-item" });
    if (activePath && activePath === note.file.path) {
      item.addClass("is-active");
    }

    item.createDiv({
      cls: "ahui-calendar-note-title",
      text: note.file.basename,
    });
    item.createDiv({
      cls: "ahui-calendar-note-path",
      text: note.file.parent ? note.file.parent.path : "/",
    });

    item.addEventListener("click", (event: MouseEvent) => {
      void this.openNote(note.file, event.metaKey || event.ctrlKey);
    });

    item.addEventListener("contextmenu", (event: MouseEvent) => {
      event.preventDefault();
      showFileMenu(this.app, note.file, {
        x: event.pageX,
        y: event.pageY,
      });
    });
  }

  // ==========================================================================
  // 鼠标交互
  // ==========================================================================

  onHoverDay = (
    date: Moment,
    targetEl: EventTarget,
    isMetaPressed: boolean
  ): void => {
    if (!isMetaPressed) {
      return;
    }
    const notes = dateNotesIndex.getNotes(date);
    const note = notes.length ? notes[0].file : null;
    const linkText = note ? note.basename : date.format("YYYY-MM-DD");

    this.app.workspace.trigger(
      "link-hover",
      this,
      targetEl,
      linkText,
      note?.path
    );
  };

  onHoverWeek = (
    date: Moment,
    targetEl: EventTarget,
    isMetaPressed: boolean
  ): void => {
    if (!isMetaPressed) {
      return;
    }
    const note = getWeeklyNote(date, get(weeklyNotes));
    const { format } = getWeeklyNoteSettings();
    this.app.workspace.trigger(
      "link-hover",
      this,
      targetEl,
      date.format(format),
      note?.path
    );
  };

  private onContextMenuDay = (date: Moment, event: MouseEvent): void => {
    const notes = dateNotesIndex.getNotes(date);
    if (notes.length === 0) {
      // If no file exists for a given day, show nothing.
      return;
    }

    const position = { x: event.pageX, y: event.pageY };

    if (notes.length === 1) {
      showFileMenu(this.app, notes[0].file, position);
      return;
    }

    // 多篇：先选一篇，再弹该文件的菜单
    const menu = new Menu(this.app);
    for (const note of notes) {
      menu.addItem((item) =>
        item
          .setTitle(`${this.groupNameFor(note.groupId)} · ${note.file.basename}`)
          .setIcon("file-text")
          .onClick(() => showFileMenu(this.app, note.file, position))
      );
    }
    menu.showAtPosition(position);
  };

  private onContextMenuWeek = (date: Moment, event: MouseEvent): void => {
    const note = getWeeklyNote(date, get(weeklyNotes));
    if (!note) {
      // If no file exists for a given day, show nothing.
      return;
    }
    showFileMenu(this.app, note, {
      x: event.pageX,
      y: event.pageY,
    });
  };

  // ==========================================================================
  // 事件
  // ==========================================================================

  private onNoteSettingsUpdate = (): void => {
    dailyNotes.reindex();
    weeklyNotes.reindex();
    this.updateActiveFile();
  };

  private onFileDeleted = async (file: TFile): Promise<void> => {
    if (getDateFromFile(file, "day")) {
      dailyNotes.reindex();
      this.updateActiveFile();
    }
    if (getDateFromFile(file, "week")) {
      weeklyNotes.reindex();
      this.updateActiveFile();
    }
  };

  private onFileModified = async (file: TFile): Promise<void> => {
    const date = getDateFromFile(file, "day") || getDateFromFile(file, "week");
    if (date && this.calendar) {
      this.calendar.tick();
    }
  };

  private onFileCreated = (file: TFile): void => {
    if (this.app.workspace.layoutReady && this.calendar) {
      if (getDateFromFile(file, "day")) {
        dailyNotes.reindex();
        this.calendar.tick();
      }
      if (getDateFromFile(file, "week")) {
        weeklyNotes.reindex();
        this.calendar.tick();
      }
    }
  };

  public onFileOpen = (_file: TFile): void => {
    if (this.app.workspace.layoutReady) {
      this.updateActiveFile();
    }
  };

  private updateActiveFile(): void {
    const view = this.app.workspace.getActiveViewOfType(FileView);

    const file = view ? view.file : null;
    activeFile.setFile(file);

    // 打开的是日期笔记时，下方列表跟着切换
    const date = dateNotesIndex.getDateForFile(file);
    if (date) {
      this.renderNotesFor(date);
    }

    if (this.calendar) {
      this.calendar.tick();
    }
  }

  public revealActiveNote(): void {
    const { moment } = window;
    const view = this.app.workspace.getActiveViewOfType(FileView);
    const calendar = this.calendar;

    if (view) {
      // 先用索引解析（支持自定义日期格式）
      const indexed = dateNotesIndex.getDateForFile(view.file);
      if (indexed) {
        calendar?.$set({ displayedMonth: indexed });
        return;
      }

      // Check to see if the active note is a daily-note
      const date = getDateFromFile(view.file, "day");
      if (date) {
        calendar?.$set({ displayedMonth: date });
        return;
      }

      // Check to see if the active note is a weekly-note
      const { format } = getWeeklyNoteSettings();
      const weekly = moment(view.file.basename, format, true);
      if (weekly.isValid()) {
        calendar?.$set({ displayedMonth: weekly });
        return;
      }
    }
  }

  // ==========================================================================
  // 打开 / 新建
  // ==========================================================================

  openOrCreateWeeklyNote = async (
    date: Moment,
    inNewSplit: boolean
  ): Promise<void> => {
    const { workspace } = this.app;

    const startOfWeek = date.clone().startOf("week");

    const existingFile = getWeeklyNote(date, get(weeklyNotes));

    if (!existingFile) {
      // File doesn't exist
      tryToCreateWeeklyNote(startOfWeek, inNewSplit, this.settings, (file) => {
        activeFile.setFile(file);
      });
      return;
    }

    const leaf = workspace.getLeaf(inNewSplit);
    await leaf.openFile(existingFile);

    activeFile.setFile(existingFile);
  };

  /** 打开一篇日期笔记 */
  private openNote = async (file: TFile, inNewSplit: boolean): Promise<void> => {
    const { workspace } = this.app;
    // vault.getConfig 未包含在公开类型里，用最小类型断言读取默认视图模式
    const mode = (this.app.vault as Vault & {
      getConfig(key: "defaultViewMode"): string;
    }).getConfig("defaultViewMode");
    const leaf = workspace.getLeaf(inNewSplit);
    await leaf.openFile(file, { mode });
    activeFile.setFile(file);
  };

  /**
   * 点击日历格。
   *
   * 无论几篇，都先在下方列表里展示当天全部笔记；
   * 只有恰好一篇时顺手打开它，多篇则由用户在列表里挑
   * （上游这里只能打开唯一一篇，其余的点不到）。
   */
  openOrCreateDailyNote = async (
    date: Moment,
    inNewSplit: boolean
  ): Promise<void> => {
    const notes = dateNotesIndex.getNotes(date);

    this.renderNotesFor(date);

    if (notes.length === 0) {
      // 不自动创建，交给列表里的「新建」按钮
      return;
    }

    if (notes.length === 1) {
      await this.openNote(notes[0].file, inNewSplit);
    }
  };

  /** 新建日期笔记：配置了 New note folder 就自己建，否则沿用 Daily Notes 行为 */
  private async createDateNote(
    date: Moment,
    inNewSplit: boolean
  ): Promise<void> {
    const folder = (this.settings?.newNoteFolder || "").trim();

    if (!folder) {
      tryToCreateDailyNote(
        date,
        inNewSplit,
        this.settings,
        (dailyNote: TFile) => {
          activeFile.setFile(dailyNote);
          this.refreshDateNotes();
        }
      );
      return;
    }

    const rawFormat = (this.settings?.dateFormats || [])[0] || "YYYY-MM-DD";
    const format = rawFormat.split("/").pop() || rawFormat;
    const filename = date.format(format);
    const dir = normalizePath(folder);
    const path = normalizePath(`${dir}/${filename}.md`);

    try {
      if (!this.app.vault.getAbstractFileByPath(dir)) {
        await this.app.vault.createFolder(dir);
      }

      let file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        file = await this.app.vault.create(path, "");
      }

      await this.openNote(file, inNewSplit);
      this.refreshDateNotes();
    } catch (err) {
      console.error("[Calendar] Failed to create note", err);
      new Notice(`Failed to create ${path}`);
    }
  }
}
