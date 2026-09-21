/**
 * 界面文案。
 *
 * 目前只有中文；要发布到社区时可以在这里加语言分支，
 * 所有界面文字都集中在这个文件，方便替换。
 */
export const t = {
  settings: {
    dateNotesHeading: "日期笔记",
    dateFormats: "日期文件名格式",
    scanFolders: "扫描范围",
    excludeFolders: "排除的文件夹",
    showNoteCount: "显示笔记数量",
    newNoteFolder: "新建笔记的文件夹",

    groupsHeading: "分组",
    addGroup: "添加分组",
    noGroups: "还没有分组。",
    groupNamePlaceholder: "分组名称",
    groupFolderPlaceholder: "文件夹路径",
    includeSubfolders: "包含子文件夹",
    deleteGroup: "删除分组",

    generalHeading: "通用",
    weeklyHeading: "周记设置",
    advancedHeading: "高级",
  },

  view: {
    noNotes: "这一天还没有笔记",
    create: "新建",
    count: (n: number) => `${n} 篇`,
    ungrouped: "未分组",
    openInNewSplitHint: "Ctrl / Cmd + 点击可在新分屏打开",
  },
};
