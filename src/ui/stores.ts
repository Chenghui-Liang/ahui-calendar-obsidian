import type { TFile } from "obsidian";
import {
  getAllDailyNotes,
  getAllWeeklyNotes,
  getDateUID,
} from "obsidian-daily-notes-interface";
import { writable } from "svelte/store";

import { DateNotesIndex } from "src/io/dateNotesIndex";
import { defaultSettings, ISettings } from "src/settings";

import { getDateUIDFromFile } from "./utils";

function createDailyNotesStore() {
  const store = writable<Record<string, TFile>>({});
  return {
    reindex: () => {
      try {
        store.set(getAllDailyNotes());
      } catch {
        // daily notes 文件夹不存在/配置异常时按空处理，避免重复报错刷屏
        store.set({});
      }
    },
    ...store,
  };
}

function createWeeklyNotesStore() {
  const store = writable<Record<string, TFile>>({});
  return {
    reindex: () => {
      try {
        store.set(getAllWeeklyNotes());
      } catch {
        // weekly notes 文件夹不存在/配置异常时按空处理，避免重复报错刷屏
        store.set({});
      }
    },
    ...store,
  };
}

export const settings = writable<ISettings>(defaultSettings);
export const dailyNotes = createDailyNotesStore();
export const weeklyNotes = createWeeklyNotesStore();

/**
 * 日期笔记索引（一天可以有多篇）。
 *
 * 与 dailyNotes 并存：dailyNotes 仍供 Weekly / Tasks / Word count
 * 等沿用单一日记逻辑的模块使用，dateNotesIndex 负责「一对多」场景。
 */
export const dateNotesIndex = new DateNotesIndex(window.app);

/** 某个日期 -> 该日期的全部日期笔记（已排序） */
export const dateNotes = dateNotesIndex.store;

function createSelectedFileStore() {
  const store = writable<string>(null);

  return {
    setFile: (file: TFile) => {
      // 先用索引解析（支持自定义日期格式），再回退到上游的单一格式逻辑
      const date = dateNotesIndex.getDateForFile(file);
      if (date) {
        store.set(getDateUID(date, "day"));
        return;
      }
      store.set(getDateUIDFromFile(file));
    },
    ...store,
  };
}

export const activeFile = createSelectedFileStore();
