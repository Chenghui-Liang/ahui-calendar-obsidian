import type { Moment } from "moment";
import { App, TFile, TAbstractFile } from "obsidian";
import { getDateUID } from "obsidian-daily-notes-interface";
import { writable, Writable } from "svelte/store";

import type { IDateNoteGroup, ISettings } from "src/settings";

/**
 * 一篇「日期笔记」：文件名符合配置的日期格式，且位于扫描范围内。
 *
 * 与上游 Calendar 插件的核心区别：上游用 Record<dateUID, TFile> 存，
 * 同一天只能留下一篇（后扫描到的覆盖先扫描到的）。这里改为
 * Record<dateUID, IDateNote[]>，一天可以挂任意多篇。
 */
export interface IDateNote {
  file: TFile;
  /** 命中的分组 id；未命中任何分组时为 null */
  groupId: string | null;
}

export type DateNotesByUID = Record<string, IDateNote[]>;

/** 未分组笔记在排序时的权重（排在所有分组之后） */
const UNGROUPED_ORDER = 9999;

const stripTrailingSlash = (p: string): string => (p || "").replace(/\/+$/, "");

/**
 * 格式里可能带子目录（例如 "YYYY/MM/YYYY-MM-DD"），与上游一致：
 * 只用最后一段去匹配文件名。
 */
export function normalizeDateFormat(format: string): string {
  return (format || "").split("/").pop() || "";
}

/** 用配置的多个格式依次尝试解析文件名，返回当天零点 */
export function parseDateFromBasename(
  basename: string,
  formats: string[]
): Moment | null {
  for (const format of formats) {
    if (!format) continue;
    const date = window.moment(basename, format, true);
    if (date.isValid()) {
      return date.startOf("day");
    }
  }
  return null;
}

/** 文件所在目录（库根为 ""） */
function folderOf(file: TFile): string {
  return file.parent ? file.parent.path : "";
}

/** 扫描范围过滤：先看排除，再看包含（包含为空 = 全库） */
export function isPathIncluded(
  folder: string,
  scanFolders: string[],
  excludeFolders: string[]
): boolean {
  for (const raw of excludeFolders || []) {
    const ex = stripTrailingSlash(raw);
    if (ex && (folder === ex || folder.startsWith(ex + "/"))) {
      return false;
    }
  }

  const scans = (scanFolders || []).map(stripTrailingSlash);
  if (scans.length === 0) return true;

  for (const sc of scans) {
    if (!sc) return true; // 空字符串代表库根，即全库
    if (folder === sc || folder.startsWith(sc + "/")) return true;
  }
  return false;
}

/** 找出命中的分组；多个分组命中时，取路径更长（更具体）的那个 */
export function matchGroupId(
  folder: string,
  groups: IDateNoteGroup[]
): string | null {
  let bestId: string | null = null;
  let bestLen = -1;

  for (const group of groups || []) {
    const gf = stripTrailingSlash(group.folder);
    if (!gf) continue;

    const hit = group.includeSubfolders
      ? folder === gf || folder.startsWith(gf + "/")
      : folder === gf;

    if (hit && gf.length > bestLen) {
      bestId = group.id;
      bestLen = gf.length;
    }
  }

  return bestId;
}

/**
 * 日期笔记索引。
 *
 * 全量重建成本很低（几千篇笔记量级），所以只在
 * 布局就绪 / 文件增删改名 / 设置变更时重建，不做逐文件增量。
 */
export class DateNotesIndex {
  private app: App;
  private notes: DateNotesByUID = {};
  private formats: string[] = [];

  public store: Writable<DateNotesByUID>;

  constructor(app: App) {
    this.app = app;
    this.store = writable<DateNotesByUID>({});
  }

  /** 重建索引 */
  public build(settings: ISettings): void {
    const formats = (settings.dateFormats || [])
      .map(normalizeDateFormat)
      .filter(Boolean);

    this.formats = formats;

    if (formats.length === 0) {
      this.notes = {};
      this.store.set({});
      return;
    }

    const scanFolders = settings.scanFolders || [];
    const excludeFolders = settings.excludeFolders || [];
    const groups = settings.groups || [];

    const groupOrder = new Map<string, number>();
    groups.forEach((g, i) => groupOrder.set(g.id, i));

    const byUid: DateNotesByUID = {};

    for (const file of this.app.vault.getMarkdownFiles()) {
      const folder = folderOf(file);
      if (!isPathIncluded(folder, scanFolders, excludeFolders)) continue;

      const date = parseDateFromBasename(file.basename, formats);
      if (!date) continue;

      const uid = getDateUID(date, "day");
      const entry: IDateNote = {
        file,
        groupId: matchGroupId(folder, groups),
      };

      if (!byUid[uid]) byUid[uid] = [];
      byUid[uid].push(entry);
    }

    // 排序：先按分组在设置里的顺序，再按路径，保证展示稳定
    for (const uid of Object.keys(byUid)) {
      byUid[uid].sort((a, b) => {
        const oa =
          a.groupId === null
            ? UNGROUPED_ORDER
            : groupOrder.has(a.groupId)
            ? (groupOrder.get(a.groupId) as number)
            : UNGROUPED_ORDER - 1;
        const ob =
          b.groupId === null
            ? UNGROUPED_ORDER
            : groupOrder.has(b.groupId)
            ? (groupOrder.get(b.groupId) as number)
            : UNGROUPED_ORDER - 1;
        if (oa !== ob) return oa - ob;
        return a.file.path.localeCompare(b.file.path);
      });
    }

    this.notes = byUid;
    this.store.set(byUid);
  }

  /** 应用设置后需要重建吗（格式 / 范围 / 分组变了就要） */
  public buildIfSettingsChanged(settings: ISettings): void {
    const formats = (settings.dateFormats || [])
      .map(normalizeDateFormat)
      .filter(Boolean);
    const same =
      formats.length === this.formats.length &&
      formats.every((f, i) => f === this.formats[i]);

    if (!same || Object.keys(this.notes).length === 0) {
      this.build(settings);
      return;
    }

    // 分组配置可能变了，重建一次最省心
    this.build(settings);
  }

  /** 某个日期的全部笔记（已排序） */
  public getNotes(date: Moment): IDateNote[] {
    return this.notes[getDateUID(date, "day")] || [];
  }

  /** 某个日期有几篇 */
  public getCount(date: Moment): number {
    return this.getNotes(date).length;
  }

  /** 当前索引快照（设置页统计用） */
  public snapshot(): DateNotesByUID {
    return this.notes;
  }

  /** 文件名解析出的日期（供「显示当前打开的笔记」用） */
  public getDateForFile(file: TFile | null): Moment | null {
    if (!file) return null;
    return parseDateFromBasename(file.basename, this.formats);
  }

  /** 该文件是否属于索引（同一天多篇时用于判断「哪篇被打开了」） */
  public has(file: TFile | null): boolean {
    if (!file) return false;
    return Object.values(this.notes).some((list) =>
      list.some((n) => n.file.path === file.path)
    );
  }
}

/** 文件名是否是日期笔记（供 vault 事件快速过滤） */
export function isDateNoteFile(file: TAbstractFile, index: DateNotesIndex): boolean {
  return file instanceof TFile && index.getDateForFile(file) !== null;
}
