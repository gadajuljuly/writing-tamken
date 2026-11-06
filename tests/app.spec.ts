import { test, expect, type Page, type BrowserContext, type Browser } from "@playwright/test";

async function register(browser: Browser, name: string, email: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: "عضو جديد؟ أنشئ حسابًا" }).click();
  await page.getByLabel("الاسم الكامل").fill(name);
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill("secret123");
  await page.getByLabel("رمز اللجنة").fill("test-code");
  await page.getByRole("button", { name: "إنشاء حساب" }).click();
  await page.waitForURL("**/ar");
  return { ctx, page };
}

async function addTask(page: Page, axis: number, title: string, opts: { assignees?: string[] } = {}) {
  await page.getByTestId(`axis-${axis}`).getByRole("button", { name: /إضافة مهمة أخرى|הוספת משימה נוספת/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input[name=title]").fill(title);
  for (const a of opts.assignees ?? []) await dialog.getByRole("button", { name: a, exact: true }).click();
  await dialog.getByRole("button", { name: /^(حفظ|שמירה)$/ }).click();
}

const task = (page: Page, title: string) => page.locator(`[data-testid=task][data-title="${title}"]`);

test.describe.configure({ mode: "serial" });

let A: { ctx: BrowserContext; page: Page };
let B: { ctx: BrowserContext; page: Page };

test.beforeAll(async ({ browser }) => {
  A = await register(browser, "غادة جلجولي", "ghada@example.com");
  B = await register(browser, "رنا مروات", "rana@example.com");
});

test("wrong signup code is rejected", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "عضو جديد؟ أنشئ حسابًا" }).click();
  await page.getByLabel("الاسم الكامل").fill("X");
  await page.getByLabel("البريد الإلكتروني").fill("x@example.com");
  await page.getByLabel("كلمة المرور").fill("secret123");
  await page.getByLabel("رمز اللجنة").fill("wrong");
  await page.getByRole("button", { name: "إنشاء حساب" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("رمز اللجنة غير صحيح");
});

test("add tasks with several assignees, change status, progress is computed", async () => {
  const { page } = A;
  await page.goto("/ar/tasks");
  await expect(page.getByTestId("axis-6")).toBeVisible();
  await addTask(page, 1, "حجز قاعة حفل التتويج", { assignees: ["غادة جلجولي", "تمارا مصطفى"] });
  await addTask(page, 3, "إعداد مئشار التقييم");
  await expect(task(page, "حجز قاعة حفل التتويج")).toContainText("تمارا مصطفى");
  await expect(task(page, "حجز قاعة حفل التتويج")).toContainText("غادة جلجولي");

  // status: red → yellow → green (and the other task is still red)
  const t1 = task(page, "حجز قاعة حفل التتويج");
  await t1.locator("button[data-status=in_progress]").click();
  await expect(t1).toHaveClass(/in_progress/);
  await t1.locator("button[data-status=done]").click();
  await expect(t1).toHaveClass(/ done/);
  await expect(task(page, "إعداد مئشار التقييم")).toHaveClass(/not_started/);

  // notes stay editable after the task is done
  await t1.getByLabel("ملاحظات").fill("تم الحجز ليوم الخميس");
  await t1.getByLabel("ملاحظات").blur();
  await expect(t1.getByText("تم الحفظ")).toBeVisible();

  // completion date appears automatically; no "who clicked done" is shown on the task
  await t1.getByRole("button", { name: "حجز قاعة حفل التتويج" }).click();
  await expect(t1).toContainText("أُنجزت");
  await expect(t1.locator(".task-meta")).not.toContainText("رنا مروات");

  await page.goto("/ar");
  await expect(page.getByTestId("overall-percent")).toHaveText("50%");
  await expect(page.getByTestId("count-done")).toHaveText("1");
  await expect(page.getByTestId("count-not_started")).toHaveText("1");
  await expect(page.getByTestId("count-in_progress")).toHaveText("0");
});

test("duplicates are prevented (also with spelling variants)", async () => {
  const { page } = A;
  await page.goto("/ar/tasks");
  await addTask(page, 2, "حجز قاعه حفل التتويج"); // ة → ه variant
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("توجد مهمة مشابهة بالفعل");
  await page.getByRole("dialog").getByRole("button", { name: "إلغاء" }).click();
  await expect(page.locator("[data-testid=task]")).toHaveCount(2);
});

test("any member can update status; changes sync to other users; history shows who/when/what", async () => {
  await B.page.goto("/ar/tasks");
  const t2 = task(B.page, "إعداد مئشار التقييم");
  await t2.locator("button[data-status=in_progress]").click();
  await expect(t2).toHaveClass(/in_progress/);

  await A.page.goto("/ar/tasks");
  await expect(task(A.page, "إعداد مئشار التقييم")).toHaveClass(/in_progress/);

  await A.page.goto("/ar/history");
  const row = A.page.locator("tr", { hasText: "إعداد مئشار التقييم" }).first();
  await expect(row).toContainText("رنا مروات");
  await expect(row).toContainText("قيد التنفيذ");
});

test("attachments: link, suggestion and image", async () => {
  const { page } = A;
  await page.goto("/ar/tasks");
  const t1 = task(page, "حجز قاعة حفل التتويج");
  await t1.getByRole("button", { name: "حجز قاعة حفل التتويج" }).click();
  await t1.getByRole("button", { name: "رابط" }).click();
  await t1.getByPlaceholder("https://…").fill("https://example.com/hall");
  await t1.getByPlaceholder("اسم الرابط (اختياري)").fill("صفحة القاعة");
  await t1.getByRole("button", { name: "إضافة" }).click();
  await expect(t1.getByRole("link", { name: /صفحة القاعة/ })).toHaveAttribute("href", "https://example.com/hall");

  await t1.getByRole("button", { name: "اقتراح", exact: true }).click();
  await t1.getByPlaceholder("اكتب الاقتراح…").fill("نقترح قاعة البلدية");
  await t1.getByRole("button", { name: "إضافة" }).click();
  await expect(t1).toContainText("نقترح قاعة البلدية");

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await t1.getByTestId("task-file").setInputFiles({ name: "prize.png", mimeType: "image/png", buffer: png });
  await expect(t1.locator("img[alt='prize.png']")).toBeVisible();
  const src = await t1.locator("img[alt='prize.png']").getAttribute("src");
  const res = await page.request.get(src!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
});

let minuteUrl = "";

test("upload minutes, AI proposals are reviewed, only approved ones are added, duplicates blocked, tasks linked", async () => {
  const { page } = A;
  await page.goto("/ar/minutes");
  await page.getByRole("button", { name: "+ محضر جديد" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input[name=title]").fill("اجتماع اللجنة الأول");
  const text = [
    "حضر: غادة، رنا",
    "قرار: اعتماد موعد الحفل في أيار",
    "مهمة: طباعة شهادات التقدير | رنا مروات #5",
    "مهمة: دعوة كاتب ضيف #4",
    "مهمة: حجز قاعة حفل التتويج | غادة جلجولي #1", // already exists → duplicate
    "مهمة: مهمة بلا محور واضح",
  ].join("\n");
  await dialog.getByTestId("minute-file").setInputFiles({ name: "minutes.txt", mimeType: "text/plain", buffer: Buffer.from(text) });
  await dialog.getByRole("button", { name: "إنشاء" }).click();
  await page.waitForURL(/\/ar\/minutes\/\d+$/);
  minuteUrl = page.url();

  await expect(page.getByTestId("organize")).toContainText("TEST MODE");
  await page.getByTestId("organize").click();
  const sugg = page.getByTestId("suggestion");
  await expect(sugg).toHaveCount(4);
  await expect(page.locator("[data-testid=suggestion][data-state=duplicate]")).toHaveCount(1);
  // unclassified task goes to axis 6
  const unclassified = sugg.filter({ has: page.locator("input[value='مهمة بلا محور واضح']") });
  await expect(unclassified.getByLabel("المحور")).toHaveValue("6");

  // nothing has been added before approval
  await page.goto("/ar/tasks");
  await expect(page.locator("[data-testid=task]")).toHaveCount(2);

  // another member cannot approve
  await B.page.goto(minuteUrl);
  await expect(B.page.getByTestId("apply-suggestions")).toHaveCount(0);
  await expect(B.page.getByTestId("approve-minute")).toHaveCount(0);
  const id = minuteUrl.split("/").pop();
  const forbidden = await B.page.request.post(`/api/minutes/${id}/apply`, { data: { ids: [1, 2, 3] } });
  expect(forbidden.status()).toBe(403);

  // uploader approves two of them
  await page.goto(minuteUrl);
  await page.getByRole("checkbox", { name: "طباعة شهادات التقدير" }).check();
  await page.getByRole("checkbox", { name: "دعوة كاتب ضيف" }).check();
  await page.getByTestId("apply-suggestions").click();
  await expect(page.locator("[data-testid=suggestion][data-state=added]")).toHaveCount(2);

  await page.goto("/ar/tasks");
  await expect(page.locator("[data-testid=task]")).toHaveCount(4);
  await expect(page.getByTestId("axis-5")).toContainText("طباعة شهادات التقدير");
  await expect(page.getByTestId("axis-4")).toContainText("دعوة كاتب ضيف");
  const linked = task(page, "طباعة شهادات التقدير");
  await expect(linked).toContainText("رنا مروات");
  await linked.getByRole("button", { name: "طباعة شهادات التقدير" }).click();
  await expect(linked.getByRole("link", { name: "اجتماع اللجنة الأول" })).toBeVisible();

  // applying the same proposals again adds nothing
  const detail = await (await page.request.get(`/api/minutes/${id}`)).json();
  const doneIds = detail.suggestions.filter((s: any) => s.state !== "pending").map((s: any) => s.id);
  expect(doneIds).toHaveLength(3); // 2 added + 1 duplicate
  const again = await page.request.post(`/api/minutes/${id}/apply`, { data: { ids: doneIds } });
  expect((await again.json()).added).toBe(0);
  await page.goto("/ar/tasks");
  await expect(page.locator("[data-testid=task]")).toHaveCount(4);
});

test("minutes: review, approve (versions), edit stays pending, restore, archive, search", async () => {
  const { page } = A;
  await page.goto(minuteUrl);
  await expect(page.locator("textarea[name=m-decisions]")).toHaveValue("اعتماد موعد الحفل في أيار");
  await page.getByTestId("approve-minute").click();
  await expect(page.getByText("معتمد · النسخة 1").first()).toBeVisible();

  // B edits → pending until uploader approves
  await B.page.goto(minuteUrl);
  await B.page.locator("textarea[name=m-notes]").fill("ملاحظة من رنا");
  await B.page.getByRole("button", { name: "حفظ المسودة" }).click();
  await expect(B.page.getByText("تعديلات بانتظار اعتماد رافع المحضر").first()).toBeVisible();

  await page.reload();
  await expect(page.locator("textarea[name=m-notes]")).toHaveValue("ملاحظة من رنا");
  await page.getByTestId("approve-minute").click();
  await expect(page.getByText("معتمد · النسخة 2").first()).toBeVisible();

  // restore version 1 into the draft
  await page.getByRole("button", { name: "استرجاع إلى المسودة" }).last().click();
  await expect(page.locator("textarea[name=m-notes]")).toHaveValue("");

  // search + archive
  await page.goto("/ar/minutes");
  await page.getByRole("searchbox").fill("أيار");
  await expect(page.getByRole("link", { name: "اجتماع اللجنة الأول" })).toBeVisible();
  await page.getByRole("searchbox").fill("لا يوجد هكذا نص");
  await expect(page.getByRole("link", { name: "اجتماع اللجنة الأول" })).toHaveCount(0);
  await page.getByRole("searchbox").fill("");
  await page.goto(minuteUrl);
  await page.getByRole("button", { name: "أرشفة" }).click();
  await page.goto("/ar/minutes");
  await expect(page.getByRole("link", { name: "اجتماع اللجنة الأول" })).toHaveCount(0);
  await page.getByLabel("عرض المؤرشف").check();
  await expect(page.getByRole("link", { name: "اجتماع اللجنة الأول" })).toBeVisible();
  await page.goto(minuteUrl);
  await page.getByRole("button", { name: "إلغاء الأرشفة" }).click();
  await expect(page.getByRole("button", { name: "أرشفة" })).toBeVisible();
});

test("approved proposal is documented in the minutes", async () => {
  const { page } = A;
  await page.goto("/ar/tasks");
  const t = task(page, "دعوة كاتب ضيف");
  await t.getByRole("button", { name: "دعوة كاتب ضيف" }).click();
  await t.getByRole("button", { name: "تعديل" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("تم اعتماد الاقتراح").check();
  await dialog.getByLabel("المحضر الذي وُثّق فيه القرار").selectOption({ label: "اجتماع اللجنة الأول" });
  await dialog.getByLabel("نص القرار").fill("استضافة الكاتب في الحفل");
  await dialog.getByRole("button", { name: "حفظ" }).click();
  await expect(t).toContainText("تم اعتماد الاقتراح");
  await page.goto(minuteUrl);
  await expect(page.locator("textarea[name=m-decisions]")).toContainText("تم اعتماد الاقتراح: دعوة كاتب ضيف — استضافة الكاتب في الحفل");
});

test("switching competitions keeps data separate (Hebrew UI, own tasks, own names)", async () => {
  const { page } = A;
  await page.goto("/ar/tasks");
  await page.getByTestId("lang-toggle").click();
  await page.waitForURL("**/he/tasks");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "תחרות הכתיבה" })).toBeVisible();
  await expect(page.getByText("גאדה ג'לג'ולי")).toBeVisible();
  await expect(page.getByTestId("axis-1")).toContainText("היערכות טכנית וארגונית");
  await expect(page.locator("[data-testid=task]")).toHaveCount(0);

  // Hebrew: add a new responsible person, saved for later use
  await page.getByTestId("axis-1").getByRole("button", { name: "+ הוספת משימה נוספת" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input[name=title]").fill("הזמנת אולם");
  await dialog.getByPlaceholder("שם אחראי/ת חדש/ה").fill("דנה לוי");
  await dialog.getByRole("button", { name: "הוספת שם" }).click();
  await expect(dialog.getByRole("button", { name: "דנה לוי" })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "שמירה" }).click();
  await expect(task(page, "הזמנת אולם")).toContainText("דנה לוי");

  // same title as an Arabic task is allowed here (separate data)
  await addTask(page, 1, "حجز قاعة حفل التتويج");
  await expect(page.locator("[data-testid=task]")).toHaveCount(2);

  await page.goto("/he");
  await expect(page.getByTestId("overall-percent")).toHaveText("0%");
  await page.goto("/he/minutes");
  await page.getByLabel("הצגת הארכיון").check();
  await expect(page.getByRole("link", { name: "اجتماع اللجنة الأول" })).toHaveCount(0);

  // Arabic side is unchanged; Arabic list has no free-text name adding
  await page.goto("/ar");
  await expect(page.getByTestId("overall-percent")).toHaveText("25%");
  const res = await page.request.post("/api/c/ar/members", { data: { name: "דנה לוי" } });
  expect(res.status()).toBe(403);
  // an Arabic minute cannot be opened under the Hebrew competition
  await page.goto(minuteUrl.replace("/ar/", "/he/"));
  await expect(page.locator(".error")).toBeVisible();
});

test("API requires login", async ({ request }) => {
  const res = await request.get("/api/c/ar/tasks");
  expect(res.status()).toBe(401);
});

test("Word and PDF minutes: text is extracted; WhatsApp paste works", async () => {
  const { page } = A;
  const upload = async (file: string, mime: string) => {
    const res = await page.request.post("/api/c/ar/minutes", {
      multipart: { sourceType: "file", title: file, file: { name: file, mimeType: mime, buffer: require("node:fs").readFileSync(`tests/fixtures/${file}`) } },
    });
    expect(res.status()).toBe(201);
    const { id } = await res.json();
    return (await (await page.request.get(`/api/minutes/${id}`)).json()).raw_text as string;
  };
  expect(await upload("minutes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toContain("مهمة: تصميم البوستر #2");
  expect(await upload("minutes.pdf", "application/pdf")).toContain("Task: print certificates");

  await page.goto("/ar/minutes");
  await page.getByRole("button", { name: "+ محضر جديد" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "لصق نص WhatsApp" }).click();
  await dialog.locator("textarea[name=text]").fill("[10:15] رنا: مهمة: تجهيز الهدايا #1");
  await dialog.getByRole("button", { name: "إنشاء" }).click();
  await page.waitForURL(/\/ar\/minutes\/\d+$/);
  await page.getByRole("button", { name: "النص الأصلي" }).click();
  await expect(page.locator("pre.raw")).toContainText("تجهيز الهدايا");
});
