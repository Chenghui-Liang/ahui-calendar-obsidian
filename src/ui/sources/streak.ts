import type { Moment } from "moment";
import type { ICalendarSource, IDayMetadata } from "obsidian-calendar-ui";
import { getWeeklyNote } from "obsidian-daily-notes-interface";
import { get } from "svelte/store";

import { MAX_DOTS_PER_DAY } from "src/constants";

import { dateNotesIndex, settings, weeklyNotes } from "../stores";
import { classList } from "../utils";

/**
 * 日历格上的日期笔记标记：**一天有几篇日期笔记，就显示几个实心圆点**。
 *
 * Note: 上游这里用 getDailyNote()，只反映「唯一一篇」的有无；
 * 改为读多对多索引，圆点数量 = 当天日期笔记篇数。
 */
export const streakSource: ICalendarSource = {
  getDailyMetadata: async (date: Moment): Promise<IDayMetadata> => {
    const count = dateNotesIndex.getCount(date);
    const showDots = get(settings).showNoteCount;

    const dots =
      showDots && count > 0
        ? Array.from({ length: Math.min(count, MAX_DOTS_PER_DAY) }, () => ({
            className: "date-note",
            isFilled: true,
          }))
        : [];

    return {
      classes: classList({ "has-note": count > 0 }),
      dots,
    };
  },

  getWeeklyMetadata: async (date: Moment): Promise<IDayMetadata> => {
    const file = getWeeklyNote(date, get(weeklyNotes));
    return {
      classes: classList({ "has-note": !!file }),
      dots: [],
    };
  },
};
