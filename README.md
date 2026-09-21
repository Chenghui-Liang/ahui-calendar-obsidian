# Ahui Calendar

**English** | [简体中文](./README.zh-CN.md)

> An Obsidian calendar view that supports **multiple date notes per day**, grouped by folder.

This project is a fork of [liamcain/obsidian-calendar-plugin](https://github.com/liamcain/obsidian-calendar-plugin) (MIT). It keeps every feature of the original plugin and reworks the part that matters for one specific scenario: **several notes named after the same date, spread across different folders**.

---

## Why this fork exists

The upstream Calendar plugin indexes date notes as `Record<date, file>` — **only one note per day can ever be indexed**. When scanning, files encountered later with the same date silently overwrite earlier ones, and the overwritten notes become unreachable from the calendar.

If you spread notes across folders by topic, for example:

```
Reading/raw/2026-09-15.md
Research/raw/archived/2026-09-15.md
Work/raw/archived/2026-09-15.md
```

the original plugin only ever sees one of them. Measured on a real vault of 852 notes:

| Scope | Actual files | Visible in upstream | Lost |
|---|---|---|---|
| 2026-09 | 25 files / 18 days | 18 days | **7 files** |
| Entire vault | 98 files / 85 days | 85 days | **13 files** |

This fork surfaces all of them, and shows at a glance how many notes each day has and which folder each one belongs to.

## Features

- **Any number of date notes per day**; solid dots on each calendar cell show the note count for that day (up to 5)
- A **persistent "notes of the day" list below the calendar**, grouped by folder; click to open, `Ctrl/Cmd + click` to open in a new split
- The list automatically follows when you switch to any date note in the editor
- **Custom date file name formats**, multiple formats supported
- **Folder-based groups**, with an optional include-subfolders flag; when several groups match, the most specific path wins
- Configurable scan scope and excluded folders
- All upstream features retained: week numbers, task dots, tag attributes, hover preview, drag & drop, etc.

## Installation

### Manual

1. Download this repository (or `git clone` it)
2. Copy `main.js`, `manifest.json` and `styles.css` into:

   ```
   <your-vault>/.obsidian/plugins/ahui-calendar/
   ```

3. Obsidian → Settings → Community plugins → enable **Ahui Calendar**

> ⚠️ **This plugin registers the same view type (`calendar`) as the original Calendar plugin, so the two cannot be enabled at the same time.**
> Disable the original Calendar plugin first, otherwise both will fight over the same calendar pane.

### BRAT

Add this repository to [BRAT](https://github.com/TfTHacker/obsidian42-brat).

## Settings

| Setting | Description |
|---|---|
| Date file name formats | One moment.js format per line, default `YYYY-MM-DD` |
| Scan scope | One folder path per line; empty means the whole vault |
| Excluded folders | One per line, `.trash` excluded by default |
| Show note count | Whether calendar cells show the daily note count as dots |
| New note folder | Where new date notes are created on an empty day; leave empty to follow the Daily Notes plugin settings |
| Groups | Name + folder path + whether subfolders are included |

> The dots now mean "number of notes on that day" instead of "word count". The old word-count-per-dot setting has been removed accordingly.

## Development

```bash
npm install
npm run build     # produces main.js
npm run dev       # watch mode
```

**Note**: `npm run lint` will fail because the `obsidian` API typings it depends on use TypeScript 4.5+ syntax while this project is pinned to TypeScript 4.2.3. **This does not affect `npm run build`**, which completes normally.

### Source layout

```
src/
├── main.ts                    Plugin entry; index rebuilds, event scheduling
├── settings.ts                Settings definitions + settings tab
├── constants.ts
├── i18n.ts                    UI strings (currently Chinese)
├── view.ts                    Calendar view: calendar on top, day note list below
├── io/
│   ├── dateNotesIndex.ts      ★ One-to-many date notes index (core change)
│   ├── dailyNotes.ts
│   └── weeklyNotes.ts
└── ui/
    ├── Calendar.svelte
    ├── stores.ts
    ├── sources/               Data sources for calendar cells
    │   ├── streak.ts          ★ Dots = number of date notes that day
    │   ├── tasks.ts
    │   ├── tags.ts
    │   └── wordCount.ts       (no longer registered, kept for reference)
    ├── fileMenu.ts
    ├── modal.ts
    └── utils.ts
```

## Known limitations

- Only the "day" granularity is supported. Year-level (`2026.md`) or month-level (`2026-09.md`) files cannot be represented as calendar cells
  (a month format would be parsed as the 1st of that month, which is semantically wrong).
- UI strings are currently Chinese only.

## License

[MIT](LICENSE). Original plugin copyright belongs to [Liam Cain](https://github.com/liamcain).
