قواعد کار روی این مخزن در [`AGENTS.md`](AGENTS.md) است.

**شروع از اینجا نیست.** یک فایل کوچک بخوانید و بس:
[`PROTOCOL.md`](PROTOCOL.md) — قواعد ثابت کار (کم‌مصرف، یک بار).

```bash
node tools/next.mjs
```

**همه‌چیز مستقیم روی `main`.** شاخهٔ تازه نسازید و PR باز نکنید مگر صاحب
پروژه صریحاً بخواهد: `git pull origin main`، کار، `node tools/check.mjs`،
کامیت، `git push origin main`. CI روی push به `main` اجرا می‌شود
(`node tools/ci.mjs`). کار را صاحب پروژه تعیین می‌کند؛ کارهای باز در
[`TASK_STATUS.md`](TASK_STATUS.md).
