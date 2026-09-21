import { App, PluginSettingTab, Setting } from "obsidian";
import type { ILocaleOverride, IWeekStartOption } from "obsidian-calendar-ui";

import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_WEEK_FORMAT,
  DEFAULT_WORDS_PER_DOT,
} from "src/constants";
import { t } from "src/i18n";

import type CalendarPlugin from "./main";

/** 一个「分组」：把某个文件夹（及其子目录）下的日期笔记归到一起 */
export interface IDateNoteGroup {
  id: string;
  name: string;
  folder: string;
  includeSubfolders: boolean;
}

export interface ISettings {
  /** 上游遗留字段：圆点已改为表示「当天笔记篇数」，此处仅保留以兼容旧 data.json */
  wordsPerDot: number;
  weekStart: IWeekStartOption;
  shouldConfirmBeforeCreate: boolean;

  // ---- 日期笔记（本 fork 新增）----
  /** 允许的日期文件名格式，可多个；含 "/" 时只取最后一段匹配文件名 */
  dateFormats: string[];
  /** 扫描范围（文件夹路径）。为空 = 全库 */
  scanFolders: string[];
  /** 排除的文件夹 */
  excludeFolders: string[];
  /** 分组定义 */
  groups: IDateNoteGroup[];
  /** 日历格上用圆点显示当天笔记篇数 */
  showNoteCount: boolean;
  /** 新建日期笔记的落点。为空 = 沿用 Daily Notes 设置 */
  newNoteFolder: string;

  // Weekly Note settings
  showWeeklyNote: boolean;
  weeklyNoteFormat: string;
  weeklyNoteTemplate: string;
  weeklyNoteFolder: string;

  localeOverride: ILocaleOverride;
}

const weekdays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export const defaultSettings = Object.freeze({
  shouldConfirmBeforeCreate: true,
  weekStart: "locale",

  wordsPerDot: DEFAULT_WORDS_PER_DOT,

  dateFormats: [DEFAULT_DATE_FORMAT] as string[],
  scanFolders: [] as string[],
  excludeFolders: [".trash"] as string[],
  groups: [] as IDateNoteGroup[],
  showNoteCount: true,
  newNoteFolder: "",

  showWeeklyNote: false,
  weeklyNoteFormat: "",
  weeklyNoteTemplate: "",
  weeklyNoteFolder: "",

  localeOverride: "system-default",
});

export function appHasPeriodicNotesPluginLoaded(): boolean {
  // periodic-notes 插件无公开类型定义，这里用最小结构断言而非 any
  type PeriodicNotesPlugin = {
    settings?: { weekly?: { enabled?: boolean } };
  } | null;
  const periodicNotes = (
    window.app as unknown as {
      plugins: { getPlugin(id: string): PeriodicNotesPlugin };
    }
  ).plugins.getPlugin("periodic-notes");
  return !!periodicNotes?.settings?.weekly?.enabled;
}

/** textarea <-> string[] */
function linesToArray(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function arrayToLines(value: string[] | undefined): string {
  return (value || []).join("\n");
}

function newGroupId(): string {
  return "g" + Math.random().toString(36).slice(2, 10);
}

export class CalendarSettingsTab extends PluginSettingTab {
  private plugin: CalendarPlugin;
  private groupsEl: HTMLElement | null = null;

  constructor(app: App, plugin: CalendarPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ================= 日期笔记 =================
    new Setting(containerEl).setName(t.settings.dateNotesHeading).setHeading();

    new Setting(containerEl)
      .setName(t.settings.dateFormats)
      .addTextArea((text) => {
        text.inputEl.rows = 3;
        text.inputEl.addClass("ahui-calendar-textarea");
        text.setPlaceholder(DEFAULT_DATE_FORMAT);
        text.setValue(arrayToLines(this.plugin.options.dateFormats));
        text.onChange(async (value) => {
          await this.plugin.writeOptions(() => ({
            dateFormats: linesToArray(value),
          }));
        });
      });

    new Setting(containerEl)
      .setName(t.settings.scanFolders)
      .addTextArea((text) => {
        text.inputEl.rows = 3;
        text.inputEl.addClass("ahui-calendar-textarea");
        text.setPlaceholder("（整个库）");
        text.setValue(arrayToLines(this.plugin.options.scanFolders));
        text.onChange(async (value) => {
          await this.plugin.writeOptions(() => ({
            scanFolders: linesToArray(value),
          }));
        });
      });

    new Setting(containerEl)
      .setName(t.settings.excludeFolders)
      .addTextArea((text) => {
        text.inputEl.rows = 3;
        text.inputEl.addClass("ahui-calendar-textarea");
        text.setPlaceholder(".trash");
        text.setValue(arrayToLines(this.plugin.options.excludeFolders));
        text.onChange(async (value) => {
          await this.plugin.writeOptions(() => ({
            excludeFolders: linesToArray(value),
          }));
        });
      });

    new Setting(containerEl)
      .setName(t.settings.showNoteCount)
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.showNoteCount);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions(() => ({ showNoteCount: value }));
        });
      });

    new Setting(containerEl)
      .setName(t.settings.newNoteFolder)
      .addText((text) => {
        text.setPlaceholder("（沿用 Daily Notes 设置）");
        text.setValue(this.plugin.options.newNoteFolder);
        text.onChange(async (value) => {
          await this.plugin.writeOptions(() => ({
            newNoteFolder: value.trim(),
          }));
        });
      });

    // ================= 分组 =================
    new Setting(containerEl).setName(t.settings.groupsHeading).setHeading();

    this.groupsEl = containerEl.createDiv("ahui-calendar-groups");
    this.renderGroups();

    new Setting(containerEl).addButton((button) => {
      button
        .setButtonText(t.settings.addGroup)
        .setCta()
        .onClick(async () => {
          const groups = [...(this.plugin.options.groups || [])];
          groups.push({
            id: newGroupId(),
            name: "新分组",
            folder: "",
            includeSubfolders: true,
          });
          await this.plugin.writeOptions(() => ({ groups }));
          this.renderGroups();
        });
    });

    // ================= 其它（沿用上游）=================
    new Setting(containerEl).setName(t.settings.generalHeading).setHeading();
    this.addWeekStartSetting();
    this.addConfirmCreateSetting();
    this.addShowWeeklyNoteSetting();

    if (
      this.plugin.options.showWeeklyNote &&
      !appHasPeriodicNotesPluginLoaded()
    ) {
      new Setting(containerEl).setName(t.settings.weeklyHeading).setHeading();
      this.addWeeklyNoteFormatSetting();
      this.addWeeklyNoteTemplateSetting();
      this.addWeeklyNoteFolderSetting();
    }

    new Setting(containerEl).setName(t.settings.advancedHeading).setHeading();
    this.addLocaleOverrideSetting();
  }

  private renderGroups(): void {
    const groupsEl = this.groupsEl;
    if (!groupsEl) return;
    groupsEl.empty();

    const groups = this.plugin.options.groups || [];

    if (groups.length === 0) {
      groupsEl.createEl("p", {
        cls: "setting-item-description",
        text: t.settings.noGroups,
      });
      return;
    }

    groups.forEach((group, index) => {
      new Setting(groupsEl)
        .addText((text) => {
          text.setPlaceholder(t.settings.groupNamePlaceholder);
          text.setValue(group.name);
          text.onChange(async (value) => {
            await this.updateGroup(index, { name: value });
          });
        })
        .addText((text) => {
          text.setPlaceholder(t.settings.groupFolderPlaceholder);
          text.inputEl.addClass("ahui-calendar-folder-input");
          text.setValue(group.folder);
          text.onChange(async (value) => {
            await this.updateGroup(index, { folder: value.trim() });
          });
        })
        .addToggle((toggle) => {
          toggle.setTooltip(t.settings.includeSubfolders);
          toggle.setValue(group.includeSubfolders);
          toggle.onChange(async (value) => {
            await this.updateGroup(index, { includeSubfolders: value });
          });
        })
        .addExtraButton((button) => {
          button
            .setIcon("trash")
            .setTooltip(t.settings.deleteGroup)
            .onClick(async () => {
              const next = [...(this.plugin.options.groups || [])];
              next.splice(index, 1);
              await this.plugin.writeOptions(() => ({ groups: next }));
              this.renderGroups();
            });
        });
    });
  }

  private async updateGroup(
    index: number,
    patch: Partial<IDateNoteGroup>
  ): Promise<void> {
    const next = [...(this.plugin.options.groups || [])];
    next[index] = { ...next[index], ...patch };
    await this.plugin.writeOptions(() => ({ groups: next }));
  }

  addWeekStartSetting(): void {
    const { moment } = window;

    const localizedWeekdays = moment.weekdays();
    const localeWeekStartNum = window._bundledLocaleWeekSpec.dow;
    const localeWeekStart = moment.weekdays()[localeWeekStartNum];

    new Setting(this.containerEl)
      .setName("每周起始日")
      .addDropdown((dropdown) => {
        dropdown.addOption("locale", `跟随系统（${localeWeekStart}）`);
        localizedWeekdays.forEach((day, i) => {
          dropdown.addOption(weekdays[i], day);
        });
        dropdown.setValue(this.plugin.options.weekStart);
        dropdown.onChange(async (value) => {
          await this.plugin.writeOptions(() => ({
            weekStart: value as IWeekStartOption,
          }));
        });
      });
  }

  addConfirmCreateSetting(): void {
    new Setting(this.containerEl)
      .setName("新建前确认")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.shouldConfirmBeforeCreate);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions(() => ({
            shouldConfirmBeforeCreate: value,
          }));
        });
      });
  }

  addShowWeeklyNoteSetting(): void {
    new Setting(this.containerEl)
      .setName("显示周数")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.showWeeklyNote);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions(() => ({ showWeeklyNote: value }));
          this.display(); // show/hide weekly settings
        });
      });
  }

  addWeeklyNoteFormatSetting(): void {
    new Setting(this.containerEl)
      .setName("周记文件名格式")
      .addText((textfield) => {
        textfield.setValue(this.plugin.options.weeklyNoteFormat);
        textfield.setPlaceholder(DEFAULT_WEEK_FORMAT);
        textfield.onChange(async (value) => {
          await this.plugin.writeOptions(() => ({ weeklyNoteFormat: value }));
        });
      });
  }

  addWeeklyNoteTemplateSetting(): void {
    new Setting(this.containerEl)
      .setName("周记模板")
      .addText((textfield) => {
        textfield.setValue(this.plugin.options.weeklyNoteTemplate);
        textfield.onChange(async (value) => {
          await this.plugin.writeOptions(() => ({ weeklyNoteTemplate: value }));
        });
      });
  }

  addWeeklyNoteFolderSetting(): void {
    new Setting(this.containerEl)
      .setName("周记文件夹")
      .addText((textfield) => {
        textfield.setValue(this.plugin.options.weeklyNoteFolder);
        textfield.onChange(async (value) => {
          await this.plugin.writeOptions(() => ({ weeklyNoteFolder: value }));
        });
      });
  }

  addLocaleOverrideSetting(): void {
    const { moment } = window;

    const sysLocale = navigator.language?.toLowerCase();

    new Setting(this.containerEl)
      .setName("语言 / 区域")
      .addDropdown((dropdown) => {
        dropdown.addOption("system-default", `跟随系统（${sysLocale}）`);
        moment.locales().forEach((locale) => {
          dropdown.addOption(locale, locale);
        });
        dropdown.setValue(this.plugin.options.localeOverride);
        dropdown.onChange(async (value) => {
          await this.plugin.writeOptions(() => ({
            localeOverride: value,
          }));
        });
      });
  }
}
