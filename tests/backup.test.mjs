// Резервная копия (src/lib/backup.js, src/lib/zipStream.js). Запуск: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBackup, readBackup, planRestore, backupSummary, BACKUP_VERSION } from "../src/lib/backup.js";
import { createZipWriter, openZip, ZipError } from "../src/lib/zipStream.js";

const note = (id, extra = {}) => ({ id, title: `Заметка ${id}`, text: "текст", pinned: false, tags: [], archived: false, createdAt: 1, updatedAt: 10, ...extra });
const chat = (id, extra = {}) => ({ id, title: `Диалог ${id}`, messages: [{ role: "user", text: "привет", at: 5 }, { role: "ai", text: "здравствуйте", at: 6 }], createdAt: 1, updatedAt: 10, ...extra });
const item = (id, extra = {}) => ({ id, date: "2026-10-23", time: "10:00", title: `Дело ${id}`, place: "", createdAt: 1, updatedAt: 1, ...extra });
const sample = () => ({
  notes: [note("n1", { tags: ["дом"] }), note("n2", { pinned: true })],
  chats: [chat("c1")],
  schedule: [item("s1")],
  memory: [{ id: "m1", text: "Меня зовут Аня", always: false, createdAt: 1, updatedAt: 1 }],
  folders: [{ id: "f1", name: "Диплом", parent: null, createdAt: 1 }],
  files: [
    { id: "a1", name: "фото.jpg", cat: "photo", folder: "f1", mime: "image/jpeg", size: 5, addedAt: 1, path: "u/a1" },
    { id: "a2", name: "нет-содержимого.pdf", cat: "doc", folder: null, mime: "application/pdf", size: 7, addedAt: 2 },
  ],
  settings: { "nexa-theme": "light", "nexa-secret-token": "не должно попасть", "sb-auth": "x" },
});
const blobs = { a1: new Blob([new Uint8Array([1, 2, 3, 4, 5])]) };
const build = (opts = {}) => buildBackup({
  uid: "user-1", appVersion: "0.14.4", platform: "web", data: sample(), parts: new Set(["notes", "chats", "schedule", "memory", "files", "settings"]),
  withContent: true, getBlob: async (f) => blobs[f.id] || null, now: new Date("2026-10-22T10:00:00Z"), ...opts,
});
const asFile = async (blob) => new Blob([await blob.arrayBuffer()]); // как выбранный файл

test("ZIP: записали и прочитали, CRC и размеры сходятся", async () => {
  const z = createZipWriter();
  await z.add("data/a.json", '{"a":1}');
  await z.add("files/000000", new Blob([new Uint8Array(3 * 1024 * 1024).fill(7)])); // больше одного куска
  const zip = await openZip(z.finish());
  assert.deepEqual([...zip.entries.keys()], ["data/a.json", "files/000000"]);
  assert.equal(await zip.text("data/a.json"), '{"a":1}');
  assert.equal((await zip.read("files/000000")).size, 3 * 1024 * 1024);
  await assert.rejects(z.add("../evil", "x"), (e) => e.code === "bad_name");
});

test("копия: что внутри, полнота, чужие настройки не берутся", async () => {
  const { blob, manifest } = await build();
  assert.equal(manifest.version, BACKUP_VERSION);
  assert.equal(manifest.complete, false); // у a2 нет содержимого
  assert.deepEqual(manifest.missing.map((m) => m.name), ["нет-содержимого.pdf"]);
  assert.match(manifest.source.owner, /^[0-9a-f]{64}$/); // id аккаунта не пишется, только отпечаток
  assert.ok(!JSON.stringify(manifest).includes("user-1"));
  const b = await readBackup(await asFile(blob));
  const s = backupSummary(b);
  assert.deepEqual([s.notes, s.chats, s.schedule, s.memory, s.folders, s.files, s.filesWithContent], [2, 1, 1, 1, 1, 2, 1]);
  assert.deepEqual(b.data.settings, { "nexa-theme": "light" });
  assert.ok(!("path" in b.data.files[0])); // путь в облаке не переносится
  const content = await b.contentOf(b.data.files[0].content);
  assert.deepEqual([...new Uint8Array(await content.arrayBuffer())], [1, 2, 3, 4, 5]);
});

test("скачивание получает исходную запись файла (с путём в облаке), а в копию путь не попадает", async () => {
  const seen = [];
  const { blob } = await build({ getBlob: async (f) => { seen.push(f.path); return blobs[f.id] || null; } });
  assert.deepEqual(seen, ["u/a1", undefined]);
  assert.ok(!(await new Response(blob).text()).includes("u/a1"));
});

test("без файлов: только сведения, содержимого в архиве нет", async () => {
  const { blob, manifest } = await build({ withContent: false });
  assert.equal(manifest.complete, true);
  const zip = await openZip(blob);
  assert.ok(![...zip.entries.keys()].some((n) => n.startsWith("files/")));
  const b = await readBackup(await asFile(blob));
  assert.equal(b.data.files.every((f) => f.content === null), true);
});

test("только выбранные части", async () => {
  const { blob } = await build({ parts: new Set(["notes"]) });
  const b = await readBackup(await asFile(blob));
  assert.deepEqual(backupSummary(b).present, ["notes"]);
});

test("отмена посреди сборки", async () => {
  const ctl = new AbortController(); ctl.abort();
  await assert.rejects(build({ signal: ctl.signal }), (e) => e instanceof ZipError && e.code === "abort");
});

test("повреждённый архив, чужой файл, посторонние записи, новый формат", async () => {
  const { blob } = await build();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // испортили байт содержимого первого файла: он первый в архиве, данные — после заголовка 30 байт и имени files/000000
  const broken = bytes.slice(); broken[30 + 12 + 1] ^= 0xff;
  const b = await readBackup(new Blob([broken]));
  await assert.rejects(b.contentOf(b.data.files[0].content), (e) => e.code === "corrupt");
  // обрезанный файл
  await assert.rejects(readBackup(new Blob([bytes.slice(0, bytes.length - 30)])), (e) => e.code === "corrupt");
  // вообще не архив
  await assert.rejects(readBackup(new Blob(["просто текст"])), (e) => e.code === "corrupt");
  // архив с посторонней записью
  const z = createZipWriter(); await z.add("manifest.json", "{}"); await z.add("evil.js", "alert(1)");
  await assert.rejects(readBackup(z.finish()), (e) => /посторонние/.test(e.message));
  // копия более новой версии формата
  const z2 = createZipWriter(); await z2.add("manifest.json", JSON.stringify({ format: "nexa-backup", version: BACKUP_VERSION + 1 }));
  await assert.rejects(readBackup(z2.finish()), (e) => e.code === "newer");
  // испорченные записи внутри JSON пропускаются, остальное читается
  const z3 = createZipWriter();
  await z3.add("manifest.json", JSON.stringify({ format: "nexa-backup", version: 1, parts: {} }));
  await z3.add("data/notes.json", JSON.stringify([note("ok"), { id: "../x", title: 5 }, "мусор", { __proto__: { polluted: 1 }, id: "p", title: "t", text: "x" }]));
  const r3 = await readBackup(z3.finish());
  assert.deepEqual(r3.data.notes.map((n) => n.id), ["ok", "p"]);
  assert.equal(({}).polluted, undefined);
  assert.match(r3.warnings[0], /пропущено повреждённых записей — 2/);
});

let seq = 0;
const newId = (kind) => (kind === "file" ? 9000 + ++seq : `new-${kind}-${++seq}`);

test("восстановление в пустой профиль того же аккаунта: id сохраняются", async () => {
  const b = await readBackup(await asFile((await build()).blob));
  const plan = planRestore({ current: {}, backup: b.data, parts: new Set(["notes", "chats", "schedule", "memory", "files"]), mode: "merge", sameOwner: true, newId });
  assert.deepEqual(plan.next.notes.map((n) => n.id), ["n1", "n2"]);
  assert.equal(plan.report.notes.added, 2);
  assert.deepEqual(plan.files.map((f) => [f.meta.id, f.action]), [["a1", "add"], ["a2", "skip"]]);
  assert.equal(plan.files[0].meta.folder, "f1");
});

test("объединение с заполненным профилем: новее — из копии, своё не пропадает, повтор не плодит дублей", async () => {
  const b = await readBackup(await asFile((await build()).blob));
  const current = { notes: [note("n1", { text: "моя новая версия", updatedAt: 99 }), note("mine")], schedule: [item("s1")] };
  const plan = planRestore({ current, backup: b.data, parts: new Set(["notes", "schedule"]), mode: "merge", sameOwner: true, newId });
  assert.deepEqual(plan.next.notes.map((n) => n.id), ["n1", "mine", "n2"]);
  assert.equal(plan.next.notes[0].text, "моя новая версия"); // у нас новее — не трогаем
  assert.deepEqual(plan.report.notes, { added: 1, updated: 0, same: 1, limit: 0, replaced: 0 });
  assert.equal(plan.report.schedule.same, 1);
});

test("замена: выбранная часть — ровно как в копии, файлы не удаляются", async () => {
  const b = await readBackup(await asFile((await build()).blob));
  const current = { notes: [note("mine")], files: [{ id: "keep", name: "своё.txt", size: 1 }] };
  const plan = planRestore({ current, backup: b.data, parts: new Set(["notes", "files"]), mode: "replace", sameOwner: true, newId });
  assert.deepEqual(plan.next.notes.map((n) => n.id), ["n1", "n2"]);
  assert.equal(plan.report.notes.replaced, 1);
  assert.ok(plan.files.every((f) => f.meta.id !== "keep")); // своё не трогаем, только добавляем
});

test("копия другого аккаунта (или гостя): новые id, ссылки на папки исправлены, одинаковое не дублируется", async () => {
  const b = await readBackup(await asFile((await build()).blob));
  const current = { notes: [note("x", { title: "Заметка n1", text: "текст" })] }; // такая же по содержимому, как n1
  const plan = planRestore({ current, backup: b.data, parts: new Set(["notes", "files"]), mode: "merge", sameOwner: false, newId });
  assert.equal(plan.report.notes.same, 1);
  assert.equal(plan.next.notes.length, 2);
  assert.ok(plan.next.notes[1].id.startsWith("new-notes-"));
  const newFolder = plan.next.folders[0];
  assert.ok(newFolder.id.startsWith("new-folders-"));
  assert.equal(plan.files[0].meta.folder, newFolder.id); // файл лежит в новой папке
  assert.ok(Number.isInteger(plan.files[0].meta.id)); // у гостя id файлов — числа
});
